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
  parsedMrz: ParsedMrz | null
  mrzCrop: Blob
  elapsedMs: number
  initializationMs: number
  fullPageMs: number
  preprocessingMs: number
  mrzPassMs: number
}

type OcrWorker = Awaited<ReturnType<typeof Tesseract.createWorker>>

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

function findMrzCandidates(text: string) {
  return text
    .split(/\r?\n/)
    .map(normalizeMrzCandidate)
    .filter((line) => line.length >= 30 && line.length <= 52)
}

function selectTd3Lines(text: string) {
  const candidates = findMrzCandidates(text)

  if (candidates.length < 2) {
    return { candidates, line1: null, line2: null }
  }

  const firstLineCandidates = candidates
    .map((line, index) => ({
      line,
      index,
      score:
        Math.abs(line.length - 44) +
        (line.startsWith('P<') ? 0 : line.startsWith('P') ? 2 : 10),
    }))
    .sort((a, b) => a.score - b.score)

  const first = firstLineCandidates[0]

  const secondLineCandidates = candidates
    .map((line, index) => ({
      line,
      index,
      score:
        Math.abs(line.length - 44) +
        (index === first.index ? 100 : 0),
    }))
    .sort((a, b) => a.score - b.score)

  return {
    candidates,
    line1: first.line,
    line2: secondLineCandidates[0].line,
  }
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

function cleanMrzName(value: string) {
  return value.replace(/<+/g, ' ').trim().replace(/\s+/g, ' ')
}

function parseTd3Mrz(line1: string | null, line2: string | null): ParsedMrz | null {
  if (!line1 || !line2 || line1.length !== 44 || line2.length !== 44) {
    return null
  }

  const nameField = line1.slice(5)
  const [surnameRaw = '', ...givenParts] = nameField.split('<<')

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

  const requiredValid =
    documentNumberCheck === true &&
    birthDateCheck === true &&
    expiryDateCheck === true &&
    compositeCheck === true

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
    validation: {
      documentNumber: documentNumberCheck,
      birthDate: birthDateCheck,
      expiryDate: expiryDateCheck,
      personalNumber: personalNumberCheck,
      composite: compositeCheck,
      requiredValid,
    },
  }
}

async function createMrzCrop(image: File) {
  const bitmap = await createImageBitmap(image)
  const cropRatio = 0.34
  const sourceY = Math.floor(bitmap.height * (1 - cropRatio))
  const sourceHeight = bitmap.height - sourceY

  const targetWidth = Math.round(
    Math.min(2400, Math.max(1800, bitmap.width * 1.5)),
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

  for (let index = 0; index < pixels.length; index += 4) {
    const gray =
      pixels[index] * 0.299 +
      pixels[index + 1] * 0.587 +
      pixels[index + 2] * 0.114

    const contrasted = Math.max(
      0,
      Math.min(255, (gray - 128) * 1.65 + 128),
    )

    pixels[index] = contrasted
    pixels[index + 1] = contrasted
    pixels[index + 2] = contrasted
  }

  context.putImageData(imageData, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result)
      } else {
        reject(new Error('無法建立 MRZ 裁切圖片。'))
      }
    }, 'image/png')
  })

  return blob
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
  progressScale = 0.15

  const initializationStartedAt = performance.now()
  const activeWorker = await getWorker(onProgress)
  const initializationMs = performance.now() - initializationStartedAt

  progressOffset = 0.15
  progressScale = 0.45

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
    progress: 0.62,
  })

  const preprocessingStartedAt = performance.now()
  const mrzCrop = await createMrzCrop(image)
  const preprocessingMs = performance.now() - preprocessingStartedAt

  progressOffset = 0.64
  progressScale = 0.36

  await activeWorker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
    preserve_interword_spaces: '0',
  })

  const mrzPassStartedAt = performance.now()
  const mrzResult = await activeWorker.recognize(mrzCrop)
  const mrzPassMs = performance.now() - mrzPassStartedAt

  const selected = selectTd3Lines(mrzResult.data.text)
  const parsedMrz = parseTd3Mrz(selected.line1, selected.line2)

  onProgress?.({
    status: 'done',
    progress: 1,
  })

  return {
    text: fullPageResult.data.text.trim(),
    mrzText: mrzResult.data.text.trim(),
    mrzCandidates: selected.candidates,
    parsedMrz,
    mrzCrop,
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
