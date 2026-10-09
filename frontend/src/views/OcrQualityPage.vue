<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  downloadTrainingDataset,
  getOcrBenchmarkSummary,
  getTrainingDatasetSummary,
  getTrainingEvaluationSamples,
  getTrainingSampleImageFile,
  listOcrBenchmarkRuns,
  reserveFixedTestCohort,
  saveOcrBenchmarkRun,
  saveTrainingEvaluationBaseline,
  type OcrBenchmarkDocumentSummary,
  type OcrBenchmarkRunResponse,
  type TrainingEvaluationSampleResponse,
  type OcrBenchmarkSummaryResponse,
  type TrainingDatasetSummaryResponse,
} from '../services/api'
import {
  recognizePassportWithPaddle,
  recognizeTaiwanCompatriotPermitWithPaddle,
  recognizeTaiwanNationalIdWithPaddle,
  validateTaiwanNationalId,
  warmupPaddleOcr,
  OCR_PIPELINE_VERSION,
} from '../services/paddleOcr'

const benchmark =
  ref<OcrBenchmarkSummaryResponse | null>(null)
const training =
  ref<TrainingDatasetSummaryResponse | null>(null)
const fixedTestSamples =
  ref<TrainingEvaluationSampleResponse[]>([])
const fixedBenchmarkCount = computed(
  () =>
    fixedTestSamples.value.length ||
    training.value?.testCount ||
    0,
)
const loading = ref(true)
const exporting = ref(false)
const retesting = ref(false)
const retestProgress = ref({
  completed: 0,
  total: 0,
  message: '',
})
const retestResult = ref<RetestRunSummary | null>(null)
const benchmarkHistory =
  ref<OcrBenchmarkRunResponse[]>([])
const historyError = ref('')
const error = ref('')

const documentOrder = [
  'PASSPORT',
  'TAIWAN_COMPATRIOT_PERMIT',
  'TAIWAN_NATIONAL_ID',
]

const fieldsByDocumentType: Record<string, string[]> = {
  PASSPORT: [
    'nameZh',
    'nameEn',
    'birthDate',
    'gender',
    'nationality',
    'nationalIdNumber',
    'documentNumber',
    'issuingCountry',
    'expiryDate',
  ],
  TAIWAN_COMPATRIOT_PERMIT: [
    'nameZh',
    'birthDate',
    'gender',
    'documentNumber',
    'expiryDate',
  ],
  TAIWAN_NATIONAL_ID: [
    'nameZh',
    'birthDate',
    'gender',
    'documentNumber',
  ],
}

interface PassportNameDiagnosticSnapshot {
  rawTexts: string[]
  candidateTexts: string[]
}

interface RetestSampleOutcome {
  documentType: string
  hasExactOcrInput: boolean
  baselineFields: Record<string, string | null>
  currentFields: Record<string, string | null>
  groundTruth: Record<string, string | null>
  passportNameDiagnostics: PassportNameDiagnosticSnapshot[]
  baselinePipelineVersion: string | null
  totalMs: number
  orientationAttempts: number
}

interface RetestFieldSummary {
  field: string
  comparedCount: number
  baselineExactRate: number
  currentExactRate: number
  delta: number
}

interface PassportNameFailureSummary {
  incorrectCount: number
  selectorMissCount: number
  recognitionWrongCount: number
  notDetectedCount: number
}

interface RetestDocumentSummary {
  documentType: string
  sampleCount: number
  exactInputCount: number
  legacyInputCount: number
  baselinePipelineVersions: string[]
  legacyBaselineCount: number
  baselineFullExactRate: number
  currentFullExactRate: number
  fields: RetestFieldSummary[]
  medianTotalMs: number | null
  p90TotalMs: number | null
  orientationRetryRate: number
  passportNameFailures: PassportNameFailureSummary | null
}

interface RetestRunSummary {
  generatedAt: string
  pipelineVersion: string
  sampleCount: number
  failedCount: number
  baselineCreatedCount: number
  documents: RetestDocumentSummary[]
}

function parseJsonRecord(
  value: string,
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object'
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function stringOrNull(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  return String(value)
}

function normalizeEvalValue(
  field: string,
  value: string | null | undefined,
) {
  const text = value?.trim() ?? ''

  if (field === 'nameZh') {
    return text.replace(/\s+/g, '')
  }

  if (field === 'nameEn') {
    return text
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
  }

  if (
    field === 'nationalIdNumber' ||
    field === 'documentNumber'
  ) {
    return text
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
  }

  if (
    field === 'nationality' ||
    field === 'issuingCountry' ||
    field === 'gender'
  ) {
    return text.toUpperCase()
  }

  return text
}

function evalFieldEquals(
  field: string,
  actual: string | null | undefined,
  expected: string | null | undefined,
) {
  return (
    normalizeEvalValue(field, actual) ===
    normalizeEvalValue(field, expected)
  )
}

function formatIsoDate(
  year: number,
  month: number,
  day: number,
) {
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

function mrzBirthDateToIso(value: string) {
  if (!/^\d{6}$/.test(value)) return null

  const yy = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  const currentYear = new Date().getUTCFullYear()
  const currentTwoDigits = currentYear % 100
  const year =
    yy <= currentTwoDigits
      ? 2000 + yy
      : 1900 + yy

  return formatIsoDate(year, month, day)
}

function mrzExpiryDateToIso(value: string) {
  if (!/^\d{6}$/.test(value)) return null

  const yy = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  const currentYear = new Date().getUTCFullYear()
  const currentCentury =
    Math.floor(currentYear / 100) * 100
  let year = currentCentury + yy

  if (year < currentYear - 20) {
    year += 100
  }

  return formatIsoDate(year, month, day)
}

function passportNationalIdFromMrz(
  personalNumber: string,
  issuingState: string,
  nationality: string,
) {
  if (
    issuingState !== 'TWN' &&
    nationality !== 'TWN'
  ) {
    return null
  }

  const candidate = personalNumber
    .replace(/</g, '')
    .trim()
    .toUpperCase()

  return validateTaiwanNationalId(candidate)
    ? candidate
    : null
}

function evaluationBaselineFieldsForSample(
  sample: TrainingEvaluationSampleResponse,
) {
  if (!sample.evaluationBaselineJson) {
    return null
  }

  const payload =
    parseJsonRecord(sample.evaluationBaselineJson)

  if (
    payload.state === 'pending' ||
    !payload.fields ||
    typeof payload.fields !== 'object'
  ) {
    return null
  }

  const fields =
    payload.fields as Record<string, unknown>

  return Object.fromEntries(
    (fieldsByDocumentType[sample.documentType] ?? [])
      .map(field => [
        field,
        stringOrNull(fields[field]),
      ]),
  )
}

function evaluationBaselineVersionForSample(
  sample: TrainingEvaluationSampleResponse,
) {
  if (!sample.evaluationBaselineJson) {
    return null
  }

  const payload =
    parseJsonRecord(sample.evaluationBaselineJson)

  if (payload.state === 'pending') {
    return null
  }

  const version = stringOrNull(
    payload.pipelineVersion,
  )?.trim()

  return version || null
}

function groundTruthForSample(
  sample: TrainingEvaluationSampleResponse,
) {
  const ground =
    parseJsonRecord(sample.groundTruthJson)

  return Object.fromEntries(
    (fieldsByDocumentType[sample.documentType] ?? [])
      .map(field => [
        field,
        stringOrNull(ground[field]),
      ]),
  )
}

async function currentFieldsForSample(
  sample: TrainingEvaluationSampleResponse,
  file: File,
) {
  if (sample.documentType === 'PASSPORT') {
    const result =
      await recognizePassportWithPaddle(file)
    const parsed = result.parsedMrz

    return {
      fields: {
        nameZh: result.chineseName ?? '',
        nameEn: parsed
          ? [parsed.surname, parsed.givenNames]
              .filter(Boolean)
              .join(', ')
          : '',
        birthDate: parsed
          ? mrzBirthDateToIso(parsed.birthDate)
          : null,
        gender: parsed?.sex ?? '',
        nationality: parsed?.nationality ?? null,
        nationalIdNumber: parsed
          ? passportNationalIdFromMrz(
              parsed.personalNumber,
              parsed.issuingState,
              parsed.nationality,
            )
          : null,
        documentNumber:
          parsed?.documentNumber ?? '',
        issuingCountry:
          parsed?.issuingState ?? null,
        expiryDate: parsed
          ? mrzExpiryDateToIso(parsed.expiryDate)
          : null,
      } as Record<string, string | null>,
      passportNameDiagnostics:
        result.chineseNameDiagnostics.map(item => ({
          rawTexts: item.rawTexts,
          candidateTexts: item.candidateTexts,
        })),
      totalMs: result.totalMs,
      orientationAttempts:
        result.orientationAttempts ?? 1,
    }
  }

  if (
    sample.documentType ===
    'TAIWAN_COMPATRIOT_PERMIT'
  ) {
    const result =
      await recognizeTaiwanCompatriotPermitWithPaddle(
        file,
      )

    return {
      fields: {
        nameZh: result.chineseName || '',
        birthDate: result.birthDate || null,
        gender: result.sex || '',
        documentNumber:
          result.permitNumber || '',
        expiryDate: result.expiryDate || null,
      } as Record<string, string | null>,
      passportNameDiagnostics: [],
      totalMs: result.totalMs,
      orientationAttempts:
        result.orientationAttempts ?? 1,
    }
  }

  if (
    sample.documentType ===
    'TAIWAN_NATIONAL_ID'
  ) {
    const result =
      await recognizeTaiwanNationalIdWithPaddle(
        file,
      )

    return {
      fields: {
        nameZh: result.chineseName || '',
        birthDate: result.birthDate || null,
        gender: result.sex || '',
        documentNumber:
          result.nationalId || '',
      } as Record<string, string | null>,
      passportNameDiagnostics: [],
      totalMs: result.totalMs,
      orientationAttempts:
        result.orientationAttempts ?? 1,
    }
  }

  throw new Error(
    `不支援的 Test set 證件類型：${sample.documentType}`,
  )
}

function percentile(
  values: number[],
  fraction: number,
) {
  if (!values.length) return null

  const ordered = [...values].sort(
    (a, b) => a - b,
  )
  const index = Math.max(
    0,
    Math.min(
      ordered.length - 1,
      Math.ceil(ordered.length * fraction) - 1,
    ),
  )

  return ordered[index]
}

function passportNameFailureSummary(
  samples: RetestSampleOutcome[],
): PassportNameFailureSummary {
  const failures = samples.filter(sample =>
    !evalFieldEquals(
      'nameZh',
      sample.currentFields.nameZh,
      sample.groundTruth.nameZh,
    ),
  )

  let selectorMissCount = 0
  let recognitionWrongCount = 0
  let notDetectedCount = 0

  for (const sample of failures) {
    const expected = normalizeEvalValue(
      'nameZh',
      sample.groundTruth.nameZh,
    )

    const rawTexts =
      sample.passportNameDiagnostics.flatMap(
        item => item.rawTexts,
      )
    const candidateTexts =
      sample.passportNameDiagnostics.flatMap(
        item => item.candidateTexts,
      )

    const normalizedRaw = rawTexts.map(text =>
      text
        .replace(/\s+/g, '')
        .replace(
          /[，,。．.：:；;()（）\[\]【】]/g,
          '',
        ),
    )
    const normalizedCandidates =
      candidateTexts.map(text =>
        normalizeEvalValue('nameZh', text),
      )

    const expectedWasRead =
      Boolean(expected) &&
      (
        normalizedCandidates.includes(expected) ||
        normalizedRaw.some(text =>
          text === expected ||
          text.includes(expected)
        )
      )

    if (expectedWasRead) {
      selectorMissCount += 1
    } else if (normalizedCandidates.length > 0) {
      recognitionWrongCount += 1
    } else {
      notDetectedCount += 1
    }
  }

  return {
    incorrectCount: failures.length,
    selectorMissCount,
    recognitionWrongCount,
    notDetectedCount,
  }
}

function summarizeRetest(
  outcomes: RetestSampleOutcome[],
): RetestDocumentSummary[] {
  return documentOrder
    .map(documentType => {
      const samples = outcomes.filter(
        item =>
          item.documentType === documentType,
      )

      if (!samples.length) return null

      const fields =
        fieldsByDocumentType[documentType] ?? []
      const fieldSummaries =
        fields.map(field => {
          let compared = 0
          let baselineExact = 0
          let currentExact = 0

          for (const sample of samples) {
            const expected =
              sample.groundTruth[field] ?? null

            if (
              field === 'nationalIdNumber' &&
              documentType === 'PASSPORT' &&
              !normalizeEvalValue(
                field,
                expected,
              )
            ) {
              continue
            }

            compared += 1

            if (
              evalFieldEquals(
                field,
                sample.baselineFields[field],
                expected,
              )
            ) {
              baselineExact += 1
            }

            if (
              evalFieldEquals(
                field,
                sample.currentFields[field],
                expected,
              )
            ) {
              currentExact += 1
            }
          }

          const baselineRate =
            compared
              ? baselineExact / compared
              : 0
          const currentRate =
            compared
              ? currentExact / compared
              : 0

          return {
            field,
            comparedCount: compared,
            baselineExactRate: baselineRate,
            currentExactRate: currentRate,
            delta:
              currentRate - baselineRate,
          }
        })
        .filter(field => field.comparedCount > 0)

      let baselineFull = 0
      let currentFull = 0

      for (const sample of samples) {
        const applicableFields =
          fields.filter(field => {
            if (
              field === 'nationalIdNumber' &&
              documentType === 'PASSPORT'
            ) {
              return Boolean(
                normalizeEvalValue(
                  field,
                  sample.groundTruth[field],
                ),
              )
            }

            return true
          })

        if (
          applicableFields.every(field =>
            evalFieldEquals(
              field,
              sample.baselineFields[field],
              sample.groundTruth[field],
            ),
          )
        ) {
          baselineFull += 1
        }

        if (
          applicableFields.every(field =>
            evalFieldEquals(
              field,
              sample.currentFields[field],
              sample.groundTruth[field],
            ),
          )
        ) {
          currentFull += 1
        }
      }

      const times = samples.map(
        sample => sample.totalMs,
      )
      const retryCount = samples.filter(
        sample => sample.orientationAttempts > 1,
      ).length

      return {
        documentType,
        sampleCount: samples.length,
        exactInputCount:
          samples.filter(sample =>
            sample.hasExactOcrInput,
          ).length,
        legacyInputCount:
          samples.filter(sample =>
            !sample.hasExactOcrInput,
          ).length,
        baselinePipelineVersions:
          Array.from(
            new Set(
              samples
                .map(sample =>
                  sample.baselinePipelineVersion,
                )
                .filter(
                  (version): version is string =>
                    Boolean(version),
                ),
            ),
          ).sort(),
        legacyBaselineCount:
          samples.filter(sample =>
            !sample.baselinePipelineVersion,
          ).length,
        baselineFullExactRate:
          baselineFull / samples.length,
        currentFullExactRate:
          currentFull / samples.length,
        fields: fieldSummaries,
        medianTotalMs:
          percentile(times, 0.5),
        p90TotalMs:
          percentile(times, 0.9),
        orientationRetryRate:
          retryCount / samples.length,
        passportNameFailures:
          documentType === 'PASSPORT'
            ? passportNameFailureSummary(samples)
            : null,
      }
    })
    .filter(
      (
        item,
      ): item is RetestDocumentSummary =>
        item !== null,
    )
}

async function rerunTestSet() {
  if (
    retesting.value ||
    !fixedBenchmarkCount.value
  ) {
    return
  }

  retesting.value = true
  error.value = ''
  retestResult.value = null
  retestProgress.value = {
    completed: 0,
    total: fixedBenchmarkCount.value,
    message: '正在確認固定 Test cohort…',
  }

  const outcomes: RetestSampleOutcome[] = []
  let failed = 0
  let baselineCreated = 0

  try {
    await reserveFixedTestCohort()

    const samples =
      await getTrainingEvaluationSamples(
        'fixed-test',
      )

    retestProgress.value.total = samples.length

    await warmupPaddleOcr()

    for (
      let index = 0;
      index < samples.length;
      index += 1
    ) {
      const sample = samples[index]

      retestProgress.value = {
        completed: index,
        total: samples.length,
        message:
          `正在重測 ${documentLabel(
            sample.documentType,
          )} ${index + 1} / ${samples.length}`,
      }

      try {
        const file =
          await getTrainingSampleImageFile(
            sample.trainingSampleId,
          )
        const current =
          await currentFieldsForSample(
            sample,
            file,
          )

        let baselineFields =
          evaluationBaselineFieldsForSample(sample)
        let baselinePipelineVersion =
          evaluationBaselineVersionForSample(sample)

        if (!baselineFields) {
          const baselineJson = JSON.stringify({
            pipelineVersion: OCR_PIPELINE_VERSION,
            fields: current.fields,
            totalMs: current.totalMs,
            orientationAttempts:
              current.orientationAttempts,
          })

          await saveTrainingEvaluationBaseline(
            sample.trainingSampleId,
            baselineJson,
          )

          baselineFields = current.fields
          baselinePipelineVersion =
            OCR_PIPELINE_VERSION
          baselineCreated += 1
        }

        outcomes.push({
          documentType: sample.documentType,
          hasExactOcrInput:
            sample.hasExactOcrInput,
          baselineFields,
          currentFields: current.fields,
          groundTruth:
            groundTruthForSample(sample),
          passportNameDiagnostics:
            current.passportNameDiagnostics,
          baselinePipelineVersion,
          totalMs: current.totalMs,
          orientationAttempts:
            current.orientationAttempts,
        })
      } catch {
        failed += 1
      }

      retestProgress.value.completed =
        index + 1
    }

    const completedRun: RetestRunSummary = {
      generatedAt: new Date().toISOString(),
      pipelineVersion: OCR_PIPELINE_VERSION,
      sampleCount: outcomes.length,
      failedCount: failed,
      baselineCreatedCount: baselineCreated,
      documents: summarizeRetest(outcomes),
    }

    retestResult.value = completedRun

    try {
      const savedRun = await saveOcrBenchmarkRun({
        pipelineVersion:
          completedRun.pipelineVersion,
        sampleCount: completedRun.sampleCount,
        failedCount: completedRun.failedCount,
        baselineCreatedCount:
          completedRun.baselineCreatedCount,
        summaryJson: JSON.stringify(completedRun),
      })

      benchmarkHistory.value = [
        savedRun,
        ...benchmarkHistory.value.filter(
          run =>
            run.benchmarkRunId !==
            savedRun.benchmarkRunId,
        ),
      ].slice(0, 8)
      historyError.value = ''
    } catch (historyErr) {
      historyError.value =
        historyErr instanceof Error
          ? historyErr.message
          : 'Benchmark 歷史紀錄儲存失敗。'
    }

    fixedTestSamples.value =
      await getTrainingEvaluationSamples(
        'fixed-test',
      )

    if (baselineCreated > 0) {
      retestProgress.value.message =
        `已建立 ${baselineCreated} 張固定 Test 基準；之後重跑才會顯示公平版本差異。`
    } else {
      retestProgress.value.message =
        failed
          ? `Test set 重測完成；${failed} 張失敗。`
          : 'Test set 重測完成。'
    }
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : 'Test set 重測失敗。'
  } finally {
    retesting.value = false
  }
}


const documentCards = computed(() =>
  documentOrder.map(type => {
    const trainingSummary =
      training.value?.documents.find(
        item => item.documentType === type,
      ) ?? null

    return {
      type,
      benchmark:
        benchmark.value?.documents.find(
          item => item.documentType === type,
        ) ?? null,
      trainingCount:
        trainingSummary?.sampleCount ?? 0,
      trainCount:
        trainingSummary?.trainCount ?? 0,
      validationCount:
        trainingSummary?.validationCount ?? 0,
      testCount:
        trainingSummary?.testCount ?? 0,
    }
  }),
)

const errorAnalysisCards = computed(() =>
  documentCards.value
    .filter(
      card =>
        (card.benchmark?.scoredSampleCount ?? 0) >
        0,
    )
    .map(card => {
      const fields =
        card.benchmark?.fields
          .filter(field => field.comparedCount > 0)
          .slice()
          .sort(
            (a, b) =>
              a.exactMatchRate -
              b.exactMatchRate,
          ) ?? []

      const weakest = fields.slice(0, 3)
      const signals: string[] = []
      const diagnostic = new Map(
        (card.benchmark?.signals ?? []).map(
          signal => [signal.signal, signal],
        ),
      )

      const orientationRetry =
        diagnostic.get('orientationRetry')
      if (
        orientationRetry &&
        orientationRetry.positiveRate > 0.05
      ) {
        signals.push(
          `方向需重試 ${rate(
            orientationRetry.positiveRate,
          )}`,
        )
      }

      const structureComplete =
        diagnostic.get('structureComplete')
      if (
        structureComplete &&
        structureComplete.positiveRate < 0.9
      ) {
        signals.push(
          `MRZ 結構完整率 ${rate(
            structureComplete.positiveRate,
          )}`,
        )
      }

      const line1Valid =
        diagnostic.get('line1Valid')
      if (
        line1Valid &&
        line1Valid.positiveRate < 0.9
      ) {
        signals.push(
          `MRZ Line 1 有效率 ${rate(
            line1Valid.positiveRate,
          )}`,
        )
      }

      const idChecksum =
        diagnostic.get('idChecksumValid')
      if (
        idChecksum &&
        idChecksum.positiveRate < 0.95
      ) {
        signals.push(
          `身分證檢查碼通過率 ${rate(
            idChecksum.positiveRate,
          )}`,
        )
      }

      const mrzUsed =
        diagnostic.get('mrzUsed')
      if (
        mrzUsed &&
        mrzUsed.positiveRate > 0
      ) {
        signals.push(
          `MRZ 輔助使用率 ${rate(
            mrzUsed.positiveRate,
          )}`,
        )
      }

      const fallback =
        card.benchmark?.fallbackRate
      if (fallback && fallback > 0) {
        signals.push(
          `Fallback 使用率 ${rate(fallback)}`,
        )
      }

      const median =
        card.benchmark?.medianTotalMs
      const p90 =
        card.benchmark?.p90TotalMs

      if (
        median &&
        p90 &&
        p90 >= median * 1.8
      ) {
        signals.push(
          `尾端耗時偏高：P90 ${seconds(p90)}`,
        )
      }

      return {
        type: card.type,
        weakest,
        signals,
      }
    }),
)

function documentLabel(type: string) {
  if (type === 'PASSPORT') return '護照'
  if (type === 'TAIWAN_COMPATRIOT_PERMIT') {
    return '台胞證'
  }
  if (type === 'TAIWAN_NATIONAL_ID') {
    return '身分證'
  }
  return type
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    nameZh: '中文姓名',
    nameEn: '英文姓名',
    birthDate: '出生日期',
    gender: '性別',
    nationality: '國籍',
    nationalIdNumber: '身分證字號',
    documentNumber: '證件號碼',
    issuingCountry: '簽發國',
    expiryDate: '有效期限',
  }

  return labels[field] ?? field
}

function rate(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '—'
  }

  return `${Math.round(value * 100)}%`
}

function baselineVersionLabel(
  result: RetestDocumentSummary,
) {
  const versions =
    result.baselinePipelineVersions

  const versionLabel =
    versions.length === 0
      ? 'legacy / 未記錄'
      : versions.length === 1
        ? versions[0]
        : `${versions.length} 種版本`

  return result.legacyBaselineCount > 0
    ? `${versionLabel} + legacy ${result.legacyBaselineCount} 張`
    : versionLabel
}

function seconds(
  value: number | null | undefined,
) {
  if (value === null || value === undefined) {
    return '—'
  }

  return `${(value / 1000).toFixed(1)} 秒`
}

function sampleStatus(
  item: OcrBenchmarkDocumentSummary | null,
) {
  const count = item?.scoredSampleCount ?? 0

  if (count >= 100) return '可做第一輪正式分析'
  if (count >= 50) return '可做中期分析'
  if (count >= 20) return '正在累積'
  return '樣本不足'
}

function formatBenchmarkRunTime(
  value: string,
) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function splitPercent(
  count: number | null | undefined,
  total: number | null | undefined,
) {
  if (!count || !total) return '0%'
  return `${Math.round((count / total) * 100)}%`
}

async function load() {
  loading.value = true
  error.value = ''

  try {
    const [
      benchmarkData,
      trainingData,
      fixedTestData,
      historyData,
    ] = await Promise.all([
      getOcrBenchmarkSummary(),
      getTrainingDatasetSummary(),
      getTrainingEvaluationSamples(
        'fixed-test',
      ).catch(() => []),
      listOcrBenchmarkRuns(8).catch(() => []),
    ])

    benchmark.value = benchmarkData
    training.value = trainingData
    fixedTestSamples.value = fixedTestData
    benchmarkHistory.value = historyData
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : 'OCR 品質資料載入失敗。'
  } finally {
    loading.value = false
  }
}

async function exportDataset() {
  if (
    exporting.value ||
    !training.value?.sampleCount
  ) {
    return
  }

  exporting.value = true
  error.value = ''

  try {
    await downloadTrainingDataset()
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '訓練資料匯出失敗。'
  } finally {
    exporting.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="page-kicker">OCR QUALITY</p>
        <h1>OCR 品質</h1>
        <p>
          用人工審核結果當 ground truth，
          追蹤三種證件的準確率與辨識速度。
        </p>
      </div>

      <button
        type="button"
        class="secondary-action"
        :disabled="loading"
        @click="load"
      >
        重新整理
      </button>
    </header>

    <p
      v-if="error"
      class="error-message"
    >
      {{ error }}
    </p>

    <div
      v-if="loading"
      class="state-card"
    >
      正在統計 OCR 品質…
    </div>

    <template v-else>
      <section class="overview-grid">
        <div class="overview-card">
          <span>已審核樣本</span>
          <strong>
            {{ benchmark?.reviewedSampleCount ?? 0 }}
          </strong>
          <small>
            含舊資料；只有保存 originalFields
            的新資料可計算準確率。
          </small>
        </div>

        <div class="overview-card">
          <span>可評分樣本</span>
          <strong>
            {{ benchmark?.scoredSampleCount ?? 0 }}
          </strong>
          <small>
            這些樣本可比較 OCR 原始輸出與人工答案。
          </small>
        </div>

        <div class="overview-card training">
          <span>訓練資料集</span>
          <strong>
            {{ training?.sampleCount ?? 0 }}
          </strong>
          <small>
            只有人工明確勾選保留的證件照片。
          </small>
        </div>
      </section>

      <section class="split-card">
        <div class="split-copy">
          <p class="page-kicker">
            DATASET SPLIT
          </p>
          <h2>固定資料切分</h2>
          <p>
            以旅客為群組做穩定 70 / 15 / 15 切分。
            同一位旅客的護照、台胞證與多張照片不會跨到不同資料集，
            避免 Train 看過同一個人後又在 Test 被重複計分。
          </p>
        </div>

        <div class="split-stats">
          <div>
            <span>Train</span>
            <strong>{{ training?.trainCount ?? 0 }}</strong>
            <small>
              {{
                splitPercent(
                  training?.trainCount,
                  training?.sampleCount,
                )
              }}
            </small>
          </div>
          <div>
            <span>Validation</span>
            <strong>
              {{ training?.validationCount ?? 0 }}
            </strong>
            <small>
              {{
                splitPercent(
                  training?.validationCount,
                  training?.sampleCount,
                )
              }}
            </small>
          </div>
          <div>
            <span>Test</span>
            <strong>{{ training?.testCount ?? 0 }}</strong>
            <small>
              {{
                splitPercent(
                  training?.testCount,
                  training?.sampleCount,
                )
              }}
            </small>
          </div>
        </div>
      </section>

      <section class="retest-card">
        <div class="retest-copy">
          <p class="page-kicker">
            CURRENT TEST BENCHMARK
          </p>
          <h2>用最新版 OCR 重跑固定 Test set</h2>
          <p>
            不建立旅客、不修改人工答案，也不把 Test 資料拿去訓練。
            第一次建立基準時會先凍結當下完整 Test cohort，
            再開始逐張跑 OCR；即使中途失敗或關閉頁面，
            下次仍會從同一批固定樣本繼續。之後新增的 Test 樣本
            不會自動擴張固定比較集合。
          </p>
          <small>
            舊樣本當時沒有保存 OCR 工作圖片，只能用人工審核影像做
            recognition / parser 回歸測試；從新版開始新增的樣本會保留
            OCR 當下實際輸入，因此可做完整 pipeline 的公平比較。
          </small>
        </div>

        <div class="retest-action">
          <button
            type="button"
            class="primary-action"
            :disabled="
              retesting ||
              !fixedBenchmarkCount
            "
            @click="rerunTestSet"
          >
            {{
              retesting
                ? '重測中…'
                : `重跑 Test ${fixedBenchmarkCount} 張`
            }}
          </button>

          <div
            v-if="
              retesting ||
              retestProgress.completed
            "
            class="retest-progress"
          >
            <div>
              <span>
                {{ retestProgress.message }}
              </span>
              <strong>
                {{ retestProgress.completed }}
                /
                {{ retestProgress.total }}
              </strong>
            </div>
            <progress
              :max="Math.max(1, retestProgress.total)"
              :value="retestProgress.completed"
            ></progress>
          </div>
        </div>

        <div
          v-if="
            retestResult?.baselineCreatedCount
          "
          class="baseline-created-note"
        >
          這次已建立
          <strong>
            {{ retestResult.baselineCreatedCount }}
          </strong>
          張固定 Test 基準。因為「固定基準」就是這次的最新版結果，
          第一次看到的差異會是 0%；從下一次修改 OCR 後重跑，
          才會開始顯示公平的版本進步／退步。
        </div>

        <div
          v-if="retestResult"
          class="retest-results"
        >
          <article
            v-for="result in retestResult.documents"
            :key="result.documentType"
          >
            <header>
              <div>
                <strong>
                  {{ documentLabel(result.documentType) }}
                </strong>
                <span>
                  Test n={{ result.sampleCount }}
                </span>
                <small>
                  精確輸入 {{ result.exactInputCount }} ·
                  舊版標準化 {{ result.legacyInputCount }}
                </small>
                <small>
                  固定基準 {{ baselineVersionLabel(result) }} ·
                  目前 {{ retestResult.pipelineVersion }}
                </small>
              </div>
              <div class="retest-full-rate">
                <small>整張完全正確</small>
                <span>
                  {{
                    rate(
                      result.baselineFullExactRate,
                    )
                  }}
                  →
                  <strong>
                    {{
                      rate(
                        result.currentFullExactRate,
                      )
                    }}
                  </strong>
                </span>
              </div>
            </header>

            <div class="retest-field-list">
              <div
                v-for="field in result.fields"
                :key="field.field"
              >
                <span>
                  {{ fieldLabel(field.field) }}
                </span>
                <span>
                  {{
                    rate(
                      field.baselineExactRate,
                    )
                  }}
                  →
                  <strong>
                    {{
                      rate(
                        field.currentExactRate,
                      )
                    }}
                  </strong>
                </span>
                <em
                  :class="{
                    positive: field.delta > 0,
                    negative: field.delta < 0,
                  }"
                >
                  {{
                    field.delta > 0
                      ? '+'
                      : ''
                  }}{{
                    Math.round(
                      field.delta * 100,
                    )
                  }}%
                </em>
              </div>
            </div>

            <div
              v-if="
                result.documentType === 'PASSPORT' &&
                result.passportNameFailures?.incorrectCount
              "
              class="passport-name-diagnosis"
            >
              <strong>中文姓名失敗原因</strong>
              <span>
                OCR 已讀到正確姓名，但 selector 未採用：
                {{ result.passportNameFailures.selectorMissCount }} 張
              </span>
              <span>
                OCR 有讀到姓名候選，但文字辨識錯：
                {{ result.passportNameFailures.recognitionWrongCount }} 張
              </span>
              <span>
                姓名裁切中沒有讀到可用姓名：
                {{ result.passportNameFailures.notDetectedCount }} 張
              </span>
            </div>

            <footer>
              <span>
                重測輸入 Median
                <strong>
                  {{
                    seconds(
                      result.medianTotalMs,
                    )
                  }}
                </strong>
              </span>
              <span>
                P90
                <strong>
                  {{
                    seconds(
                      result.p90TotalMs,
                    )
                  }}
                </strong>
              </span>
              <span>
                方向重試
                <strong>
                  {{
                    rate(
                      result.orientationRetryRate,
                    )
                  }}
                </strong>
              </span>
            </footer>
          </article>

          <p
            v-if="retestResult.failedCount"
            class="retest-failed"
          >
            有 {{ retestResult.failedCount }} 張 Test
            圖片未完成重測，未納入本次結果。
          </p>
        </div>

        <div
          v-if="historyError"
          class="history-warning"
        >
          這次 Benchmark 已完成，但歷史紀錄未儲存：
          {{ historyError }}
        </div>

        <div
          v-if="benchmarkHistory.length"
          class="benchmark-history"
        >
          <div class="benchmark-history-heading">
            <div>
              <p class="page-kicker">BENCHMARK HISTORY</p>
              <strong>最近重測紀錄</strong>
            </div>
            <small>
              只保存版本與聚合統計，不保存旅客姓名或證件號碼。
            </small>
          </div>

          <div class="benchmark-history-list">
            <div
              v-for="run in benchmarkHistory"
              :key="run.benchmarkRunId"
              class="benchmark-history-row"
            >
              <span>
                {{ formatBenchmarkRunTime(run.createdAt) }}
              </span>
              <strong>
                {{ run.pipelineVersion }}
              </strong>
              <span>
                Test {{ run.sampleCount }} 張
              </span>
              <span>
                失敗 {{ run.failedCount }}
              </span>
              <span
                v-if="run.baselineCreatedCount"
              >
                新基準 {{ run.baselineCreatedCount }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section class="document-grid">
        <article
          v-for="card in documentCards"
          :key="card.type"
          class="document-card"
        >
          <header>
            <div>
              <p>{{ documentLabel(card.type) }}</p>
              <strong>
                {{
                  card.benchmark?.scoredSampleCount ??
                  0
                }}
                張可評分
              </strong>
            </div>

            <span
              class="sample-state"
              :class="{
                ready:
                  (card.benchmark?.scoredSampleCount ??
                    0) >= 50,
              }"
            >
              {{
                sampleStatus(
                  card.benchmark,
                )
              }}
            </span>
          </header>

          <div class="metrics">
            <div>
              <span>整張完全正確</span>
              <strong>
                {{
                  rate(
                    card.benchmark
                      ?.fullDocumentExactRate,
                  )
                }}
              </strong>
            </div>
            <div>
              <span>人工修正率</span>
              <strong>
                {{
                  rate(
                    card.benchmark
                      ?.manualCorrectionRate,
                  )
                }}
              </strong>
            </div>
            <div>
              <span>Median</span>
              <strong>
                {{
                  seconds(
                    card.benchmark
                      ?.medianTotalMs,
                  )
                }}
              </strong>
            </div>
            <div>
              <span>P90</span>
              <strong>
                {{
                  seconds(
                    card.benchmark
                      ?.p90TotalMs,
                  )
                }}
              </strong>
            </div>
          </div>

          <div class="training-count">
            <span>已選 OCR 改善樣本</span>
            <strong>{{ card.trainingCount }}</strong>
          </div>

          <div
            v-if="card.trainingCount"
            class="document-split"
          >
            <span>
              Train
              <strong>{{ card.trainCount }}</strong>
            </span>
            <span>
              Val
              <strong>{{ card.validationCount }}</strong>
            </span>
            <span>
              Test
              <strong>{{ card.testCount }}</strong>
            </span>
          </div>

          <div
            v-if="card.benchmark?.fields.length"
            class="field-list"
          >
            <div
              v-for="field in card.benchmark.fields"
              :key="field.field"
            >
              <span>
                {{ fieldLabel(field.field) }}
              </span>
              <div class="field-progress">
                <span
                  :style="{
                    width:
                      field.comparedCount
                        ? `${Math.round(
                            field.exactMatchRate *
                              100,
                          )}%`
                        : '0%',
                  }"
                ></span>
              </div>
              <strong>
                {{
                  field.comparedCount
                    ? rate(field.exactMatchRate)
                    : '—'
                }}
              </strong>
            </div>
          </div>

          <div
            v-else
            class="field-empty"
          >
            完成人工審核後，這裡會開始顯示各欄位準確率。
          </div>
        </article>
      </section>

      <section
        v-if="errorAnalysisCards.length"
        class="analysis-section"
      >
        <header>
          <div>
            <p class="page-kicker">
              FIRST-PASS ERROR ANALYSIS
            </p>
            <h2>第一輪錯誤分析</h2>
            <p>
              先用實際 benchmark 找最弱欄位與方向／fallback／耗時訊號，
              再決定要改 recognition、欄位擷取或前處理，不直接盲目重訓整套 OCR。
            </p>
          </div>
        </header>

        <div class="analysis-grid">
          <article
            v-for="card in errorAnalysisCards"
            :key="card.type"
          >
            <header>
              <strong>
                {{ documentLabel(card.type) }}
              </strong>
              <span>優先檢查</span>
            </header>

            <div class="weak-fields">
              <div
                v-for="field in card.weakest"
                :key="field.field"
              >
                <div class="weak-field-main">
                  <span>
                    {{ fieldLabel(field.field) }}
                  </span>
                  <strong>
                    {{ rate(field.exactMatchRate) }}
                  </strong>
                </div>

                <div class="weak-field-breakdown">
                  <span>
                    漏抓
                    <strong>
                      {{
                        rate(
                          field.missingPredictionRate,
                        )
                      }}
                    </strong>
                  </span>
                  <span>
                    認錯
                    <strong>
                      {{
                        rate(
                          field.wrongPredictionRate,
                        )
                      }}
                    </strong>
                  </span>
                </div>

                <div
                  v-if="
                    field.directOrientationComparedCount ||
                    field.retriedOrientationComparedCount
                  "
                  class="orientation-field-breakdown"
                >
                  <span
                    v-if="
                      field.directOrientationComparedCount
                    "
                  >
                    原方向樣本
                    <strong>
                      {{
                        rate(
                          field.directOrientationExactRate,
                        )
                      }}
                    </strong>
                    <small>
                      n={{
                        field.directOrientationComparedCount
                      }}
                    </small>
                  </span>

                  <span
                    v-if="
                      field.retriedOrientationComparedCount
                    "
                  >
                    方向重試樣本
                    <strong>
                      {{
                        rate(
                          field.retriedOrientationExactRate,
                        )
                      }}
                    </strong>
                    <small>
                      n={{
                        field.retriedOrientationComparedCount
                      }}
                    </small>
                  </span>
                </div>
              </div>
            </div>

            <div
              v-if="card.signals.length"
              class="analysis-signals"
            >
              <span
                v-for="signal in card.signals"
                :key="signal"
              >
                {{ signal }}
              </span>
            </div>

            <p v-else>
              目前沒有額外方向／fallback／尾端耗時警訊；
              第一輪先從最低準確率欄位開始分析。
            </p>
          </article>
        </div>
      </section>

      <section class="dataset-card">
        <div class="dataset-copy">
          <p class="page-kicker">
            PRIVATE TRAINING DATASET
          </p>
          <h2>訓練資料集</h2>
          <p>
            只有審核時勾選「保留此樣本供 OCR 改善」
            的證件會被獨立複製到這裡。
            Production 照片原本的刪除期限不會改變。
            匯出的 manifest 會包含固定 split，
            並另外產生 train / validation / test 三份清單。
          </p>

          <div class="privacy-note">
            <strong>這個 ZIP 含真實證件照片與人工標註。</strong>
            <span>
              只放受控本機／私人儲存空間，不可提交到 GitHub。
            </span>
          </div>
        </div>

        <div class="dataset-actions">
          <div>
            <span>目前可匯出</span>
            <strong>
              {{ training?.sampleCount ?? 0 }}
              張
            </strong>
          </div>

          <button
            type="button"
            class="primary-action"
            :disabled="
              exporting ||
              !training?.sampleCount
            "
            @click="exportDataset"
          >
            {{
              exporting
                ? '匯出中…'
                : '匯出 Dataset ZIP'
            }}
          </button>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 22px;
}

.page-header {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
}

.page-header h1 {
  margin: 3px 0 7px;
  color: #182236;
  font-size: 29px;
  letter-spacing: -.025em;
}

.page-header p:not(.page-kicker) {
  max-width: 720px;
  margin: 0;
  color: #6f7b8e;
  font-size: 13px;
  line-height: 1.6;
}

.page-kicker {
  margin: 0;
  color: #8792a3;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .14em;
}

.primary-action,
.secondary-action {
  min-height: 41px;
  padding: 0 14px;
  border-radius: 9px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.primary-action {
  border: 1px solid #172033;
  background: #172033;
  color: #fff;
}

.secondary-action {
  border: 1px solid #d5dce7;
  background: #fff;
  color: #334158;
}

.overview-grid {
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.overview-card {
  display: grid;
  gap: 5px;
  padding: 16px;
  border: 1px solid #dde4ed;
  border-radius: 13px;
  background: #fff;
}

.overview-card.training {
  border-color: #cfe2d6;
  background: #f7fbf8;
}

.overview-card > span {
  color: #778397;
  font-size: 10px;
}

.overview-card strong {
  color: #1c2940;
  font-size: 25px;
}

.overview-card small {
  color: #8994a4;
  font-size: 9px;
  line-height: 1.5;
}

.split-card {
  display: grid;
  grid-template-columns:
    minmax(0, 1.5fr) minmax(360px, .9fr);
  gap: 18px;
  align-items: center;
  padding: 18px;
  border: 1px solid #d9e2eb;
  border-radius: 14px;
  background: #fff;
}

.split-copy h2,
.analysis-section h2 {
  margin: 4px 0 7px;
  color: #1d2a40;
  font-size: 17px;
}

.split-copy > p:not(.page-kicker),
.analysis-section > header p:not(.page-kicker) {
  margin: 0;
  color: #748095;
  font-size: 10px;
  line-height: 1.65;
}

.split-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.split-stats > div {
  display: grid;
  gap: 3px;
  padding: 12px;
  border: 1px solid #e0e6ed;
  border-radius: 10px;
  background: #f8fafb;
}

.split-stats span,
.split-stats small {
  color: #7a8799;
  font-size: 9px;
}

.split-stats strong {
  color: #26354c;
  font-size: 19px;
}

.document-split {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  border-bottom: 1px solid #edf1f5;
  background: #edf1f5;
}

.document-split > span {
  display: flex;
  gap: 5px;
  align-items: baseline;
  justify-content: center;
  padding: 7px 5px;
  background: #fafbfc;
  color: #8490a1;
  font-size: 8px;
}

.document-split strong {
  color: #42536c;
  font-size: 10px;
}

.analysis-section {
  display: grid;
  gap: 12px;
}

.analysis-grid {
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.analysis-grid article {
  overflow: hidden;
  border: 1px solid #dde4ed;
  border-radius: 13px;
  background: #fff;
}

.analysis-grid article > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #edf1f5;
}

.analysis-grid article > header strong {
  color: #26354c;
  font-size: 12px;
}

.analysis-grid article > header span {
  color: #8b651c;
  font-size: 9px;
}

.weak-fields {
  display: grid;
}

.weak-fields > div {
  display: grid;
  gap: 6px;
  padding: 9px 14px;
  border-bottom: 1px solid #f0f3f6;
  color: #6d7a8e;
  font-size: 9px;
}

.weak-field-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.weak-field-main > strong {
  color: #25344b;
  font-size: 12px;
}

.weak-field-breakdown {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.weak-field-breakdown > span {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 3px 6px;
  border-radius: 999px;
  background: #f4f6f8;
  color: #7c8798;
  font-size: 8px;
}

.weak-field-breakdown strong {
  color: #49586f;
  font-size: 8px;
}

.orientation-field-breakdown {
  display: grid;
  grid-template-columns:
    repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.orientation-field-breakdown > span {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr) auto;
  gap: 2px 6px;
  align-items: center;
  padding: 6px 7px;
  border: 1px solid #e6eaf0;
  border-radius: 8px;
  background: #fafbfc;
  color: #748095;
  font-size: 8px;
}

.orientation-field-breakdown strong {
  color: #324158;
  font-size: 10px;
}

.orientation-field-breakdown small {
  grid-column: 1 / -1;
  color: #9aa4b2;
  font-size: 7px;
}

.analysis-signals {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 11px 14px;
}

.analysis-signals span {
  padding: 4px 7px;
  border-radius: 999px;
  background: #fff4dc;
  color: #8f6418;
  font-size: 8px;
  font-weight: 700;
}

.analysis-grid article > p {
  margin: 0;
  padding: 11px 14px;
  color: #8490a1;
  font-size: 9px;
  line-height: 1.55;
}

.retest-card {
  display: grid;
  grid-template-columns:
    minmax(0, 1.35fr) minmax(300px, .65fr);
  gap: 16px;
  padding: 18px;
  border: 1px solid #d9e2eb;
  border-radius: 14px;
  background: #fff;
}

.retest-copy h2 {
  margin: 4px 0 7px;
  color: #1d2a40;
  font-size: 17px;
}

.retest-copy p {
  margin: 0;
  color: #748095;
  font-size: 10px;
  line-height: 1.65;
}

.retest-copy > small {
  display: block;
  margin-top: 8px;
  color: #9a7a45;
  font-size: 9px;
  line-height: 1.55;
}

.retest-action {
  display: grid;
  gap: 10px;
  align-content: center;
  justify-items: stretch;
}

.retest-progress {
  display: grid;
  gap: 6px;
}

.retest-progress > div {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  color: #7a8799;
  font-size: 9px;
}

.retest-progress strong {
  color: #43516a;
}

.retest-progress progress {
  width: 100%;
  height: 8px;
}

.baseline-created-note {
  grid-column: 1 / -1;
  padding: 10px 12px;
  border: 1px solid #cfe2d6;
  border-radius: 9px;
  background: #f4faf6;
  color: #577063;
  font-size: 9px;
  line-height: 1.6;
}

.baseline-created-note strong {
  color: #1f6d4a;
}

.retest-results {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding-top: 4px;
}

.retest-results article {
  overflow: hidden;
  border: 1px solid #dde4ed;
  border-radius: 11px;
  background: #fafbfc;
}

.retest-results article > header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 11px 12px;
  border-bottom: 1px solid #e8edf2;
  background: #fff;
}

.retest-results article > header > div:first-child {
  display: grid;
  gap: 2px;
}

.retest-results article > header strong {
  color: #26354c;
  font-size: 11px;
}

.retest-results article > header span,
.retest-results article > header small {
  color: #7f8a9b;
  font-size: 8px;
}

.retest-full-rate {
  display: grid;
  gap: 2px;
  text-align: right;
}

.retest-full-rate span {
  color: #68768a;
  font-size: 9px;
}

.retest-full-rate strong {
  color: #1f6d4a;
}

.history-warning {
  padding: 0.85rem 1rem;
  border-radius: 0.75rem;
  background: rgba(180, 83, 9, 0.08);
  font-size: 0.9rem;
}

.benchmark-history {
  display: grid;
  gap: 0.9rem;
  padding-top: 0.4rem;
}

.benchmark-history-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.benchmark-history-heading > div {
  display: grid;
  gap: 0.2rem;
}

.benchmark-history-heading small {
  max-width: 34rem;
  text-align: right;
}

.benchmark-history-list {
  display: grid;
  gap: 0.45rem;
}

.benchmark-history-row {
  display: grid;
  grid-template-columns:
    minmax(9rem, 1.2fr)
    minmax(8rem, 1fr)
    repeat(3, minmax(5.5rem, auto));
  gap: 0.75rem;
  align-items: center;
  padding: 0.7rem 0.85rem;
  border-radius: 0.7rem;
  background: rgba(15, 23, 42, 0.035);
  font-size: 0.86rem;
}

@media (max-width: 900px) {
  .benchmark-history-heading {
    align-items: start;
    flex-direction: column;
  }

  .benchmark-history-heading small {
    text-align: left;
  }

  .benchmark-history-row {
    grid-template-columns: 1fr 1fr;
  }
}

.passport-name-diagnosis {
  display: grid;
  gap: 0.35rem;
  padding: 0.85rem 1rem;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.04);
  font-size: 0.9rem;
}

.passport-name-diagnosis strong {
  margin-bottom: 0.15rem;
}

.retest-field-list {
  display: grid;
}

.retest-field-list > div {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr) auto 42px;
  gap: 8px;
  align-items: center;
  padding: 7px 11px;
  border-bottom: 1px solid #edf1f4;
  color: #6e7a8e;
  font-size: 8px;
}

.retest-field-list strong {
  color: #26354c;
}

.retest-field-list em {
  font-style: normal;
  text-align: right;
  color: #8792a3;
  font-size: 8px;
}

.retest-field-list em.positive {
  color: #1f7a50;
}

.retest-field-list em.negative {
  color: #b14a42;
}

.retest-results article > footer {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 9px 11px;
  color: #8792a3;
  font-size: 8px;
}

.retest-results article > footer strong {
  color: #4c5c72;
}

.retest-failed {
  grid-column: 1 / -1;
  margin: 0;
  color: #a25a38;
  font-size: 9px;
}

.document-grid {
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 1fr));
  gap: 13px;
  align-items: start;
}

.document-card {
  overflow: hidden;
  border: 1px solid #dde3ec;
  border-radius: 14px;
  background: #fff;
}

.document-card > header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #edf1f5;
}

.document-card header p {
  margin: 0 0 4px;
  color: #768297;
  font-size: 10px;
}

.document-card header strong {
  color: #202d43;
  font-size: 15px;
}

.sample-state {
  padding: 4px 7px;
  border-radius: 999px;
  background: #f1f3f6;
  color: #7b8798;
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}

.sample-state.ready {
  background: #eaf7ef;
  color: #247247;
}

.metrics {
  display: grid;
  grid-template-columns:
    repeat(2, 1fr);
  gap: 1px;
  background: #edf1f5;
}

.metrics div {
  display: grid;
  gap: 3px;
  padding: 12px;
  background: #fafbfc;
}

.metrics span {
  color: #7b8799;
  font-size: 9px;
}

.metrics strong {
  color: #26354d;
  font-size: 16px;
}

.training-count {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #edf1f5;
  color: #6f7b8e;
  font-size: 10px;
}

.training-count strong {
  color: #2b6848;
  font-size: 14px;
}

.field-list {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.field-list > div {
  display: grid;
  grid-template-columns:
    70px minmax(0, 1fr) 38px;
  gap: 8px;
  align-items: center;
}

.field-list span,
.field-list strong {
  font-size: 9px;
}

.field-list > div > span {
  color: #647188;
}

.field-list > div > strong {
  color: #344158;
  text-align: right;
}

.field-progress {
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf1f5;
}

.field-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #5f718d;
}

.field-empty {
  min-height: 110px;
  display: grid;
  place-items: center;
  padding: 18px;
  color: #8792a2;
  font-size: 9px;
  line-height: 1.6;
  text-align: center;
}

.dataset-card {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  padding: 18px;
  border: 1px solid #d7e5dc;
  border-radius: 14px;
  background: #f8fbf9;
}

.dataset-copy h2 {
  margin: 3px 0 6px;
  color: #1f2d42;
  font-size: 17px;
}

.dataset-copy > p:not(.page-kicker) {
  max-width: 720px;
  margin: 0;
  color: #6d7a8c;
  font-size: 10px;
  line-height: 1.6;
}

.privacy-note {
  display: grid;
  gap: 2px;
  margin-top: 12px;
  padding: 10px 11px;
  border: 1px solid #ead8b2;
  border-radius: 9px;
  background: #fff9ee;
}

.privacy-note strong {
  color: #805b1b;
  font-size: 10px;
}

.privacy-note span {
  color: #8c7449;
  font-size: 9px;
}

.dataset-actions {
  display: flex;
  gap: 14px;
  align-items: center;
  flex: 0 0 auto;
}

.dataset-actions > div {
  display: grid;
  gap: 2px;
  text-align: right;
}

.dataset-actions span {
  color: #788497;
  font-size: 9px;
}

.dataset-actions strong {
  color: #243249;
  font-size: 16px;
}

.state-card {
  display: grid;
  place-items: center;
  min-height: 220px;
  color: #788497;
  font-size: 11px;
}

.error-message {
  margin: 0;
  color: #bd3328;
  font-size: 10px;
}

button:disabled {
  cursor: not-allowed;
  opacity: .5;
}

@media (max-width: 1000px) {
  .document-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .page-header,
  .dataset-card,
  .dataset-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .overview-grid {
    grid-template-columns: 1fr;
  }

  .dataset-actions > div {
    text-align: left;
  }
}
</style>
