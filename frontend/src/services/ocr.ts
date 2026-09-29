import * as Tesseract from 'tesseract.js'

export interface OcrProgress {
  status: string
  progress: number
}

export interface MrzValidation {
  documentNumber: boolean | null
  birthDate: boolean | null
  expiryDate: boolean | null
  personalNumber: boolean | null
  composite: boolean | null
  requiredValid: boolean
}

export interface MrzRepairInfo {
  correctedCharacters: number
  correctedFields: string[]
}

export interface ParsedMrz {
  line1: string
  line2: string
  documentCode: string
  issuingState: string
  surname: string
  givenNames: string
  documentNumber: string
  nationality: string
  birthDate: string
  sex: string
  expiryDate: string
  personalNumber: string
  validation: MrzValidation
}

export interface OcrResult {
  text: string
  mrzText: string
  mrzCandidates: string[]
  mrzLine1: string | null
  mrzLine2: string | null
  mrzLine1Source: 'dedicated' | 'full-page' | null
  line2Validation: MrzValidation | null
  mrzRepair: MrzRepairInfo | null
  parsedMrz: ParsedMrz | null
  mrzCrop: Blob
  elapsedMs: number
  initializationMs: number
  fullPageMs: number
  preprocessingMs: number
  mrzPassMs: number
}

type OcrWorker = Awaited<ReturnType<typeof Tesseract.createWorker>>

interface MrzPreparedImages {
  crop: Blob
  lines: Blob[]
}

let worker: OcrWorker | null = null
let workerPromise: Promise<OcrWorker> | null = null
let progressHandler: ((progress: OcrProgress) => void) | null = null
let progressOffset = 0
let progressScale = 1

function normalizeMrzCandidate(line: string) {
  return line
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9<]/g, '')
}

function normalizeTd3Line1(rawLine: string) {
  let line = normalizeMrzCandidate(rawLine)

  const exactStart = line.indexOf('P<')
  if (exactStart >= 0) {
    line = line.slice(exactStart)
  } else {
    const passportStart = line.indexOf('P')

    if (passportStart < 0) {
      return line
    }

    line = line.slice(passportStart)

    // In a TD3 passport, line 1 always begins with P<. OCR often confuses
    // the filler '<' in position 2 with a letter. Only repair that fixed
    // structural position when the following issuing-state positions look
    // like three letters.
    if (
      line.length >= 5 &&
      line[1] !== '<' &&
      /^[A-Z]{3}$/.test(line.slice(2, 5))
    ) {
      line = `P<${line.slice(2)}`
    }
  }

  // TD3 passport line 1 is exactly 44 characters. Cropping trailing OCR
  // artifacts is structural normalization; it does not validate the name.
  if (line.length > 44) {
    return line.slice(0, 44)
  }

  const hasNameDelimiter = line.indexOf('<<', 5) >= 0

  // OCR engines sometimes omit a long run of trailing '<' filler characters.
  // Padding is safe only after the TD3 name delimiter has been observed; this
  // does not alter the recognized surname/given-name characters.
  if (line.length < 44 && hasNameDelimiter) {
    return line.padEnd(44, '<')
  }

  return line
}

function findMrzCandidates(text: string) {
  return text
    .split(/\r?\n/)
    .map(normalizeMrzCandidate)
    .filter((line) => line.length >= 30 && line.length <= 56)
}

function mrzCharacterValue(character: string) {
  if (character === '<') return 0

  if (/\d/.test(character)) {
    return Number(character)
  }

  const code = character.charCodeAt(0)
  if (code >= 65 && code <= 90) {
    return code - 55
  }

  return 0
}

function calculateCheckDigit(value: string) {
  const weights = [7, 3, 1]

  const total = [...value].reduce(
    (sum, character, index) =>
      sum + mrzCharacterValue(character) * weights[index % weights.length],
    0,
  )

  return String(total % 10)
}

function validateCheckDigit(value: string, expected: string) {
  if (!/^\d$/.test(expected)) return null
  return calculateCheckDigit(value) === expected
}

const digitConfusions: Record<string, string> = {
  O: '0',
  Q: '0',
  I: '1',
  L: '1',
  Z: '2',
  S: '5',
  G: '6',
  B: '8',
}

const alnumConfusions: Record<string, string> = {
  O: '0',
  '0': 'O',
  I: '1',
  '1': 'I',
  L: '1',
  Z: '2',
  '2': 'Z',
  S: '5',
  '5': 'S',
  G: '6',
  '6': 'G',
  B: '8',
  '8': 'B',
}

function getCharacterOptions(
  character: string,
  mode: 'numeric' | 'alnum',
) {
  if (mode === 'numeric') {
    if (/\d/.test(character)) return [character]

    const mapped = digitConfusions[character]
    return mapped ? [mapped] : []
  }

  if (character === '<') return ['<']

  const options = [character]
  const alternate = alnumConfusions[character]

  if (alternate && alternate !== character) {
    options.push(alternate)
  }

  return options
}

function enumerateVariants(
  value: string,
  mode: 'numeric' | 'alnum',
  maxVariants = 4096,
) {
  const options = [...value].map((character) =>
    getCharacterOptions(character, mode),
  )

  if (options.some((choices) => choices.length === 0)) {
    return []
  }

  const combinationCount = options.reduce(
    (total, choices) => total * choices.length,
    1,
  )

  if (combinationCount > maxVariants) {
    return []
  }

  let variants = ['']

  for (const choices of options) {
    const next: string[] = []

    for (const prefix of variants) {
      for (const choice of choices) {
        next.push(prefix + choice)
      }
    }

    variants = next
  }

  return variants
}

function repairFieldByCheckDigit(
  value: string,
  expected: string,
  mode: 'numeric' | 'alnum',
) {
  const expectedOptions = getCharacterOptions(expected, 'numeric')
  const variants = enumerateVariants(value, mode)

  if (!variants.length || !expectedOptions.length) {
    return null
  }

  const passing = new Map<string, { value: string; checkDigit: string }>()

  for (const candidate of variants) {
    for (const checkDigit of expectedOptions) {
      if (calculateCheckDigit(candidate) === checkDigit) {
        passing.set(`${candidate}|${checkDigit}`, {
          value: candidate,
          checkDigit,
        })
      }
    }
  }

  if (passing.size !== 1) {
    return null
  }

  return [...passing.values()][0]
}

function countDifferences(before: string, after: string) {
  const length = Math.max(before.length, after.length)
  let differences = 0

  for (let index = 0; index < length; index += 1) {
    if (before[index] !== after[index]) {
      differences += 1
    }
  }

  return differences
}

function repairTd3Line2(rawLine: string | null) {
  if (!rawLine || rawLine.length !== 44) {
    return {
      line: rawLine,
      repair: null as MrzRepairInfo | null,
    }
  }

  const characters = [...rawLine]
  const correctedFields: string[] = []
  let correctedCharacters = 0

  const repairField = (
    start: number,
    end: number,
    checkIndex: number,
    mode: 'numeric' | 'alnum',
    fieldName: string,
  ) => {
    const originalValue = characters.slice(start, end).join('')
    const originalCheck = characters[checkIndex]
    const currentValidation = validateCheckDigit(
      originalValue,
      originalCheck,
    )

    if (currentValidation === true) return

    const repaired = repairFieldByCheckDigit(
      originalValue,
      originalCheck,
      mode,
    )

    if (!repaired) return

    correctedCharacters +=
      countDifferences(originalValue, repaired.value) +
      (originalCheck === repaired.checkDigit ? 0 : 1)

    characters.splice(
      start,
      end - start,
      ...repaired.value,
    )
    characters[checkIndex] = repaired.checkDigit
    correctedFields.push(fieldName)
  }

  repairField(0, 9, 9, 'alnum', 'documentNumber')
  repairField(13, 19, 19, 'numeric', 'birthDate')
  repairField(21, 27, 27, 'numeric', 'expiryDate')

  // Personal number is optional/issuer-specific. Repair it only when its
  // own check digit is numeric and the search space stays uniquely solvable.
  if (/\d/.test(characters[42])) {
    repairField(28, 42, 42, 'alnum', 'personalNumber')
  }

  // The composite digit itself can be confused with a letter. At this point
  // protected fields have already been repaired independently.
  const compositeValue =
    characters.slice(0, 10).join('') +
    characters.slice(13, 20).join('') +
    characters.slice(21, 43).join('')

  const compositeExpectedOptions = getCharacterOptions(
    characters[43],
    'numeric',
  )

  if (
    validateCheckDigit(compositeValue, characters[43]) !== true &&
    compositeExpectedOptions.length === 1 &&
    calculateCheckDigit(compositeValue) === compositeExpectedOptions[0]
  ) {
    if (characters[43] !== compositeExpectedOptions[0]) {
      correctedCharacters += 1
      characters[43] = compositeExpectedOptions[0]
      correctedFields.push('compositeCheckDigit')
    }
  }

  return {
    line: characters.join(''),
    repair:
      correctedCharacters > 0
        ? {
            correctedCharacters,
            correctedFields,
          }
        : null,
  }
}

function validateTd3Line2(line2: string | null): MrzValidation | null {
  if (!line2 || line2.length !== 44) {
    return null
  }

  const documentNumberCheck = validateCheckDigit(
    line2.slice(0, 9),
    line2[9],
  )
  const birthDateCheck = validateCheckDigit(
    line2.slice(13, 19),
    line2[19],
  )
  const expiryDateCheck = validateCheckDigit(
    line2.slice(21, 27),
    line2[27],
  )
  const personalNumberCheck = validateCheckDigit(
    line2.slice(28, 42),
    line2[42],
  )
  const compositeCheck = validateCheckDigit(
    line2.slice(0, 10) +
      line2.slice(13, 20) +
      line2.slice(21, 43),
    line2[43],
  )

  return {
    documentNumber: documentNumberCheck,
    birthDate: birthDateCheck,
    expiryDate: expiryDateCheck,
    personalNumber: personalNumberCheck,
    composite: compositeCheck,
    requiredValid:
      documentNumberCheck === true &&
      birthDateCheck === true &&
      expiryDateCheck === true &&
      compositeCheck === true,
  }
}

function cleanMrzName(value: string) {
  return value.replace(/<+/g, ' ').trim().replace(/\s+/g, ' ')
}

function parseTd3Mrz(
  line1: string | null,
  line2: string | null,
  validation: MrzValidation | null,
): ParsedMrz | null {
  if (
    !line1 ||
    !line2 ||
    line1.length !== 44 ||
    line2.length !== 44 ||
    !validation
  ) {
    return null
  }

  const nameField = line1.slice(5)
  const [surnameRaw = '', ...givenParts] = nameField.split('<<')

  return {
    line1,
    line2,
    documentCode: line1.slice(0, 2),
    issuingState: line1.slice(2, 5),
    surname: cleanMrzName(surnameRaw),
    givenNames: cleanMrzName(givenParts.join(' ')),
    documentNumber: line2.slice(0, 9).replace(/</g, ''),
    nationality: line2.slice(10, 13),
    birthDate: line2.slice(13, 19),
    sex: line2[20],
    expiryDate: line2.slice(21, 27),
    personalNumber: line2.slice(28, 42).replace(/<+$/g, ''),
    validation,
  }
}

function otsuThreshold(grayValues: Uint8Array) {
  const histogram = new Array<number>(256).fill(0)

  for (const value of grayValues) {
    histogram[value] += 1
  }

  const total = grayValues.length
  let weightedTotal = 0

  for (let value = 0; value < 256; value += 1) {
    weightedTotal += value * histogram[value]
  }

  let backgroundWeight = 0
  let backgroundSum = 0
  let bestVariance = -1
  let bestThreshold = 128

  for (let threshold = 0; threshold < 256; threshold += 1) {
    backgroundWeight += histogram[threshold]
    if (backgroundWeight === 0) continue

    const foregroundWeight = total - backgroundWeight
    if (foregroundWeight === 0) break

    backgroundSum += threshold * histogram[threshold]

    const backgroundMean = backgroundSum / backgroundWeight
    const foregroundMean =
      (weightedTotal - backgroundSum) / foregroundWeight

    const variance =
      backgroundWeight *
      foregroundWeight *
      (backgroundMean - foregroundMean) ** 2

    if (variance > bestVariance) {
      bestVariance = variance
      bestThreshold = threshold
    }
  }

  return bestThreshold
}

function findTextBands(
  binary: Uint8Array,
  width: number,
  height: number,
) {
  const rowCounts = new Array<number>(height).fill(0)

  for (let y = 0; y < height; y += 1) {
    let count = 0

    for (let x = 0; x < width; x += 1) {
      if (binary[y * width + x] === 0) {
        count += 1
      }
    }

    rowCounts[y] = count
  }

  const minimumInk = Math.max(8, Math.floor(width * 0.012))
  const activeRows = rowCounts
    .map((count, index) => ({ count, index }))
    .filter(({ count }) => count >= minimumInk)
    .map(({ index }) => index)

  if (!activeRows.length) return []

  const rawBands: Array<{ start: number; end: number }> = []
  const maxGap = Math.max(3, Math.floor(height * 0.02))

  let start = activeRows[0]
  let previous = activeRows[0]

  for (let index = 1; index < activeRows.length; index += 1) {
    const current = activeRows[index]

    if (current - previous > maxGap) {
      rawBands.push({ start, end: previous })
      start = current
    }

    previous = current
  }

  rawBands.push({ start, end: previous })

  return rawBands
    .filter((band) => band.end - band.start + 1 >= 8)
    .map((band) => ({
      ...band,
      inkScore: rowCounts
        .slice(band.start, band.end + 1)
        .reduce((sum, count) => sum + count, 0),
    }))
}

async function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result)
      } else {
        reject(new Error('無法建立 MRZ 圖片。'))
      }
    }, 'image/png')
  })
}

async function createMrzPreparedImages(
  image: File,
): Promise<MrzPreparedImages> {
  const bitmap = await createImageBitmap(image)

  // TD3 MRZ is at the bottom of the passport data page. Keep the crop tight
  // so security artwork and portrait/text above the MRZ do not pollute OCR.
  const cropRatio = 0.24
  const sourceY = Math.floor(bitmap.height * (1 - cropRatio))
  const sourceHeight = bitmap.height - sourceY

  const targetWidth = Math.round(
    Math.min(1900, Math.max(1500, bitmap.width * 1.25)),
  )
  const scale = targetWidth / bitmap.width
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    throw new Error('無法建立 MRZ 影像處理 Canvas。')
  }

  context.drawImage(
    bitmap,
    0,
    sourceY,
    bitmap.width,
    sourceHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  )

  bitmap.close()

  const imageData = context.getImageData(0, 0, targetWidth, targetHeight)
  const pixels = imageData.data
  const grayValues = new Uint8Array(targetWidth * targetHeight)

  for (let pixelIndex = 0, grayIndex = 0; pixelIndex < pixels.length; pixelIndex += 4, grayIndex += 1) {
    const gray = Math.round(
      pixels[pixelIndex] * 0.299 +
      pixels[pixelIndex + 1] * 0.587 +
      pixels[pixelIndex + 2] * 0.114,
    )

    grayValues[grayIndex] = gray
  }

  const threshold = otsuThreshold(grayValues)
  const binary = new Uint8Array(grayValues.length)

  for (let grayIndex = 0, pixelIndex = 0; grayIndex < grayValues.length; grayIndex += 1, pixelIndex += 4) {
    const value = grayValues[grayIndex] < threshold ? 0 : 255
    binary[grayIndex] = value

    pixels[pixelIndex] = value
    pixels[pixelIndex + 1] = value
    pixels[pixelIndex + 2] = value
    pixels[pixelIndex + 3] = 255
  }

  context.putImageData(imageData, 0, 0)
  const crop = await canvasToBlob(canvas)

  const detectedBands = findTextBands(binary, targetWidth, targetHeight)
  const bands = detectedBands
    .sort((a, b) => b.inkScore - a.inkScore)
    .slice(0, 2)
    .sort((a, b) => a.start - b.start)

  if (bands.length < 2) {
    return { crop, lines: [] }
  }

  const lineBlobs: Blob[] = []

  for (const band of bands) {
    const marginY = Math.max(10, Math.round((band.end - band.start + 1) * 0.35))
    const startY = Math.max(0, band.start - marginY)
    const endY = Math.min(targetHeight - 1, band.end + marginY)
    const lineHeight = endY - startY + 1

    const lineCanvas = document.createElement('canvas')
    lineCanvas.width = targetWidth
    lineCanvas.height = lineHeight

    const lineContext = lineCanvas.getContext('2d')
    if (!lineContext) {
      throw new Error('無法建立 MRZ 單行 Canvas。')
    }

    lineContext.fillStyle = '#ffffff'
    lineContext.fillRect(0, 0, lineCanvas.width, lineCanvas.height)
    lineContext.drawImage(
      canvas,
      0,
      startY,
      targetWidth,
      lineHeight,
      0,
      0,
      targetWidth,
      lineHeight,
    )

    lineBlobs.push(await canvasToBlob(lineCanvas))
  }

  return {
    crop,
    lines: lineBlobs,
  }
}

async function getWorker(onProgress?: (progress: OcrProgress) => void) {
  progressHandler = onProgress ?? null

  if (worker) return worker

  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
      logger(message) {
        progressHandler?.({
          status: message.status,
          progress: Math.max(
            0,
            Math.min(
              1,
              progressOffset +
                (message.progress ?? 0) * progressScale,
            ),
          ),
        })
      },
    }).then((createdWorker) => {
      worker = createdWorker
      return createdWorker
    })
  }

  return workerPromise
}

export async function recognizePassport(
  image: File,
  onProgress?: (progress: OcrProgress) => void,
): Promise<OcrResult> {
  const totalStartedAt = performance.now()

  progressOffset = 0
  progressScale = 0.12

  const initializationStartedAt = performance.now()
  const activeWorker = await getWorker(onProgress)
  const initializationMs = performance.now() - initializationStartedAt

  progressOffset = 0.12
  progressScale = 0.38

  await activeWorker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.AUTO,
    tessedit_char_whitelist: '',
    preserve_interword_spaces: '1',
  })

  const fullPageStartedAt = performance.now()
  const fullPageResult = await activeWorker.recognize(image)
  const fullPageMs = performance.now() - fullPageStartedAt

  onProgress?.({
    status: 'preprocessing MRZ',
    progress: 0.52,
  })

  const preprocessingStartedAt = performance.now()
  const prepared = await createMrzPreparedImages(image)
  const preprocessingMs = performance.now() - preprocessingStartedAt

  await activeWorker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
    preserve_interword_spaces: '0',
  })

  const mrzPassStartedAt = performance.now()
  const rawLines: string[] = []

  if (prepared.lines.length === 2) {
    for (let index = 0; index < prepared.lines.length; index += 1) {
      progressOffset = 0.56 + index * 0.21
      progressScale = 0.21

      const result = await activeWorker.recognize(prepared.lines[index])
      rawLines.push(result.data.text)
    }
  } else {
    progressOffset = 0.56
    progressScale = 0.44

    await activeWorker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
      preserve_interword_spaces: '0',
    })

    const fallback = await activeWorker.recognize(prepared.crop)
    rawLines.push(...fallback.data.text.split(/\r?\n/))
  }

  let normalizedLines = rawLines
    .map(normalizeMrzCandidate)
    .filter((line) => line.length >= 20)

  const hasLikelyLine1 = normalizedLines.some((line) => line.startsWith('P'))
  const hasLikelyLine2 = normalizedLines.some(
    (line) =>
      !line.startsWith('P') &&
      Math.abs(line.length - 44) <= 4 &&
      (line.match(/\d/g)?.length ?? 0) >= 10,
  )

  // If single-line segmentation misses one MRZ row, recover by OCRing the
  // whole prepared crop as a block and merge those candidates.
  if (!hasLikelyLine1 || !hasLikelyLine2) {
    await activeWorker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
      preserve_interword_spaces: '0',
    })

    progressOffset = 0.92
    progressScale = 0.08

    const fallback = await activeWorker.recognize(prepared.crop)

    normalizedLines = Array.from(
      new Set([
        ...normalizedLines,
        ...fallback.data.text
          .split(/\r?\n/)
          .map(normalizeMrzCandidate)
          .filter((line) => line.length >= 20),
      ]),
    )
  }

  const mrzPassMs = performance.now() - mrzPassStartedAt

  const dedicatedLine1Source =
    normalizedLines
      .filter((line) => line.startsWith('P'))
      .sort((a, b) => Math.abs(a.length - 44) - Math.abs(b.length - 44))[0] ??
    null

  const fullPageLine1Source =
    findMrzCandidates(fullPageResult.data.text)
      .filter((line) => line.startsWith('P'))
      .sort((a, b) => Math.abs(a.length - 44) - Math.abs(b.length - 44))[0] ??
    null

  const line1Source = dedicatedLine1Source ?? fullPageLine1Source
  const mrzLine1Source =
    dedicatedLine1Source
      ? 'dedicated'
      : fullPageLine1Source
        ? 'full-page'
        : null

  const line2Source =
    normalizedLines
      .filter((line) => !line.startsWith('P'))
      .sort((a, b) => {
        const score = (line: string) =>
          Math.abs(line.length - 44) +
          ((line.match(/\d/g)?.length ?? 0) < 10 ? 20 : 0)

        return score(a) - score(b)
      })[0] ??
    null

  const mrzLine1 = line1Source ? normalizeTd3Line1(line1Source) : null
  const rawMrzLine2 = line2Source
    ? normalizeMrzCandidate(line2Source)
    : null
  const repairedLine2 = repairTd3Line2(rawMrzLine2)
  const mrzLine2 = repairedLine2.line
  const mrzRepair = repairedLine2.repair

  const line2Validation = validateTd3Line2(mrzLine2)
  const parsedMrz = parseTd3Mrz(
    mrzLine1,
    mrzLine2,
    line2Validation,
  )

  onProgress?.({
    status: 'done',
    progress: 1,
  })

  return {
    text: fullPageResult.data.text.trim(),
    mrzText: rawLines.join('\n').trim(),
    mrzCandidates: normalizedLines,
    mrzLine1,
    mrzLine2,
    mrzLine1Source,
    line2Validation,
    mrzRepair,
    parsedMrz,
    mrzCrop: prepared.crop,
    elapsedMs: performance.now() - totalStartedAt,
    initializationMs,
    fullPageMs,
    preprocessingMs,
    mrzPassMs,
  }
}

export async function terminateOcrWorker() {
  if (worker) {
    await worker.terminate()
  }

  worker = null
  workerPromise = null
  progressHandler = null
  progressOffset = 0
  progressScale = 1
}
