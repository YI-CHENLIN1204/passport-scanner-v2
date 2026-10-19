<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import {
  convertSimplifiedNameToTraditional,
  convertTraditionalNameToSimplified,
} from '../services/nameScriptConversion'
import {
  deleteScanItem,
  getReviewQueue,
  getScanItemImageUrl,
  getTourDetail,
  listScanBatches,
  reviewScanItem,
  setTrainingSampleSelection,
  updateTour,
  type ReviewQueuePersonResponse,
  type ReviewScanItemRequest,
  type ScanBatchResponse,
  type ScanItemResponse,
  type TourDetailResponse,
  type TourMemberResponse,
} from '../services/api'
import { createExcelWorkbook, type ExcelSheet } from '../services/excelWorkbook'

const props = defineProps<{
  tourId: string
}>()

const emit = defineEmits<{
  navigate: [path: string]
}>()

type RowFilter =
  | 'all'
  | 'pending'
  | 'missing'
  | 'complete'

type DocumentStatusFilter =
  | 'all'
  | 'reviewed'
  | 'pending'
  | 'missing'

type GenderFilter =
  | 'all'
  | 'M'
  | 'F'
  | 'X'

type ExportKind =
  | 'TOTAL'
  | 'PASSPORT'
  | 'TAIWAN_COMPATRIOT_PERMIT'
  | 'TAIWAN_NATIONAL_ID'

interface ExportFieldDefinition {
  key: string
  label: string
  kinds: ExportKind[]
  documentType?: string
}

interface DocumentCell {
  status: 'missing' | 'pending' | 'reviewed'
  item?: ScanItemResponse
}

interface OperationalRow {
  key: string
  nameZh: string
  nameEn: string
  birthDate: string | null
  gender: string
  documents: Record<string, DocumentCell>
  reviewPerson: ReviewQueuePersonResponse | null
}

const detail = ref<TourDetailResponse | null>(null)
const queue = ref<ReviewQueuePersonResponse[]>([])
const recentBatches = ref<ScanBatchResponse[]>([])
const loading = ref(true)
const error = ref('')
const exporting = ref(false)
const exportOpen = ref(false)
const exportSelectedKinds = ref<ExportKind[]>([])
const exportColumns = ref<Record<ExportKind, string[]>>({
  TOTAL: [],
  PASSPORT: [],
  TAIWAN_COMPATRIOT_PERMIT: [],
  TAIWAN_NATIONAL_ID: [],
})
const draggingExportField = ref<{
  kind: ExportKind
  key: string
} | null>(null)
const tourEditing = ref(false)
const tourSaving = ref(false)
const tourEditError = ref('')
const tourEditForm = ref({
  tourName: '',
  departureDate: '',
  returnDate: '',
  requiredDocumentTypes: [] as string[],
})
const documentOptions = [
  { value: 'PASSPORT', label: '護照' },
  { value: 'TAIWAN_COMPATRIOT_PERMIT', label: '台胞證' },
  { value: 'TAIWAN_NATIONAL_ID', label: '身分證' },
]

const tableSearch = ref('')
const rowFilter = ref<RowFilter>('all')
const documentTypeFilter = ref('all')
const documentStatusFilter =
  ref<DocumentStatusFilter>('all')
const genderFilter = ref<GenderFilter>('all')

const reviewPerson =
  ref<ReviewQueuePersonResponse | null>(null)
const reviewDocumentIndex = ref(0)
const reviewSaving = ref(false)
const reviewError = ref('')
const reviewZoom = ref(1)
const reviewRotation = ref(0)
const reviewPan = ref({ x: 0, y: 0 })
const reviewImagePanel = ref<HTMLElement | null>(null)
const reviewImageElement = ref<HTMLImageElement | null>(null)
const reviewImageNaturalSize = ref({
  width: 1,
  height: 1,
})
const reviewViewportSize = ref({
  width: 1,
  height: 1,
})
const reviewDragging = ref(false)
const reviewDragStart = ref({
  x: 0,
  y: 0,
  panX: 0,
  panY: 0,
})
let reviewResizeObserver: ResizeObserver | null = null
const reviewUseForTraining = ref(false)
const trainingSelectionSaving = ref(false)
const reviewForm = ref<ReviewScanItemRequest>({
  nameZh: '',
  nameZhOnDocument: '',
  nameEn: '',
  birthDate: null,
  gender: '',
  nationality: null,
  nationalIdNumber: null,
  documentNumber: '',
  issuingCountry: null,
  expiryDate: null,
})

const exportFieldDefinitions: ExportFieldDefinition[] = [
  {
    key: 'nameZh',
    label: '中文姓名',
    kinds: [
      'TOTAL',
      'PASSPORT',
      'TAIWAN_COMPATRIOT_PERMIT',
      'TAIWAN_NATIONAL_ID',
    ],
  },
  {
    key: 'nameEn',
    label: '英文姓名',
    kinds: ['TOTAL', 'PASSPORT'],
  },
  {
    key: 'nameEnSurname',
    label: '英文姓（Surname）',
    kinds: ['TOTAL', 'PASSPORT'],
  },
  {
    key: 'nameEnGivenNames',
    label: '英文名（Given names）',
    kinds: ['TOTAL', 'PASSPORT'],
  },
  {
    key: 'birthDate',
    label: '出生日期',
    kinds: [
      'TOTAL',
      'PASSPORT',
      'TAIWAN_COMPATRIOT_PERMIT',
      'TAIWAN_NATIONAL_ID',
    ],
  },
  {
    key: 'gender',
    label: '性別',
    kinds: [
      'TOTAL',
      'PASSPORT',
      'TAIWAN_COMPATRIOT_PERMIT',
      'TAIWAN_NATIONAL_ID',
    ],
  },
  {
    key: 'nationality',
    label: '國籍',
    kinds: ['TOTAL', 'PASSPORT'],
  },
  {
    key: 'nationalIdNumber',
    label: '身分證字號',
    kinds: ['TOTAL', 'PASSPORT', 'TAIWAN_NATIONAL_ID'],
  },
  {
    key: 'passportNumber',
    label: '護照號碼',
    kinds: ['TOTAL', 'PASSPORT'],
    documentType: 'PASSPORT',
  },
  {
    key: 'passportIssuingCountry',
    label: '護照簽發國',
    kinds: ['TOTAL', 'PASSPORT'],
    documentType: 'PASSPORT',
  },
  {
    key: 'passportExpiryDate',
    label: '護照有效期限',
    kinds: ['TOTAL', 'PASSPORT'],
    documentType: 'PASSPORT',
  },
  {
    key: 'permitNumber',
    label: '台胞證號碼',
    kinds: ['TOTAL', 'TAIWAN_COMPATRIOT_PERMIT'],
    documentType: 'TAIWAN_COMPATRIOT_PERMIT',
  },
  {
    key: 'permitExpiryDate',
    label: '台胞證有效期限',
    kinds: ['TOTAL', 'TAIWAN_COMPATRIOT_PERMIT'],
    documentType: 'TAIWAN_COMPATRIOT_PERMIT',
  },
  {
    key: 'nationalIdDocumentNumber',
    label: '身分證證號',
    kinds: ['TOTAL', 'TAIWAN_NATIONAL_ID'],
    documentType: 'TAIWAN_NATIONAL_ID',
  },
]

function displayGender(
  value: string | null | undefined,
) {
  if (value === 'M') return '男'
  if (value === 'F') return '女'
  if (value === 'X') return 'X'
  return value ?? ''
}

function documentLabel(type: string) {
  if (type === 'PASSPORT') return '護照'
  if (type === 'TAIWAN_COMPATRIOT_PERMIT') {
    return '台胞證'
  }
  if (type === 'TAIWAN_NATIONAL_ID') return '身分證'
  return type
}

function batchStatusLabel(status: string) {
  if (status === 'COMPLETED') {
    return '已完成'
  }

  if (status === 'OPEN') {
    return '尚未結束'
  }

  return status
}

function batchUpdatedTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function retentionDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10)
  }

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function uniqueFormalMemberForDraft(
  person: ReviewQueuePersonResponse,
  stagedNameEn: string,
  stagedNationalId: string | null,
) {
  if (!detail.value) return null

  const savedDocumentIds =
    new Set(
      person.documents
        .map(document =>
          document.savedDocumentVersionId,
        )
        .filter(
          (value): value is string =>
            Boolean(value),
        ),
    )

  if (savedDocumentIds.size) {
    const linkedMembers =
      detail.value.members.filter(member =>
        member.documents.some(document =>
          savedDocumentIds.has(
            document.documentVersionId,
          ),
        ),
      )

    if (linkedMembers.length === 1) {
      return linkedMembers[0]
    }

    if (linkedMembers.length > 1) {
      return null
    }
  }

  let candidates =
    detail.value.members

  if (stagedNationalId) {
    candidates = candidates.filter(
      member =>
        member.nationalIdNumber ===
          stagedNationalId,
    )
  } else if (
    person.birthDate &&
    person.gender &&
    person.nameZh.trim()
  ) {
    candidates = candidates.filter(
      member =>
        member.nameZh === person.nameZh &&
        member.birthDate === person.birthDate &&
        member.gender === person.gender,
    )
  } else if (
    person.birthDate &&
    person.gender &&
    stagedNameEn.trim()
  ) {
    candidates = candidates.filter(
      member =>
        member.nameEn === stagedNameEn &&
        member.birthDate === person.birthDate &&
        member.gender === person.gender,
    )
  } else {
    return null
  }

  return candidates.length === 1
    ? candidates[0]
    : null
}


function latestDocument(
  person: ReviewQueuePersonResponse,
  type: string,
) {
  return person.documents
    .filter(
      document => document.documentType === type,
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt),
    )[0]
}

function formalDocument(
  member: TourMemberResponse,
  type: string,
) {
  return member.documents.find(
    document =>
      document.documentType === type,
  )
}

const rows = computed<OperationalRow[]>(() => {
  if (!detail.value) return []

  const required =
    detail.value.tour.requiredDocumentTypes
  const result: OperationalRow[] = []
  const stagedTravelerIds =
    new Set<string>()

  for (const person of queue.value) {
    const stagedNameEn =
      person.documents.find(item => item.nameEn)
        ?.nameEn ?? ''
    const stagedNationalId =
      person.documents.find(
        item => item.nationalIdNumber,
      )?.nationalIdNumber ?? null

    const matchedMember =
      uniqueFormalMemberForDraft(
        person,
        stagedNameEn,
        stagedNationalId,
      )

    if (matchedMember) {
      stagedTravelerIds.add(
        matchedMember.travelerId,
      )
    }

    const documents:
      Record<string, DocumentCell> = {}

    for (const type of required) {
      const item = latestDocument(person, type)

      documents[type] = item
        ? {
            status:
              item.reviewStatus === 'REVIEWED'
                ? 'reviewed'
                : 'pending',
            item,
          }
        : { status: 'missing' }
    }

    result.push({
      key: `draft:${person.draftPersonId}`,
      nameZh:
        person.nameZh ||
        stagedNameEn ||
        '待確認姓名',
      nameEn: stagedNameEn,
      birthDate: person.birthDate,
      gender: person.gender,
      documents,
      reviewPerson: person,
    })
  }

  for (const member of detail.value.members) {
    if (
      stagedTravelerIds.has(
        member.travelerId,
      )
    ) {
      continue
    }

    const documents:
      Record<string, DocumentCell> = {}

    for (const type of required) {
      documents[type] = formalDocument(member, type)
        ? { status: 'reviewed' }
        : { status: 'missing' }
    }

    result.push({
      key: `traveler:${member.travelerId}`,
      nameZh:
        member.nameZh ||
        member.nameEn ||
        '未命名旅客',
      nameEn: member.nameEn,
      birthDate: member.birthDate,
      gender: member.gender,
      documents,
      reviewPerson: null,
    })
  }

  return result
})

function rowStatus(row: OperationalRow) {
  if (!detail.value) return ''

  const cells =
    detail.value.tour.requiredDocumentTypes.map(
      type => ({
        type,
        cell: row.documents[type],
      }),
    )

  if (
    cells.some(
      ({ cell }) => cell.status === 'pending',
    )
  ) {
    return '待審核'
  }

  const missing = cells
    .filter(
      ({ cell }) => cell.status === 'missing',
    )
    .map(({ type }) => documentLabel(type))

  return missing.length
    ? `缺${missing.join('、')}`
    : '完成'
}

function rowStatusClass(row: OperationalRow) {
  const status = rowStatus(row)

  if (status === '完成') return 'complete'
  if (status === '待審核') return 'pending'
  return 'missing'
}

const rowCounts = computed(() => ({
  all: rows.value.length,
  pending: rows.value.filter(
    row => rowStatusClass(row) === 'pending',
  ).length,
  missing: rows.value.filter(
    row => rowStatusClass(row) === 'missing',
  ).length,
  complete: rows.value.filter(
    row => rowStatusClass(row) === 'complete',
  ).length,
}))

const exportMissingPersonCount = computed(
  () =>
    rows.value.filter(row =>
      Object.values(row.documents).some(
        cell => cell.status === 'missing',
      ),
    ).length,
)

const exportHasIncompleteData = computed(
  () =>
    Boolean(
      detail.value &&
      (
        detail.value.tour.pendingReviewCount > 0 ||
        exportMissingPersonCount.value > 0
      ),
    ),
)

const hasAdvancedFilters = computed(
  () =>
    documentTypeFilter.value !== 'all' ||
    documentStatusFilter.value !== 'all' ||
    genderFilter.value !== 'all',
)

function clearAdvancedFilters() {
  documentTypeFilter.value = 'all'
  documentStatusFilter.value = 'all'
  genderFilter.value = 'all'
}

const filteredRows = computed(() => {
  const query = tableSearch.value
    .trim()
    .toLowerCase()

  return rows.value.filter(row => {
    const status = rowStatusClass(row)

    if (
      rowFilter.value !== 'all' &&
      status !== rowFilter.value
    ) {
      return false
    }

    if (
      genderFilter.value !== 'all' &&
      row.gender.toUpperCase() !==
        genderFilter.value
    ) {
      return false
    }

    const selectedDocumentType =
      documentTypeFilter.value

    if (selectedDocumentType !== 'all') {
      const cell =
        row.documents[selectedDocumentType]

      if (!cell) {
        return false
      }

      if (
        documentStatusFilter.value !== 'all' &&
        cell.status !== documentStatusFilter.value
      ) {
        return false
      }
    } else if (
      documentStatusFilter.value !== 'all'
    ) {
      const hasMatchingDocument =
        detail.value?.tour.requiredDocumentTypes
          .some(type =>
            row.documents[type]?.status ===
              documentStatusFilter.value,
          ) ?? false

      if (!hasMatchingDocument) {
        return false
      }
    }

    if (!query) return true

    const scanDocumentNumbers =
      Object.values(row.documents)
        .map(cell =>
          cell.item?.documentNumber ?? '',
        )
        .join(' ')

    return [
      row.nameZh,
      row.nameEn,
      row.birthDate ?? '',
      row.gender,
      scanDocumentNumbers,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
})

function canReview(row: OperationalRow) {
  return (
    row.reviewPerson?.documents.some(
      document =>
        document.reviewStatus === 'PENDING',
    ) ?? false
  )
}

function openTourEdit() {
  if (!detail.value) return

  tourEditForm.value = {
    tourName: detail.value.tour.tourName,
    departureDate: detail.value.tour.departureDate,
    returnDate: detail.value.tour.returnDate,
    requiredDocumentTypes:
      [...detail.value.tour.requiredDocumentTypes],
  }
  tourEditError.value = ''
  tourEditing.value = true
}

function closeTourEdit() {
  if (tourSaving.value) return
  tourEditing.value = false
  tourEditError.value = ''
}

async function saveTourEdit() {
  if (!detail.value || tourSaving.value) return

  tourEditError.value = ''

  if (!tourEditForm.value.tourName.trim()) {
    tourEditError.value = '團別名稱不可空白。'
    return
  }

  if (
    !tourEditForm.value.departureDate ||
    !tourEditForm.value.returnDate
  ) {
    tourEditError.value =
      '請確認出發日與回國日。'
    return
  }

  if (
    tourEditForm.value.returnDate <
    tourEditForm.value.departureDate
  ) {
    tourEditError.value =
      '回國日不可早於出發日。'
    return
  }

  if (
    !tourEditForm.value.requiredDocumentTypes.length
  ) {
    tourEditError.value =
      '請至少保留一種此團需要的證件。'
    return
  }

  tourSaving.value = true

  try {
    await updateTour(
      detail.value.tour.tourId,
      {
        tourName:
          tourEditForm.value.tourName.trim(),
        departureDate:
          tourEditForm.value.departureDate,
        returnDate:
          tourEditForm.value.returnDate,
        requiredDocumentTypes:
          tourEditForm.value.requiredDocumentTypes,
      },
    )

    tourEditing.value = false
    await load()
  } catch (err) {
    tourEditError.value =
      err instanceof Error
        ? err.message
        : '團別更新失敗。'
  } finally {
    tourSaving.value = false
  }
}

async function load() {
  loading.value = true
  error.value = ''

  try {
    const [
      tour,
      reviewQueue,
      batches,
    ] = await Promise.all([
      getTourDetail(props.tourId),
      getReviewQueue(props.tourId),
      listScanBatches(props.tourId, 5),
    ])

    if (!tour) {
      error.value = '找不到指定團別。'
      detail.value = null
      queue.value = []
      recentBatches.value = []
      return
    }

    detail.value = tour
    queue.value = reviewQueue
    recentBatches.value = batches
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : '團別資料載入失敗。'
  } finally {
    loading.value = false
  }
}

async function reloadQueue() {
  const [
    reviewQueue,
    tour,
    batches,
  ] = await Promise.all([
    getReviewQueue(props.tourId),
    getTourDetail(props.tourId),
    listScanBatches(props.tourId, 5),
  ])

  queue.value = reviewQueue
  recentBatches.value = batches

  if (tour) detail.value = tour
}

function exportKindLabel(kind: ExportKind) {
  if (kind === 'TOTAL') return '總表'
  return documentLabel(kind)
}

function exportKindsForTour() {
  const kinds: ExportKind[] = ['TOTAL']

  for (
    const type of
    detail.value?.tour.requiredDocumentTypes ?? []
  ) {
    if (
      type === 'PASSPORT' ||
      type === 'TAIWAN_COMPATRIOT_PERMIT' ||
      type === 'TAIWAN_NATIONAL_ID'
    ) {
      kinds.push(type)
    }
  }

  return kinds
}

function exportFieldsFor(kind: ExportKind) {
  const required =
    detail.value?.tour.requiredDocumentTypes ?? []

  return exportFieldDefinitions.filter(field => {
    if (!field.kinds.includes(kind)) {
      return false
    }

    if (
      kind === 'TOTAL' &&
      field.documentType &&
      !required.includes(field.documentType)
    ) {
      return false
    }

    return true
  })
}

function orderedExportFields(kind: ExportKind) {
  const fields = exportFieldsFor(kind)
  const byKey = new Map(
    fields.map(field => [field.key, field]),
  )
  const selected = exportColumns.value[kind]
    .map(key => byKey.get(key))
    .filter(
      (
        field,
      ): field is ExportFieldDefinition =>
        Boolean(field),
    )
  const selectedKeys = new Set(
    selected.map(field => field.key),
  )

  return [
    ...selected,
    ...fields.filter(
      field => !selectedKeys.has(field.key),
    ),
  ]
}

function defaultExportColumns(kind: ExportKind) {
  const preferred: Record<ExportKind, string[]> = {
    TOTAL: [
      'nameZh',
      'nameEn',
      'nameEnSurname',
      'nameEnGivenNames',
      'birthDate',
      'gender',
      'nationality',
      'nationalIdNumber',
      'passportNumber',
      'passportExpiryDate',
      'permitNumber',
      'permitExpiryDate',
      'nationalIdDocumentNumber',
    ],
    PASSPORT: [
      'nameZh',
      'nameEn',
      'birthDate',
      'gender',
      'nationality',
      'nationalIdNumber',
      'passportNumber',
      'passportIssuingCountry',
      'passportExpiryDate',
    ],
    TAIWAN_COMPATRIOT_PERMIT: [
      'nameZh',
      'birthDate',
      'gender',
      'permitNumber',
      'permitExpiryDate',
    ],
    TAIWAN_NATIONAL_ID: [
      'nameZh',
      'birthDate',
      'gender',
      'nationalIdNumber',
    ],
  }

  const allowed = new Set(
    exportFieldsFor(kind).map(field => field.key),
  )

  return preferred[kind].filter(key =>
    allowed.has(key),
  )
}

function exportStorageKey(kind: ExportKind) {
  return `passport-scanner.export-columns.${kind}`
}

function loadExportColumns(kind: ExportKind) {
  const allowed = new Set(
    exportFieldsFor(kind).map(field => field.key),
  )

  try {
    const raw = localStorage.getItem(
      exportStorageKey(kind),
    )
    const saved = raw
      ? (JSON.parse(raw) as string[])
      : []

    const filtered = saved.filter(key =>
      allowed.has(key),
    )

    if (filtered.length) {
      return filtered
    }
  } catch {
    // Fall back to defaults when browser storage is unavailable.
  }

  return defaultExportColumns(kind)
}

function persistExportColumns(kind: ExportKind) {
  try {
    localStorage.setItem(
      exportStorageKey(kind),
      JSON.stringify(exportColumns.value[kind]),
    )
  } catch {
    // Export still works without persistent browser settings.
  }
}

function openExportModal() {
  if (!detail.value) return

  const kinds = exportKindsForTour()

  for (const kind of kinds) {
    exportColumns.value[kind] =
      loadExportColumns(kind)
  }

  exportSelectedKinds.value = [...kinds]
  exportOpen.value = true
}

function closeExportModal() {
  if (exporting.value) return
  exportOpen.value = false
  draggingExportField.value = null
}

function toggleExportKind(
  kind: ExportKind,
  checked: boolean,
) {
  if (checked) {
    if (!exportSelectedKinds.value.includes(kind)) {
      exportSelectedKinds.value.push(kind)
    }
    return
  }

  exportSelectedKinds.value =
    exportSelectedKinds.value.filter(
      value => value !== kind,
    )
}

function toggleExportField(
  kind: ExportKind,
  key: string,
  checked: boolean,
) {
  const current = exportColumns.value[kind]

  if (checked) {
    if (!current.includes(key)) {
      current.push(key)
    }
  } else {
    exportColumns.value[kind] =
      current.filter(value => value !== key)
  }

  persistExportColumns(kind)
}

function onExportFieldChange(
  kind: ExportKind,
  key: string,
  event: Event,
) {
  const input = event.target as HTMLInputElement

  toggleExportField(
    kind,
    key,
    input.checked,
  )
}

function startExportFieldDrag(
  kind: ExportKind,
  key: string,
) {
  if (!exportColumns.value[kind].includes(key)) {
    return
  }

  draggingExportField.value = { kind, key }
}

function dropExportField(
  kind: ExportKind,
  targetKey: string,
) {
  const dragging = draggingExportField.value

  if (
    !dragging ||
    dragging.kind !== kind ||
    dragging.key === targetKey
  ) {
    draggingExportField.value = null
    return
  }

  const columns = [...exportColumns.value[kind]]
  const from = columns.indexOf(dragging.key)
  const to = columns.indexOf(targetKey)

  if (from < 0 || to < 0) {
    draggingExportField.value = null
    return
  }

  columns.splice(from, 1)
  columns.splice(to, 0, dragging.key)
  exportColumns.value[kind] = columns
  persistExportColumns(kind)
  draggingExportField.value = null
}

function exportDocument(
  member: TourMemberResponse,
  type: string,
) {
  return member.documents.find(
    document =>
      document.documentType === type,
  )
}

// Passport MRZ uses SURNAME, GIVEN NAMES. Never guess the surname
// from the last whitespace-separated word if the separator is absent.
function passportEnglishNameParts(value: string) {
  const separator = value.indexOf(',')
  if (separator < 0) {
    return { surname: '', givenNames: '' }
  }
  return {
    surname: value.slice(0, separator).trim().toUpperCase(),
    givenNames: value.slice(separator + 1).trim().toUpperCase(),
  }
}

function isoExportDate(value: string | null | undefined) {
  if (!value) return ''
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  if (!match) return value
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function exportFieldValue(
  member: TourMemberResponse,
  key: string,
) {
  const passport =
    exportDocument(member, 'PASSPORT')
  const permit =
    exportDocument(
      member,
      'TAIWAN_COMPATRIOT_PERMIT',
    )
  const nationalId =
    exportDocument(member, 'TAIWAN_NATIONAL_ID')

  switch (key) {
    case 'nameZh':
      return member.nameZh
    case 'nameEn':
      return member.nameEn
    case 'nameEnSurname':
      return passportEnglishNameParts(member.nameEn).surname
    case 'nameEnGivenNames':
      return passportEnglishNameParts(member.nameEn).givenNames
    case 'birthDate':
      return isoExportDate(member.birthDate)
    case 'gender':
      return member.gender
    case 'nationality':
      return member.nationality ?? ''
    case 'nationalIdNumber':
      return member.nationalIdNumber ?? ''
    case 'passportNumber':
      return passport?.documentNumber ?? ''
    case 'passportIssuingCountry':
      return passport?.issuingCountry ?? ''
    case 'passportExpiryDate':
      return isoExportDate(passport?.expiryDate)
    case 'permitNumber':
      return permit?.documentNumber ?? ''
    case 'permitExpiryDate':
      return isoExportDate(permit?.expiryDate)
    case 'nationalIdDocumentNumber':
      return nationalId?.documentNumber ?? ''
    default:
      return ''
  }
}

function membersForExport(kind: ExportKind) {
  if (!detail.value) return []

  if (kind === 'TOTAL') {
    return detail.value.members
  }

  return detail.value.members.filter(member =>
    member.documents.some(
      document => document.documentType === kind,
    ),
  )
}

function buildExportSheet(kind: ExportKind): ExcelSheet {
  const columns = exportColumns.value[kind]
  const fieldMap = new Map(
    exportFieldsFor(kind).map(field => [field.key, field]),
  )
  return {
    name: exportKindLabel(kind),
    headers: columns.map(key => fieldMap.get(key)?.label ?? key),
    rows: membersForExport(kind).map(member =>
      columns.map(key => exportFieldValue(member, key)),
    ),
  }
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim()
}

async function exportConfiguredExcel() {
  if (!detail.value || exporting.value) return

  const kinds = exportKindsForTour().filter(
    kind => exportSelectedKinds.value.includes(kind),
  )
  if (!kinds.length) {
    error.value = '請至少選擇一個要輸出的表。'
    return
  }
  for (const kind of kinds) {
    if (!exportColumns.value[kind].length) {
      error.value = `${exportKindLabel(kind)}至少要選擇一個欄位。`
      return
    }
  }

  exporting.value = true
  error.value = ''
  try {
    const tourName = safeFilename(detail.value.tour.tourName)
    for (const kind of kinds) {
      const bytes = createExcelWorkbook([buildExportSheet(kind)])
      const blob = new Blob([Uint8Array.from(bytes)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${tourName}-${safeFilename(exportKindLabel(kind))}.xlsx`
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      } finally {
        // Allow the browser to start the file download before revoking its URL.
        window.setTimeout(() => URL.revokeObjectURL(url), 30000)
      }
    }
    exportOpen.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Excel 匯出失敗。'
  } finally {
    exporting.value = false
  }
}

function syncReviewViewportSize() {
  const panel = reviewImagePanel.value

  if (!panel) return

  reviewViewportSize.value = {
    width: panel.clientWidth,
    height: panel.clientHeight,
  }
}

function resetReviewPosition() {
  reviewPan.value = { x: 0, y: 0 }
}

function resetReviewZoom() {
  reviewZoom.value = 1
  resetReviewPosition()
}

function resetReviewViewer() {
  reviewZoom.value = 1
  reviewRotation.value = 0
  resetReviewPosition()
}

function setReviewZoom(value: number) {
  reviewZoom.value =
    Math.min(
      3,
      Math.max(
        1,
        Math.round(value * 4) / 4,
      ),
    )
}

function zoomReviewIn() {
  setReviewZoom(reviewZoom.value + 0.25)
}

function zoomReviewOut() {
  setReviewZoom(reviewZoom.value - 0.25)
}

function rotateReviewLeft() {
  reviewRotation.value -= 90
  resetReviewPosition()
}

function rotateReviewRight() {
  reviewRotation.value += 90
  resetReviewPosition()
}

function onReviewImageLoad(event: Event) {
  const image = event.target as HTMLImageElement

  reviewImageNaturalSize.value = {
    width: Math.max(1, image.naturalWidth),
    height: Math.max(1, image.naturalHeight),
  }

  syncReviewViewportSize()
  resetReviewPosition()
}

function onReviewWheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return

  event.preventDefault()

  if (event.deltaY < 0) {
    zoomReviewIn()
  } else {
    zoomReviewOut()
  }
}

function startReviewPan(event: PointerEvent) {
  const panel = reviewImagePanel.value
  if (!panel || event.button !== 0) return

  reviewDragging.value = true
  reviewDragStart.value = {
    x: event.clientX,
    y: event.clientY,
    panX: reviewPan.value.x,
    panY: reviewPan.value.y,
  }

  panel.setPointerCapture(event.pointerId)
}

function moveReviewPan(event: PointerEvent) {
  if (!reviewDragging.value) return

  event.preventDefault()

  reviewPan.value = {
    x:
      reviewDragStart.value.panX +
      (event.clientX - reviewDragStart.value.x),
    y:
      reviewDragStart.value.panY +
      (event.clientY - reviewDragStart.value.y),
  }
}

function stopReviewPan(event?: PointerEvent) {
  const panel = reviewImagePanel.value

  if (
    panel &&
    event &&
    panel.hasPointerCapture(event.pointerId)
  ) {
    panel.releasePointerCapture(event.pointerId)
  }

  reviewDragging.value = false
}

function openReview(
  person: ReviewQueuePersonResponse,
) {
  reviewPerson.value = person

  const pendingIndex = person.documents.findIndex(
    document =>
      document.reviewStatus === 'PENDING',
  )

  reviewDocumentIndex.value =
    pendingIndex >= 0
      ? pendingIndex
      : Math.max(0, person.documents.length - 1)

  reviewError.value = ''
  resetReviewViewer()
}

function closeReview() {
  if (reviewSaving.value) return

  reviewPerson.value = null
  reviewError.value = ''
  resetReviewViewer()
}

// Version labels are based on capture time, not passport issue date.
// Never infer which physical passport is currently valid from upload order.
function documentVersionLabel(item: ScanItemResponse) {
  const siblings = reviewPerson.value?.documents
    .filter(value => value.documentType === item.documentType)
    .slice()
    .sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt) ||
      a.scanItemId.localeCompare(b.scanItemId)
    ) ?? []
  const index = siblings.findIndex(value => value.scanItemId === item.scanItemId)
  return {
    ordinal: Math.max(index + 1, 1),
    total: siblings.length,
    latest: index === siblings.length - 1 && siblings.length > 1,
  }
}

const currentDocument = computed(() =>
  reviewPerson.value?.documents[
    reviewDocumentIndex.value
  ] ?? null,
)

const reviewGenderOptions = computed(() => {
  const type =
    currentDocument.value?.documentType

  if (type === 'PASSPORT') {
    return [
      { value: 'M', label: 'M' },
      { value: 'F', label: 'F' },
      { value: 'X', label: 'X' },
    ]
  }

  if (type === 'TAIWAN_NATIONAL_ID') {
    return [
      { value: 'M', label: '男' },
      { value: 'F', label: '女' },
    ]
  }

  if (
    type ===
    'TAIWAN_COMPATRIOT_PERMIT'
  ) {
    return [
      { value: 'M', label: '男' },
      { value: 'F', label: '女' },
      { value: 'X', label: 'X' },
    ]
  }

  return [
    { value: 'M', label: '男 (M)' },
    { value: 'F', label: '女 (F)' },
    { value: 'X', label: 'X' },
  ]
})

const permitNameConversion = computed(() =>
  convertSimplifiedNameToTraditional(
    currentDocument.value?.nameZhOnDocument ?? '',
  ),
)

const currentImageUrl = computed(() =>
  currentDocument.value?.imageAvailable
    ? getScanItemImageUrl(
        currentDocument.value.scanItemId,
      )
    : '',
)

const reviewFormErrors = computed(() => {
  const document = currentDocument.value
  const form = reviewForm.value
  const errors: string[] = []

  if (
    document?.reviewStatus === 'PENDING' &&
    !document.imageAvailable
  ) {
    errors.push(
      '覆核照片已依保存期限刪除，無法完成人工審核。',
    )
  }

  const requiresChineseName =
    document?.documentType !== 'PASSPORT' ||
    form.nationality?.trim().toUpperCase() ===
      'TWN' ||
    form.issuingCountry?.trim().toUpperCase() ===
      'TWN'

  if (
    requiresChineseName &&
    !form.nameZh.trim()
  ) {
    errors.push('請確認中文姓名。')
  }

  if (
    !form.nameZh.trim() &&
    !form.nameEn.trim()
  ) {
    errors.push(
      '中文姓名與英文姓名至少需要一個。',
    )
  }

  if (!form.birthDate) {
    errors.push('請確認出生日期。')
  }

  if (!form.gender) {
    errors.push('請確認性別。')
  }

  if (!form.documentNumber.trim()) {
    errors.push('證件號碼不可空白。')
  }

  if (document?.documentType === 'PASSPORT') {
    if (!form.nameEn.trim()) {
      errors.push('請確認英文姓名。')
    }

    if (!form.nationality?.trim()) {
      errors.push('請確認國籍。')
    }

    if (!form.issuingCountry?.trim()) {
      errors.push('請確認簽發國。')
    }

    if (!form.expiryDate) {
      errors.push('請確認護照有效期限。')
    }
  }

  if (
    document?.documentType ===
      'TAIWAN_COMPATRIOT_PERMIT'
  ) {
    if (!form.expiryDate) {
      errors.push('請確認台胞證有效期限。')
    }
  }

  return errors
})

const normalizedReviewRotation = computed(() =>
  ((reviewRotation.value % 360) + 360) % 360,
)

const reviewImageFitScale = computed(() => {
  const natural = reviewImageNaturalSize.value
  const viewport = reviewViewportSize.value

  if (
    natural.width <= 1 ||
    natural.height <= 1 ||
    viewport.width <= 1 ||
    viewport.height <= 1
  ) {
    return 1
  }

  const quarterTurn =
    normalizedReviewRotation.value % 180 !== 0
  const rotatedWidth = quarterTurn
    ? natural.height
    : natural.width
  const rotatedHeight = quarterTurn
    ? natural.width
    : natural.height
  const padding = 24

  return Math.min(
    Math.max(
      1,
      viewport.width - padding,
    ) / rotatedWidth,
    Math.max(
      1,
      viewport.height - padding,
    ) / rotatedHeight,
  )
})

const reviewImageTransform = computed(() => {
  const scale =
    reviewImageFitScale.value *
    reviewZoom.value

  return [
    'translate(-50%, -50%)',
    `translate(${reviewPan.value.x}px, ${reviewPan.value.y}px)`,
    `rotate(${normalizedReviewRotation.value}deg)`,
    `scale(${scale})`,
  ].join(' ')
})

const canSaveReview = computed(
  () =>
    Boolean(currentDocument.value) &&
    reviewFormErrors.value.length === 0 &&
    !reviewSaving.value,
)

watch(
  () => currentDocument.value?.scanItemId,
  () => {
    const document = currentDocument.value
    if (!document) return

    const printedName =
      document.nameZhOnDocument ||
      document.nameZh
    const suggestedTraditionalName =
      convertSimplifiedNameToTraditional(
        printedName,
      ).value
    // Pending passport entries created before D-106 also need the
    // conversion at the actual review-form entry point. Use the persisted
    // OCR text as evidence, and never silently rewrite reviewed records.
    const passportReviewName =
      document.documentType === 'PASSPORT' &&
      document.reviewStatus === 'PENDING'
        ? convertSimplifiedNameToTraditional(
            (document.nameZh || printedName).replaceAll('温', '溫'),
          ).value
        : document.nameZh
    // Only prefill the review form, never the OCR result or saved scan.
    // A second-model suggestion must still be checked against the photo
    // and explicitly saved by the operator before it becomes formal data.
    const passportNameForReview =
      document.documentType === 'PASSPORT' &&
      document.reviewStatus === 'PENDING' &&
      !passportReviewName.trim() &&
      document.chineseNameReviewStatus === 'suggested' &&
      document.chineseNameReviewCandidate
        ? document.chineseNameReviewCandidate
        : passportReviewName

    reviewForm.value = {
      nameZh:
        document.documentType ===
          'TAIWAN_COMPATRIOT_PERMIT' &&
        document.reviewStatus === 'PENDING'
          ? suggestedTraditionalName
          : passportNameForReview,
      nameZhOnDocument:
        document.documentType ===
          'TAIWAN_COMPATRIOT_PERMIT'
          ? convertTraditionalNameToSimplified(
              document.documentType ===
                'TAIWAN_COMPATRIOT_PERMIT' &&
              document.reviewStatus === 'PENDING'
                ? suggestedTraditionalName
                : document.nameZh,
            )
          : printedName,
      nameEn: document.nameEn,
      birthDate: document.birthDate,
      gender: document.gender,
      nationality: document.nationality,
      nationalIdNumber:
        document.nationalIdNumber,
      documentNumber: document.documentNumber,
      issuingCountry: document.issuingCountry,
      expiryDate: document.expiryDate,
      useForTraining: false,
    }

    reviewUseForTraining.value =
      document.trainingSelected
    resetReviewZoom()
    reviewError.value = ''
  },
  { immediate: true },
)

watch(
  () => reviewForm.value.nameZh,
  value => {
    if (!currentDocument.value) return

    reviewForm.value.nameZhOnDocument =
      currentDocument.value.documentType ===
        'TAIWAN_COMPATRIOT_PERMIT'
        ? convertTraditionalNameToSimplified(value)
        : value
  },
)

function selectReviewDocument(index: number) {
  reviewDocumentIndex.value = index
  reviewError.value = ''
  resetReviewViewer()
}

function firstPendingPerson(
  excludingItemId?: string,
) {
  return (
    queue.value.find(person =>
      person.documents.some(
        document =>
          document.reviewStatus ===
            'PENDING' &&
          document.scanItemId !==
            excludingItemId,
      ),
    ) ?? null
  )
}

function nextPendingPerson(
  currentDraftPersonId: string,
) {
  const otherPerson =
    queue.value.find(
      person =>
        person.draftPersonId !==
          currentDraftPersonId &&
        person.documents.some(
          document =>
            document.reviewStatus ===
              'PENDING',
        ),
    )

  if (otherPerson) {
    return otherPerson
  }

  return (
    queue.value.find(
      person =>
        person.draftPersonId ===
          currentDraftPersonId &&
        person.documents.some(
          document =>
            document.reviewStatus ===
              'PENDING',
        ),
    ) ?? null
  )
}

async function onTrainingSelectionChange(
  event: Event,
) {
  const input = event.target as HTMLInputElement
  const document = currentDocument.value

  if (!document || trainingSelectionSaving.value) {
    input.checked = reviewUseForTraining.value
    return
  }

  const selected = input.checked
  const previous = reviewUseForTraining.value

  if (
    selected &&
    !document.imageAvailable
  ) {
    input.checked = previous
    reviewError.value =
      '正式收件照片已依保存期限刪除，無法再加入 OCR 訓練資料集。'
    return
  }

  reviewUseForTraining.value = selected
  reviewError.value = ''

  if (document.reviewStatus === 'PENDING') {
    return
  }

  trainingSelectionSaving.value = true

  try {
    await setTrainingSampleSelection(
      document.scanItemId,
      selected,
    )

    document.trainingSelected = selected
  } catch (err) {
    reviewUseForTraining.value = previous
    input.checked = previous
    reviewError.value =
      err instanceof Error
        ? err.message
        : '訓練樣本設定失敗。'
  } finally {
    trainingSelectionSaving.value = false
  }
}

async function deleteCurrentReviewItem() {
  const document = currentDocument.value
  const person = reviewPerson.value

  if (
    !document ||
    !person ||
    reviewSaving.value ||
    document.reviewStatus !== 'PENDING'
  ) {
    return
  }

  const confirmed = window.confirm(
    `確定刪除這張${documentLabel(document.documentType)}嗎？這筆待審核資料與覆核圖片會從目前團別移除。`,
  )

  if (!confirmed) return

  const previousDraftPersonId =
    person.draftPersonId
  const previousIndex =
    reviewDocumentIndex.value

  reviewSaving.value = true
  reviewError.value = ''

  try {
    await deleteScanItem(
      document.scanItemId,
    )
    await reloadQueue()

    const updatedPerson =
      queue.value.find(
        item =>
          item.draftPersonId ===
            previousDraftPersonId,
      )

    if (
      updatedPerson &&
      updatedPerson.documents.length
    ) {
      reviewPerson.value = updatedPerson
      reviewDocumentIndex.value =
        Math.min(
          previousIndex,
          updatedPerson.documents.length - 1,
        )
      resetReviewViewer()
      return
    }

    const next = firstPendingPerson(
      document.scanItemId,
    )

    if (next) {
      openReview(next)
    } else {
      reviewPerson.value = null
    }
  } catch (err) {
    reviewError.value =
      err instanceof Error
        ? err.message
        : '刪除證件失敗。'
  } finally {
    reviewSaving.value = false
  }
}

async function saveReview(moveNext: boolean) {
  const document = currentDocument.value

  if (!document || reviewSaving.value) return

  if (reviewFormErrors.value.length) {
    reviewError.value =
      reviewFormErrors.value.join(' ')
    return
  }

  reviewSaving.value = true
  reviewError.value = ''

  try {
    await reviewScanItem(
      document.scanItemId,
      {
        ...reviewForm.value,
        useForTraining:
          reviewUseForTraining.value,
      },
    )

    await reloadQueue()

    const updatedParent =
      queue.value.find(person =>
        person.documents.some(
          item =>
            item.scanItemId ===
            document.scanItemId,
        ),
      )

    if (moveNext) {
      const currentDraftPersonId =
        updatedParent?.draftPersonId ??
        reviewPerson.value?.draftPersonId ??
        ''

      const next = nextPendingPerson(
        currentDraftPersonId,
      )

      if (!next) {
        reviewPerson.value = null
        return
      }

      openReview(next)
      return
    }

    // Saving a corrected name can regroup the traveler. Never switch the
    // open modal to a different person/document group as a side effect.
    // The refreshed review queue already reflects the saved state.
    reviewPerson.value = null
    reviewError.value = ''
    resetReviewViewer()
  } catch (err) {
    reviewError.value =
      err instanceof Error
        ? err.message
        : '審核儲存失敗。'
  } finally {
    reviewSaving.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (
    event.key === 'Escape' &&
    reviewPerson.value &&
    !reviewSaving.value
  ) {
    closeReview()
  }
}

onMounted(() => {
  void load()
  window.addEventListener(
    'keydown',
    handleKeydown,
  )

  reviewResizeObserver =
    new ResizeObserver(() => {
      syncReviewViewportSize()
    })
})

watch(
  reviewImagePanel,
  panel => {
    reviewResizeObserver?.disconnect()

    if (panel) {
      reviewResizeObserver?.observe(panel)
      syncReviewViewportSize()
    }
  },
)

onBeforeUnmount(() => {
  window.removeEventListener(
    'keydown',
    handleKeydown,
  )
  reviewResizeObserver?.disconnect()
})
</script>

<template>
  <section class="page">
    <button
      type="button"
      class="back-link"
      @click="emit('navigate', '/tours')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m14 6-6 6 6 6" />
      </svg>
      返回團別管理
    </button>

    <div
      v-if="loading"
      class="state-card"
    >
      正在載入團別資料…
    </div>

    <div
      v-else-if="error && !detail"
      class="state-card error-state"
    >
      {{ error }}
    </div>

    <template v-else-if="detail">
      <header class="tour-header">
        <div>
          <p class="page-kicker">
            TOUR WORKSPACE
          </p>
          <h1>{{ detail.tour.tourName }}</h1>
          <p>
            {{ detail.tour.departureDate }}
            <span aria-hidden="true">→</span>
            {{ detail.tour.returnDate }}
          </p>

          <div class="required-documents">
            <span
              v-for="type in detail.tour.requiredDocumentTypes"
              :key="type"
            >
              {{ documentLabel(type) }}
            </span>
          </div>
        </div>

        <div class="header-actions">
          <button
            type="button"
            class="secondary-action"
            @click="openTourEdit"
          >
            編輯團別
          </button>

          <button
            type="button"
            class="secondary-action"
            :disabled="exporting"
            @click="openExportModal"
          >
            匯出 Excel
          </button>

          <button
            type="button"
            class="primary-action"
            @click="
              emit(
                'navigate',
                `/tours/${detail.tour.tourId}/scan`,
              )
            "
          >
            ＋ 批次上傳證件
          </button>
        </div>
      </header>

      <div class="summary-grid">
        <div>
          <span>目前人數</span>
          <strong>
            {{ detail.tour.memberCount }}
          </strong>
        </div>
        <div>
          <span>已收證件</span>
          <strong>
            {{ detail.tour.receivedDocumentCount }}
          </strong>
        </div>
        <div
          :class="{
            attention:
              detail.tour.pendingReviewCount > 0,
          }"
        >
          <span>待審核</span>
          <strong>
            {{ detail.tour.pendingReviewCount }}
          </strong>
        </div>
      </div>

      <section
        v-if="recentBatches.length"
        class="recent-batches"
      >
        <header>
          <div>
            <strong>最近掃描批次</strong>
            <span>
              顯示最近 {{ recentBatches.length }} 批
            </span>
          </div>
          <small>
            「尚未結束」可能仍在處理，或是上次掃描中途離開。
          </small>
        </header>

        <div class="batch-list">
          <article
            v-for="batch in recentBatches"
            :key="batch.scanBatchId"
            class="batch-item"
            :class="{
              open: batch.status === 'OPEN',
            }"
          >
            <div>
              <strong>
                {{ documentLabel(batch.documentType) }}
              </strong>
              <span
                v-if="batch.status === 'COMPLETED'"
              >
                成功 {{ batch.itemCount }}
                / {{ batch.attemptCount }} 張
                <template v-if="batch.failedCount">
                  · 失敗 {{ batch.failedCount }}
                </template>
              </span>
              <span v-else>
                已加入 {{ batch.itemCount }} 張
              </span>
            </div>

            <span
              class="batch-status"
              :class="{
                complete:
                  batch.status === 'COMPLETED',
                open:
                  batch.status === 'OPEN',
              }"
            >
              {{ batchStatusLabel(batch.status) }}
            </span>

            <time :datetime="batch.updatedAt">
              {{ batchUpdatedTime(batch.updatedAt) }}
            </time>
          </article>
        </div>
      </section>

      <p
        v-if="error"
        class="error-message"
      >
        {{ error }}
      </p>

      <section class="member-card">
        <header class="member-header">
          <div>
            <h2>旅客證件</h2>
            <p>
              OCR 完成後會直接出現在這裡；可依狀態集中處理。
            </p>
          </div>

          <span>
            顯示 {{ filteredRows.length }}
            / {{ rows.length }} 人
          </span>
        </header>

        <div
          v-if="rows.length"
          class="member-toolbar"
        >
          <div class="member-search">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                cx="11"
                cy="11"
                r="6.5"
              />
              <path d="m16 16 4 4" />
            </svg>

            <input
              v-model="tableSearch"
              type="search"
              placeholder="搜尋姓名、英文名、生日、證件號碼"
            />
          </div>

          <div class="filter-tabs">
            <button
              type="button"
              :class="{
                active: rowFilter === 'all',
              }"
              @click="rowFilter = 'all'"
            >
              全部
              <span>{{ rowCounts.all }}</span>
            </button>

            <button
              type="button"
              :class="{
                active: rowFilter === 'pending',
              }"
              @click="rowFilter = 'pending'"
            >
              待審核
              <span>{{ rowCounts.pending }}</span>
            </button>

            <button
              type="button"
              :class="{
                active: rowFilter === 'missing',
              }"
              @click="rowFilter = 'missing'"
            >
              缺件
              <span>{{ rowCounts.missing }}</span>
            </button>

            <button
              type="button"
              :class="{
                active: rowFilter === 'complete',
              }"
              @click="rowFilter = 'complete'"
            >
              完成
              <span>{{ rowCounts.complete }}</span>
            </button>
          </div>
        </div>

        <div
          v-if="rows.length"
          class="advanced-filters"
        >
          <label>
            <span>證件類別</span>
            <select v-model="documentTypeFilter">
              <option value="all">全部證件</option>
              <option
                v-for="type in detail.tour.requiredDocumentTypes"
                :key="type"
                :value="type"
              >
                {{ documentLabel(type) }}
              </option>
            </select>
          </label>

          <label>
            <span>證件狀態</span>
            <select v-model="documentStatusFilter">
              <option value="all">全部狀態</option>
              <option value="reviewed">已審核</option>
              <option value="pending">待審核</option>
              <option value="missing">未收到</option>
            </select>
          </label>

          <label>
            <span>性別</span>
            <select v-model="genderFilter">
              <option value="all">全部</option>
              <option value="M">男 (M)</option>
              <option value="F">女 (F)</option>
              <option value="X">X</option>
            </select>
          </label>

          <button
            v-if="hasAdvancedFilters"
            type="button"
            class="clear-filter-button"
            @click="clearAdvancedFilters"
          >
            清除條件
          </button>

          <small>
            可搭配上方「待審核／缺件／完成」一起篩選。
          </small>
        </div>

        <div
          v-if="!rows.length"
          class="state-card table-empty"
        >
          <strong>
            這個團目前還沒有證件資料
          </strong>
          <span>
            按「批次上傳證件」開始收件。
          </span>
        </div>

        <div
          v-else-if="!filteredRows.length"
          class="state-card table-empty"
        >
          <strong>沒有符合目前條件的旅客</strong>
          <span>
            清除搜尋或切換其他狀態篩選。
          </span>
        </div>

        <div
          v-else
          class="table-wrap"
        >
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th
                  v-for="type in detail.tour.requiredDocumentTypes"
                  :key="type"
                >
                  {{ documentLabel(type) }}
                </th>
                <th>狀態</th>
                <th class="action-column"></th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="row in filteredRows"
                :key="row.key"
              >
                <td>
                  <div class="person-name">
                    <strong>
                      {{ row.nameZh }}
                    </strong>
                    <span v-if="row.nameEn">
                      {{ row.nameEn }}
                    </span>
                    <small>
                      {{
                        row.birthDate ??
                        '生日待確認'
                      }}
                      <template v-if="row.gender">
                        · {{ displayGender(row.gender) }}
                      </template>
                    </small>
                  </div>
                </td>

                <td
                  v-for="type in detail.tour.requiredDocumentTypes"
                  :key="type"
                >
                  <span
                    class="document-status"
                    :class="
                      row.documents[type].status
                    "
                  >
                    {{
                      row.documents[type].status ===
                        'reviewed'
                        ? '已審核'
                        : row.documents[type].status ===
                            'pending'
                          ? '待審核'
                          : '未收到'
                    }}
                  </span>
                </td>

                <td>
                  <span
                    class="row-status"
                    :class="
                      rowStatusClass(row)
                    "
                  >
                    {{ rowStatus(row) }}
                  </span>
                </td>

                <td class="action-cell">
                  <button
                    v-if="
                      canReview(row) &&
                      row.reviewPerson
                    "
                    type="button"
                    class="review-button"
                    @click="
                      openReview(
                        row.reviewPerson,
                      )
                    "
                  >
                    審核
                  </button>

                  <button
                    v-else-if="row.reviewPerson"
                    type="button"
                    class="review-button edit-reviewed"
                    @click="
                      openReview(
                        row.reviewPerson,
                      )
                    "
                  >
                    編輯
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <div
      v-if="exportOpen"
      class="modal-backdrop"
      @click.self="closeExportModal"
    >
      <section
        class="export-modal"
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <p class="page-kicker">EXCEL EXPORT</p>
            <h2>匯出團別資料</h2>
            <p>
              先選擇要輸出的表，再勾選欄位；
              已勾選欄位可拖曳調整 Excel 欄位順序。
            </p>
          </div>

          <button
            type="button"
            class="close-button"
            :disabled="exporting"
            @click="closeExportModal"
          >
            ×
          </button>
        </header>

        <div
          v-if="exportHasIncompleteData"
          class="export-warning"
        >
          <strong>這個團目前尚未完成收件</strong>
          <span>
            目前有
            {{ detail?.tour.pendingReviewCount ?? 0 }}
            張待審核，
            {{ exportMissingPersonCount }}
            位旅客至少缺一種本團必收證件。
            Excel 只會使用已審核並寫入正式資料的內容，
            不會把待審核 OCR 結果當成可信資料輸出。
          </span>
        </div>

        <div class="export-kind-picker">
          <label
            v-for="kind in exportKindsForTour()"
            :key="kind"
          >
            <input
              v-model="exportSelectedKinds"
              type="checkbox"
              :value="kind"
            />
            <span>{{ exportKindLabel(kind) }}</span>
          </label>
        </div>

        <div class="export-config-list">
          <section
            v-for="kind in exportKindsForTour()"
            v-show="
              exportSelectedKinds.includes(kind)
            "
            :key="kind"
            class="export-config-card"
          >
            <header>
              <div>
                <strong>
                  {{ exportKindLabel(kind) }}
                </strong>
                <span>
                  {{ membersForExport(kind).length }}
                  人
                </span>
              </div>
              <small>
                拖曳已勾選欄位可改變順序
              </small>
            </header>

            <div class="export-field-list">
              <label
                v-for="field in orderedExportFields(kind)"
                :key="field.key"
                class="export-field-row"
                :class="{
                  selected:
                    exportColumns[kind].includes(
                      field.key,
                    ),
                }"
                :draggable="
                  exportColumns[kind].includes(
                    field.key,
                  )
                "
                @dragstart="
                  startExportFieldDrag(
                    kind,
                    field.key,
                  )
                "
                @dragover.prevent
                @drop.prevent="
                  dropExportField(
                    kind,
                    field.key,
                  )
                "
              >
                <input
                  type="checkbox"
                  :checked="
                    exportColumns[kind].includes(
                      field.key,
                    )
                  "
                  @change="
                    onExportFieldChange(
                      kind,
                      field.key,
                      $event,
                    )
                  "
                />
                <span class="drag-handle">
                  ⋮⋮
                </span>
                <span>{{ field.label }}</span>
                <small
                  v-if="
                    exportColumns[kind].includes(
                      field.key,
                    )
                  "
                >
                  {{
                    exportColumns[kind].indexOf(
                      field.key,
                    ) + 1
                  }}
                </small>
              </label>
            </div>
          </section>
        </div>

        <p
          v-if="error"
          class="error-message"
        >
          {{ error }}
        </p>

        <footer>
          <button
            type="button"
            class="secondary-action"
            :disabled="exporting"
            @click="closeExportModal"
          >
            取消
          </button>
          <button
            type="button"
            class="primary-action"
            :disabled="
              exporting ||
              !exportSelectedKinds.length
            "
            @click="exportConfiguredExcel"
          >
            {{
              exporting
                ? '匯出中…'
                : '匯出 ' +
                  exportSelectedKinds.length +
                  ' 個 Excel 檔案'
            }}
          </button>
        </footer>
      </section>
    </div>

    <div
      v-if="tourEditing"
      class="modal-backdrop"
      @click.self="closeTourEdit"
    >
      <section
        class="tour-edit-modal"
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <p class="page-kicker">EDIT TOUR</p>
            <h2>編輯團別</h2>
          </div>
          <button
            type="button"
            class="close-button"
            :disabled="tourSaving"
            @click="closeTourEdit"
          >
            ×
          </button>
        </header>

        <div class="tour-edit-form">
          <label>
            <span>團別名稱</span>
            <input
              v-model="tourEditForm.tourName"
              type="text"
            />
          </label>

          <div class="two-column">
            <label>
              <span>出發日</span>
              <input
                v-model="tourEditForm.departureDate"
                type="date"
              />
            </label>
            <label>
              <span>回國日</span>
              <input
                v-model="tourEditForm.returnDate"
                type="date"
                :min="tourEditForm.departureDate || undefined"
              />
            </label>
          </div>

          <fieldset class="document-picker">
            <legend>此團需要的證件</legend>
            <label
              v-for="option in documentOptions"
              :key="option.value"
            >
              <input
                v-model="tourEditForm.requiredDocumentTypes"
                type="checkbox"
                :value="option.value"
              />
              <span>{{ option.label }}</span>
            </label>
          </fieldset>
        </div>

        <p
          v-if="tourEditError"
          class="error-message"
        >
          {{ tourEditError }}
        </p>

        <footer>
          <button
            type="button"
            class="secondary-action"
            :disabled="tourSaving"
            @click="closeTourEdit"
          >
            取消
          </button>
          <button
            type="button"
            class="primary-action"
            :disabled="tourSaving"
            @click="saveTourEdit"
          >
            {{ tourSaving ? '儲存中…' : '儲存修改' }}
          </button>
        </footer>
      </section>
    </div>

    <div
      v-if="
        reviewPerson &&
        currentDocument
      "
      class="modal-backdrop"
      @click.self="closeReview"
    >
      <section
        class="review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
      >
        <header class="review-header">
          <div>
            <p class="page-kicker">
              DOCUMENT REVIEW
            </p>
            <div class="review-title-line">
              <h2 id="review-title">
                {{
                  reviewPerson.nameZh ||
                  '待確認旅客'
                }}
              </h2>
              <span>
                {{
                  reviewPerson.documents.filter(
                    item =>
                      item.reviewStatus ===
                      'PENDING',
                  ).length
                }}
                張待審核
              </span>
            </div>
          </div>

          <button
            type="button"
            class="close-button"
            :disabled="reviewSaving"
            aria-label="關閉審核"
            @click="closeReview"
          >
            ×
          </button>
        </header>

        <div class="document-tabs">
          <button
            v-for="(
              document,
              index
            ) in reviewPerson.documents"
            :key="document.scanItemId"
            type="button"
            :class="{
              active:
                index ===
                reviewDocumentIndex,
              reviewed:
                document.reviewStatus ===
                'REVIEWED',
            }"
            @click="
              selectReviewDocument(index)
            "
          >
            <span>
              {{ documentLabel(document.documentType) }}
              <template v-if="documentVersionLabel(document).total > 1">
                · 第{{ documentVersionLabel(document).ordinal }}版
              </template>
              <template v-if="documentVersionLabel(document).latest">
                · 最新掃描
              </template>
            </span>
            <span>
              {{
                document.reviewStatus ===
                  'REVIEWED'
                  ? '✓'
                  : '●'
              }}
            </span>
          </button>
        </div>

        <p
          v-if="currentDocument && documentVersionLabel(currentDocument).total > 1"
          class="conversion-note"
        >
          目前第 {{ documentVersionLabel(currentDocument).ordinal }} /
          {{ documentVersionLabel(currentDocument).total }} 版；
          {{ documentVersionLabel(currentDocument).latest ? '最新掃描紀錄' : '較早掃描紀錄' }}。
          依上傳建立時間排序，不代表最新核發或目前有效的證件。
        </p>

        <div class="review-layout">
          <div class="review-image-column">
            <div class="image-toolbar">
              <div class="image-toolbar-meta">
                <span>原始覆核圖</span>
                <small>
                  {{
                    currentDocument.imageAvailable
                      ? `照片保存至 ${retentionDate(currentDocument.deleteAfter)}`
                      : '照片已依保存期限刪除'
                  }}
                </small>
              </div>

              <div
                v-if="currentDocument.imageAvailable"
                class="image-controls"
              >
                <div class="rotation-controls">
                  <button
                    type="button"
                    aria-label="向左旋轉 90 度"
                    title="向左旋轉 90°"
                    @click="rotateReviewLeft"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    aria-label="向右旋轉 90 度"
                    title="向右旋轉 90°"
                    @click="rotateReviewRight"
                  >
                    ↷
                  </button>
                </div>

                <div class="zoom-controls">
                  <button
                    type="button"
                    :disabled="
                      reviewZoom <= 1
                    "
                    aria-label="縮小"
                    @click="zoomReviewOut"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    class="zoom-value"
                    title="回到 100% 並置中"
                    @click="resetReviewZoom"
                  >
                    {{
                      Math.round(
                        reviewZoom * 100,
                      )
                    }}%
                  </button>
                  <button
                    type="button"
                    :disabled="
                      reviewZoom >= 3
                    "
                    aria-label="放大"
                    @click="zoomReviewIn"
                  >
                    ＋
                  </button>
                </div>
              </div>
            </div>

            <div
              v-if="currentDocument.imageAvailable"
              ref="reviewImagePanel"
              class="review-image-panel"
              :class="{ dragging: reviewDragging }"
              @wheel="onReviewWheel"
              @pointerdown="startReviewPan"
              @pointermove="moveReviewPan"
              @pointerup="stopReviewPan"
              @pointercancel="stopReviewPan"
              @pointerleave="
                reviewDragging
                  ? stopReviewPan($event)
                  : undefined
              "
            >
              <img
                ref="reviewImageElement"
                :src="currentImageUrl"
                draggable="false"
                :style="{
                  width:
                    `${reviewImageNaturalSize.width}px`,
                  height:
                    `${reviewImageNaturalSize.height}px`,
                  transform:
                    reviewImageTransform,
                }"
                :alt="`${documentLabel(
                  currentDocument.documentType,
                )}證件照片`"
                @load="onReviewImageLoad"
              />
            </div>

            <div
              v-else
              class="review-image-expired"
            >
              <strong>覆核照片已刪除</strong>
              <span>
                此 production 證件照片已依「回國日 + 7 天」保存規則清除。
                結構化旅客與證件資料仍保留；若之前已選入 OCR Training Dataset，
                訓練樣本的獨立副本不受影響。
              </span>
            </div>

            <small
              v-if="currentDocument.imageAvailable"
              class="zoom-help"
            >
              外框固定不動；可左右旋轉 90°、縮放，
              並直接按住照片用滑鼠左鍵自由拖曳查看。
            </small>
          </div>

          <div class="review-form">
            <div class="document-meta">
              <span>
                {{
                  documentLabel(
                    currentDocument.documentType,
                  )
                }}
              </span>
              <strong>
                {{
                  currentDocument.reviewStatus ===
                    'REVIEWED'
                    ? '已審核'
                    : '待審核'
                }}
              </strong>
            </div>

            <template
              v-if="
                currentDocument.documentType ===
                'TAIWAN_COMPATRIOT_PERMIT'
              "
            >
              <div class="readonly-ocr-field">
                <span>台胞證簡體姓名（系統對照）</span>
                <strong>
                  {{
                    currentDocument.nameZhOnDocument ||
                    '未辨識'
                  }}
                </strong>
              </div>

              <label>
                <span>中文姓名（統一存繁體）</span>
                <input
                  v-model="reviewForm.nameZh"
                  type="text"
                />
              </label>

              <small class="conversion-note">
                系統先把 OCR 簡體結果轉成繁體供你確認；
                人物合併、團別名單與未來客人主檔都使用這個繁體姓名。
                OCR 準確率會先做簡繁正規化後再比較。
                <template
                  v-if="
                    permitNameConversion
                      .ambiguousCharacters.length
                  "
                >
                  簡體姓名含可能一對多的字：
                  {{
                    permitNameConversion
                      .ambiguousCharacters.join('、')
                  }}，請人工確認繁體姓名。
                </template>
              </small>
            </template>

            <label v-else>
              <span>中文姓名</span>
              <input
                v-model="reviewForm.nameZh"
                type="text"
              />
            </label>

            <div
              v-if="
                currentDocument.documentType === 'PASSPORT' &&
                currentDocument.reviewStatus === 'PENDING' &&
                currentDocument.chineseNameReviewCandidate
              "
              class="secondary-name-candidate"
            >
              <div>
                <span>第二模型人工覆核候選</span>
                <strong>
                  {{ currentDocument.chineseNameReviewCandidate }}
                </strong>
                <small>
                  已通過現有 MRZ 拼音一致性；主模型空白時先預填審核表單，尚未儲存為正式資料，仍請對照照片。
                </small>
              </div>
              <button
                type="button"
                @click="
                  reviewForm.nameZh =
                    currentDocument.chineseNameReviewCandidate ?? ''
                "
              >
                人工套用候選
              </button>
            </div>

            <small
              v-if="
                currentDocument.documentType === 'PASSPORT' &&
                currentDocument.reviewStatus === 'PENDING' &&
                currentDocument.chineseNameReviewStatus &&
                currentDocument.chineseNameReviewStatus !== 'suggested'
              "
              class="conversion-note"
            >
              {{
                currentDocument.chineseNameReviewStatus === 'unavailable'
                  ? '第二模型無法完成載入或辨識，請依照片人工核對。'
                  : currentDocument.chineseNameReviewStatus === 'legacy-no-record'
                    ? '此筆沒有第二模型執行紀錄（可能為舊掃描），無法由既有資料判斷結果。'
                    : currentDocument.chineseNameReviewStatus === 'not-attempted'
                      ? '這筆掃描未觸發第二模型；請確認主模型姓名及 MRZ 條件。'
                  : currentDocument.chineseNameReviewStatus === 'ambiguous-compatible-candidates'
                    ? '第二模型找到多個相容姓名，未提供建議，請人工核對。'
                    : '第二模型未取得唯一且符合 MRZ 的姓名，請人工核對。'
              }}
            </small>

            <small
              v-if="
                currentDocument.documentType === 'PASSPORT' &&
                currentDocument.reviewStatus === 'PENDING' &&
                currentDocument.chineseNameReviewStageCounts
              "
              class="conversion-note"
            >
              第二模型匿名階段計數：{{ currentDocument.chineseNameReviewStageCounts }}
            </small>

            <label
              v-if="
                currentDocument.documentType ===
                'PASSPORT'
              "
            >
              <span>英文姓名</span>
              <input
                v-model="reviewForm.nameEn"
                type="text"
              />
            </label>

            <div class="two-column">
              <label>
                <span>出生日期</span>
                <input
                  v-model="
                    reviewForm.birthDate
                  "
                  type="date"
                />
              </label>

              <label>
                <span>性別</span>
                <select
                  v-model="
                    reviewForm.gender
                  "
                >
                  <option value="">
                    待確認
                  </option>
                  <option
                    v-for="option in reviewGenderOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>
            </div>

            <label
              v-if="
                currentDocument.documentType ===
                'PASSPORT'
              "
            >
              <span>身分證字號（MRZ）</span>
              <input
                v-model="reviewForm.nationalIdNumber"
                type="text"
                maxlength="10"
                placeholder="若 MRZ 有資料會自動帶入"
              />
            </label>

            <label>
              <span>
                {{
                  documentLabel(
                    currentDocument.documentType,
                  )
                }}號碼
              </span>
              <input
                v-model="
                  reviewForm.documentNumber
                "
                type="text"
              />
            </label>

            <template
              v-if="
                currentDocument.documentType ===
                'PASSPORT'
              "
            >
              <div class="two-column">
                <label>
                  <span>國籍</span>
                  <input
                    v-model="
                      reviewForm.nationality
                    "
                    type="text"
                    maxlength="3"
                  />
                </label>

                <label>
                  <span>簽發國</span>
                  <input
                    v-model="
                      reviewForm.issuingCountry
                    "
                    type="text"
                    maxlength="3"
                  />
                </label>
              </div>
            </template>

            <label
              v-if="
                currentDocument.documentType !==
                'TAIWAN_NATIONAL_ID'
              "
            >
              <span>有效期限</span>
              <input
                v-model="
                  reviewForm.expiryDate
                "
                type="date"
              />
            </label>

            <label
              class="training-option"
              :class="{
                saving: trainingSelectionSaving,
              }"
            >
              <input
                type="checkbox"
                :checked="reviewUseForTraining"
                :disabled="
                  trainingSelectionSaving ||
                  (
                    !currentDocument.imageAvailable &&
                    !reviewUseForTraining
                  )
                "
                @change="onTrainingSelectionChange"
              />
              <span class="training-check" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>
                  保留此樣本供 OCR 改善
                  <template v-if="trainingSelectionSaving">
                    · 同步中…
                  </template>
                </strong>
                <small
                  v-if="
                    !currentDocument.imageAvailable &&
                    !reviewUseForTraining
                  "
                >
                  正式收件照片已依保存期限刪除，無法再新增為訓練樣本。
                </small>
                <small
                  v-else-if="
                    currentDocument.reviewStatus ===
                    'REVIEWED'
                  "
                >
                  已審核資料會在勾選／取消時立即同步到私人訓練資料集，不需再按「儲存修改」；正式收件照片原本的刪除期限不變。
                </small>
                <small v-else>
                  勾選後會在完成審核時，把這張證件與人工確認答案獨立複製到私人訓練資料集；正式收件照片原本的刪除期限不變。
                </small>
              </span>
            </label>

            <div class="merge-note">
              <strong>人物歸組由系統處理</strong>
              <span>
                儲存後會用中文姓名、出生日期、性別重新比對；
                完全相同的多張證件會自動歸到同一位旅客。
              </span>
            </div>

            <div
              v-if="
                reviewFormErrors.length &&
                !reviewError
              "
              class="form-warning"
            >
              還有
              {{ reviewFormErrors.length }}
              個必要欄位需要確認後才能儲存。
            </div>

            <p
              v-if="reviewError"
              class="error-message"
            >
              {{ reviewError }}
            </p>
          </div>
        </div>

        <footer class="review-footer">
          <span>
            Esc 可關閉視窗
          </span>

          <div>
            <button
              v-if="currentDocument.reviewStatus === 'PENDING'"
              type="button"
              class="danger-action"
              :disabled="reviewSaving"
              @click="deleteCurrentReviewItem"
            >
              刪除待審核資料
            </button>

            <button
              type="button"
              class="secondary-action"
              :disabled="!canSaveReview"
              @click="saveReview(false)"
            >
              {{
                reviewSaving
                  ? '儲存中…'
                  : currentDocument.reviewStatus ===
                      'REVIEWED'
                    ? '儲存修改'
                    : '儲存審核'
              }}
            </button>

            <button
              v-if="
                currentDocument.reviewStatus ===
                'PENDING'
              "
              type="button"
              class="primary-action"
              :disabled="!canSaveReview"
              @click="saveReview(true)"
            >
              儲存並審核下一位
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 21px;
}

.back-link {
  justify-self: start;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #647289;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.back-link svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.9;
}

.tour-header {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
}

.tour-header h1 {
  margin: 3px 0 6px;
  color: #182236;
  font-size: 29px;
  letter-spacing: -.025em;
}

.tour-header p:not(.page-kicker) {
  display: flex;
  gap: 7px;
  align-items: center;
  margin: 0;
  color: #6f7b8e;
  font-size: 12px;
}

.page-kicker {
  margin: 0;
  color: #8792a3;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .14em;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.primary-action,
.secondary-action,
.review-button,
.close-button,
.danger-action {
  border-radius: 9px;
  font: inherit;
  cursor: pointer;
}

.primary-action {
  min-height: 41px;
  padding: 0 15px;
  border: 1px solid #172033;
  background: #172033;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.secondary-action {
  min-height: 41px;
  padding: 0 14px;
  border: 1px solid #d5dce7;
  background: #fff;
  color: #334158;
  font-size: 12px;
  font-weight: 650;
}


.danger-action {
  min-height: 41px;
  padding: 0 14px;
  border: 1px solid #e1b6b2;
  border-radius: 9px;
  background: #fff5f4;
  color: #a43b33;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.export-modal {
  width: min(820px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  padding: 20px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 70px rgb(15 23 42 / 24%);
}

.export-modal > header,
.export-modal > footer {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
}

.export-modal > header h2 {
  margin: 3px 0 5px;
  color: #182236;
  font-size: 20px;
}

.export-modal > header p:not(.page-kicker) {
  margin: 0;
  color: #778397;
  font-size: 10px;
  line-height: 1.6;
}

.export-modal > footer {
  align-items: center;
  justify-content: flex-end;
  margin-top: 18px;
}

.export-warning {
  display: grid;
  gap: 4px;
  margin-top: 15px;
  padding: 11px 12px;
  border: 1px solid #ead7a9;
  border-radius: 10px;
  background: #fffaf0;
}

.export-warning strong {
  color: #765617;
  font-size: 10px;
}

.export-warning span {
  color: #866d3b;
  font-size: 9px;
  line-height: 1.65;
}

.export-kind-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding: 12px;
  border: 1px solid #dde4ed;
  border-radius: 10px;
  background: #fafbfc;
}

.export-kind-picker label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 7px 9px;
  border: 1px solid #d9e0e9;
  border-radius: 8px;
  background: #fff;
  color: #344158;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.export-config-list {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.export-config-card {
  overflow: hidden;
  border: 1px solid #dde4ed;
  border-radius: 11px;
  background: #fff;
}

.export-config-card > header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 11px 12px;
  border-bottom: 1px solid #edf1f5;
  background: #fafbfc;
}

.export-config-card > header > div {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.export-config-card > header strong {
  color: #243249;
  font-size: 11px;
}

.export-config-card > header span,
.export-config-card > header small {
  color: #8190a3;
  font-size: 9px;
}

.export-field-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: #edf1f5;
}

.export-field-row {
  display: grid;
  grid-template-columns: auto 20px 1fr auto;
  gap: 7px;
  align-items: center;
  min-height: 41px;
  padding: 0 10px;
  background: #fff;
  color: #59667b;
  font-size: 10px;
  cursor: pointer;
}

.export-field-row.selected {
  background: #f7f9fc;
  color: #25344b;
}

.export-field-row.selected .drag-handle {
  color: #5e6f89;
  cursor: grab;
}

.export-field-row:not(.selected) .drag-handle {
  color: #c1c8d2;
}

.export-field-row small {
  min-width: 20px;
  color: #7c899a;
  text-align: right;
  font-size: 9px;
}

.drag-handle {
  letter-spacing: -2px;
  user-select: none;
}

.tour-edit-modal {
  width: min(580px, 100%);
  padding: 20px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 70px rgb(15 23 42 / 24%);
}

.tour-edit-modal > header,
.tour-edit-modal > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tour-edit-modal h2 {
  margin: 3px 0 0;
  color: #182236;
  font-size: 19px;
}

.tour-edit-modal > footer {
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.tour-edit-form {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}

.tour-edit-form label {
  display: grid;
  gap: 5px;
  color: #46536a;
  font-size: 10px;
  font-weight: 700;
}

.tour-edit-form input[type='text'],
.tour-edit-form input[type='date'] {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid #d0d9e5;
  border-radius: 8px;
  font: inherit;
}

.document-picker {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 0;
  padding: 12px;
  border: 1px solid #d9e0e9;
  border-radius: 9px;
}

.document-picker legend {
  padding: 0 5px;
  color: #66748a;
  font-size: 10px;
}

.document-picker label {
  display: flex;
  gap: 6px;
  align-items: center;
}

.required-documents {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 11px;
}

.required-documents span {
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef2f7;
  color: #4b5c77;
  font-size: 10px;
  font-weight: 700;
}

.summary-grid {
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 170px));
  gap: 9px;
}

.summary-grid div {
  display: grid;
  gap: 4px;
  padding: 13px 15px;
  border: 1px solid #dde4ed;
  border-radius: 12px;
  background: #fff;
}

.summary-grid div.attention {
  border-color: #eeddb8;
  background: #fffaf1;
}

.summary-grid span {
  color: #778397;
  font-size: 10px;
}

.summary-grid strong {
  color: #1c2940;
  font-size: 22px;
  line-height: 1.1;
}

.summary-grid .attention strong {
  color: #956619;
}

.recent-batches {
  display: grid;
  gap: 10px;
  padding: 13px 15px;
  border: 1px solid #dde4ed;
  border-radius: 12px;
  background: #fff;
}

.recent-batches > header {
  display: flex;
  gap: 16px;
  align-items: baseline;
  justify-content: space-between;
}

.recent-batches > header > div {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.recent-batches > header strong {
  color: #28364b;
  font-size: 11px;
}

.recent-batches > header span,
.recent-batches > header small {
  color: #8490a2;
  font-size: 9px;
}

.batch-list {
  display: grid;
  grid-template-columns:
    repeat(auto-fit, minmax(180px, 1fr));
  gap: 7px;
}

.batch-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 5px 9px;
  align-items: center;
  padding: 9px 10px;
  border: 1px solid #e5eaf0;
  border-radius: 9px;
  background: #fafbfc;
}

.batch-item.open {
  border-color: #eadcbf;
  background: #fffaf2;
}

.batch-item > div {
  min-width: 0;
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.batch-item > div strong {
  color: #344258;
  font-size: 10px;
}

.batch-item > div span,
.batch-item time {
  color: #818c9d;
  font-size: 9px;
}

.batch-item time {
  grid-column: 1 / -1;
}

.batch-status {
  padding: 3px 6px;
  border-radius: 999px;
  font-size: 8px;
  font-weight: 750;
  white-space: nowrap;
}

.batch-status.complete {
  background: #eaf7ef;
  color: #26734a;
}

.batch-status.open {
  background: #fff0d7;
  color: #916313;
}

.member-card {
  overflow: hidden;
  border: 1px solid #dde3ec;
  border-radius: 15px;
  background: #fff;
}

.member-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 17px 19px 13px;
}

.member-card h2 {
  margin: 0 0 4px;
  color: #182236;
  font-size: 16px;
}

.member-card p {
  margin: 0;
  color: #7a8698;
  font-size: 10px;
}

.member-header > span {
  color: #7b8799;
  font-size: 10px;
}

.member-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 11px 13px;
  border-top: 1px solid #edf1f5;
  border-bottom: 1px solid #e7ecf2;
  background: #fafbfc;
}

.member-search {
  width: min(310px, 42%);
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 35px;
  padding: 0 10px;
  border: 1px solid #d9e0e9;
  border-radius: 8px;
  background: #fff;
}

.member-search svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  fill: none;
  stroke: #8390a3;
  stroke-linecap: round;
  stroke-width: 1.8;
}

.member-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #344158;
  font-size: 11px;
}

.advanced-filters {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
  padding: 10px 13px;
  border-bottom: 1px solid #e7ecf2;
  background: #f7f9fb;
}

.advanced-filters label {
  display: grid;
  gap: 4px;
  min-width: 145px;
}

.advanced-filters label > span {
  color: #788497;
  font-size: 9px;
  font-weight: 700;
}

.advanced-filters select {
  min-height: 34px;
  padding: 0 30px 0 9px;
  border: 1px solid #d7dfe9;
  border-radius: 8px;
  outline: 0;
  background: #fff;
  color: #344158;
  font: inherit;
  font-size: 10px;
}

.advanced-filters select:focus {
  border-color: #9ba9ba;
  box-shadow: 0 0 0 3px rgb(40 54 75 / 5%);
}

.clear-filter-button {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #d7dfe9;
  border-radius: 8px;
  background: #fff;
  color: #5e6b7f;
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.advanced-filters > small {
  margin-left: auto;
  align-self: center;
  color: #8a95a5;
  font-size: 9px;
}

.filter-tabs {
  display: flex;
  gap: 4px;
  align-items: center;
}

.filter-tabs button {
  min-height: 32px;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #748095;
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.filter-tabs button:hover {
  background: #f0f3f7;
}

.filter-tabs button.active {
  border-color: #d4dce7;
  background: #fff;
  color: #334158;
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}

.filter-tabs span {
  min-width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #eef2f6;
  font-size: 9px;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 0;
  border-collapse: collapse;
}

th,
td {
  padding: 12px 15px;
  border-bottom: 1px solid #edf1f5;
  text-align: left;
  vertical-align: middle;
}

th {
  background: #f8f9fb;
  color: #6d798d;
  font-size: 10px;
  font-weight: 750;
}

td {
  color: #445064;
  font-size: 11px;
}

tbody tr:hover {
  background: #fbfcfd;
}

tbody tr:last-child td {
  border-bottom: 0;
}

.person-name {
  display: grid;
  gap: 2px;
}

.person-name strong {
  color: #1f2c42;
  font-size: 12px;
}

.person-name span,
.person-name small {
  color: #7c8799;
  font-size: 9px;
}

.document-status,
.row-status {
  display: inline-flex;
  padding: 4px 7px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 750;
  white-space: nowrap;
}

.document-status.reviewed,
.row-status.complete {
  background: #eaf7ef;
  color: #237447;
}

.document-status.pending,
.row-status.pending {
  background: #fff4dc;
  color: #946515;
}

.document-status.missing,
.row-status.missing {
  background: #f1f3f6;
  color: #748094;
}

.action-column {
  width: 76px;
}

.action-cell {
  text-align: right;
}

.review-button {
  min-height: 31px;
  padding: 0 10px;
  border: 1px solid #172033;
  background: #172033;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.state-card {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 6px;
  min-height: 220px;
  color: #788497;
  font-size: 11px;
}

.table-empty {
  min-height: 190px;
  border-top: 1px solid #edf1f5;
}

.table-empty strong {
  color: #46536a;
}

.error-state,
.error-message {
  color: #bd3328;
}

.error-message {
  margin: 0;
  font-size: 10px;
  line-height: 1.5;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgb(15 23 42 / 60%);
  backdrop-filter: blur(3px);
  z-index: 100;
}

.review-modal {
  width: min(1160px, 100%);
  max-height: calc(100vh - 36px);
  overflow: auto;
  border: 1px solid #dfe5ed;
  border-radius: 17px;
  background: #fff;
  box-shadow:
    0 28px 80px rgb(15 23 42 / 30%);
}

.review-header {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 17px 19px 11px;
  background: #fff;
}

.review-title-line {
  display: flex;
  gap: 9px;
  align-items: center;
  flex-wrap: wrap;
}

.review-header h2 {
  margin: 3px 0 0;
  color: #182236;
  font-size: 18px;
}

.review-title-line > span {
  padding: 3px 7px;
  border-radius: 999px;
  background: #fff3db;
  color: #906215;
  font-size: 9px;
  font-weight: 750;
}

.close-button {
  width: 36px;
  height: 36px;
  border: 0;
  background: #f0f3f7;
  color: #435069;
  font-size: 20px;
}

.document-tabs {
  display: flex;
  gap: 6px;
  padding: 0 19px 12px;
  overflow-x: auto;
  border-bottom: 1px solid #e5eaf1;
}

.document-tabs button {
  display: flex;
  gap: 6px;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #d7dfe9;
  border-radius: 8px;
  background: #fff;
  color: #5b687d;
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.document-tabs button.active {
  border-color: #172033;
  background: #172033;
  color: #fff;
}

.document-tabs button.reviewed:not(.active) {
  border-color: #d5e9dd;
  background: #edf8f1;
  color: #2d7750;
}

.review-layout {
  display: grid;
  grid-template-columns:
    minmax(0, 1.08fr)
    minmax(350px, .92fr);
  min-height: 550px;
}

.review-image-column {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding: 14px;
  background: #111827;
}

.image-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  padding-bottom: 10px;
  color: #aeb8c8;
  font-size: 10px;
}

.image-toolbar > div {
  display: flex;
  gap: 4px;
}

.image-toolbar .image-toolbar-meta {
  display: grid;
  gap: 2px;
}

.image-toolbar-meta > span {
  color: #c3cbd8;
  font-weight: 700;
}

.image-toolbar-meta > small {
  color: #7f8ba0;
  font-size: 9px;
}

.image-toolbar button {
  min-width: 30px;
  height: 29px;
  border: 1px solid #334156;
  border-radius: 7px;
  background: #1b2638;
  color: #d6deea;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.image-toolbar button:disabled {
  opacity: .4;
  cursor: not-allowed;
}

.image-toolbar .zoom-value {
  min-width: 54px;
  font-size: 9px;
}

.review-image-panel {
  position: relative;
  width: 100%;
  height: clamp(470px, 62vh, 720px);
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  user-select: none;
  border: 1px solid #273347;
  border-radius: 10px;
  background:
    linear-gradient(45deg, #131d2c 25%, transparent 25%),
    linear-gradient(-45deg, #131d2c 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #131d2c 75%),
    linear-gradient(-45deg, transparent 75%, #131d2c 75%),
    #0f1724;
  background-size: 20px 20px;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0;
}

.review-image-panel.dragging {
  cursor: grabbing;
}

.review-image-expired {
  width: 100%;
  height: clamp(470px, 62vh, 720px);
  display: grid;
  place-content: center;
  gap: 8px;
  padding: 28px;
  border: 1px solid #334156;
  border-radius: 10px;
  background: #111827;
  color: #9eabbf;
  text-align: center;
}

.review-image-expired strong {
  color: #e2e8f0;
  font-size: 14px;
}

.review-image-expired span {
  max-width: 420px;
  font-size: 10px;
  line-height: 1.7;
}

.review-image-panel img {
  position: absolute;
  top: 50%;
  left: 50%;
  display: block;
  max-width: none;
  max-height: none;
  transform-origin: center center;
  pointer-events: none;
  will-change: transform;
  transition: transform .12s ease;
}

.review-image-panel.dragging img {
  transition: none;
}

.image-controls,
.rotation-controls,
.zoom-controls {
  display: flex;
  gap: 4px;
  align-items: center;
}

.image-controls {
  gap: 8px;
}

.rotation-controls {
  padding-right: 8px;
  border-right: 1px solid #334156;
}

.readonly-ocr-field {
  display: grid;
  gap: 5px;
  padding: 10px 11px;
  border: 1px solid #e0e5ec;
  border-radius: 8px;
  background: #f7f9fb;
}

.readonly-ocr-field > span {
  color: #6d7a8e;
  font-size: 9px;
  font-weight: 700;
}

.readonly-ocr-field > strong {
  color: #26354b;
  font-size: 12px;
}

.conversion-note {
  margin-top: -5px;
  color: #718096;
  font-size: 9px;
  line-height: 1.55;
}

.zoom-help {
  padding-top: 8px;
  color: #7f8ca0;
  font-size: 9px;
}

.review-form {
  align-content: start;
  display: grid;
  gap: 12px;
  padding: 20px;
  background: #fff;
}

.document-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 9px;
  border-bottom: 1px solid #edf1f5;
}

.document-meta span {
  color: #344258;
  font-size: 11px;
  font-weight: 750;
}

.document-meta strong {
  padding: 4px 7px;
  border-radius: 999px;
  background: #fff3db;
  color: #916314;
  font-size: 9px;
}

.review-form label {
  display: grid;
  gap: 5px;
  color: #46536a;
  font-size: 10px;
  font-weight: 700;
}

.review-form input,
.review-form select {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid #d0d9e5;
  border-radius: 8px;
  outline: 0;
  background: #fff;
  color: #2c394e;
  font: inherit;
  font-size: 11px;
}

.review-form input:focus,
.review-form select:focus {
  border-color: #98a7b9;
  box-shadow: 0 0 0 3px rgb(40 54 75 / 6%);
}

.two-column {
  display: grid;
  grid-template-columns:
    repeat(2, 1fr);
  gap: 9px;
}

.training-option {
  grid-template-columns: auto auto 1fr !important;
  gap: 8px !important;
  align-items: flex-start;
  padding: 11px;
  border: 1px solid #d7e5dc;
  border-radius: 9px;
  background: #f7fbf8;
  cursor: pointer;
}

.training-option.saving {
  opacity: .72;
  cursor: progress;
}

.training-option > input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.training-check {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  margin-top: 1px;
  border: 1px solid #bfcfc5;
  border-radius: 5px;
  background: #fff;
  color: transparent;
  font-size: 11px;
}

.training-option:has(input:checked) .training-check {
  border-color: #2f6e4b;
  background: #2f6e4b;
  color: #fff;
}

.training-option > span:last-child {
  display: grid;
  gap: 3px;
}

.training-option strong {
  color: #31563f;
  font-size: 10px;
}

.training-option small {
  color: #718278;
  font-size: 9px;
  line-height: 1.55;
}

.merge-note {
  display: grid;
  gap: 3px;
  padding: 10px 11px;
  border-radius: 9px;
  background: #f5f7fa;
  color: #657187;
}

.merge-note strong {
  color: #47556b;
  font-size: 10px;
}

.merge-note span {
  font-size: 9px;
  line-height: 1.6;
}

.form-warning {
  padding: 9px 10px;
  border: 1px solid #ead8b2;
  border-radius: 8px;
  background: #fff9ee;
  color: #8c6219;
  font-size: 9px;
  line-height: 1.5;
}

.review-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 14px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 19px;
  border-top: 1px solid #e5eaf1;
  background: #fff;
}

.review-footer > span {
  color: #8a95a5;
  font-size: 9px;
}

.review-footer > div {
  display: flex;
  gap: 8px;
}

button:disabled {
  cursor: not-allowed;
  opacity: .5;
}

@media (max-width: 900px) {
  .member-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .member-search {
    width: 100%;
  }

  .filter-tabs {
    overflow-x: auto;
  }

  .advanced-filters {
    align-items: stretch;
  }

  .advanced-filters label {
    min-width: min(170px, 48%);
  }

  .advanced-filters > small {
    width: 100%;
    margin-left: 0;
  }

  .review-layout {
    grid-template-columns: 1fr;
  }

  .review-image-panel {
    min-height: 330px;
    max-height: 55vh;
  }
}

@media (max-width: 720px) {
  .recent-batches > header {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }

  .batch-list {
    grid-template-columns: 1fr;
  }

  .table-wrap table {
    min-width: 680px;
  }

  .tour-header,
  .header-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .summary-grid {
    grid-template-columns:
      repeat(3, 1fr);
  }

  .review-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .review-footer > div {
    display: grid;
    grid-template-columns: 1fr;
  }

  .two-column {
    grid-template-columns: 1fr;
  }
}
.secondary-name-candidate {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 11px;
  border: 1px solid #d8e2ee;
  border-radius: 9px;
  background: #f6f9fc;
}

.secondary-name-candidate > div {
  display: grid;
  gap: 3px;
}

.secondary-name-candidate span,
.secondary-name-candidate small {
  color: #66758a;
  font-size: 10px;
}

.secondary-name-candidate strong {
  color: #1d2c43;
  font-size: 15px;
}

.secondary-name-candidate button {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #bdcad9;
  border-radius: 8px;
  background: #fff;
  color: #293a52;
  font: inherit;
  font-size: 10px;
  font-weight: 750;
  cursor: pointer;
}

</style>
