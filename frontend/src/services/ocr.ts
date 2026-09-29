import * as Tesseract from 'tesseract.js'

export interface OcrProgress {
  status: string
  progress: number
}

export interface OcrResult {
  text: string
  elapsedMs: number
  mrzCandidates: string[]
}

type OcrWorker = Awaited<ReturnType<typeof Tesseract.createWorker>>

let worker: OcrWorker | null = null
let workerPromise: Promise<OcrWorker> | null = null
let progressHandler: ((progress: OcrProgress) => void) | null = null

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
    .filter((line) => line.includes('<') && line.length >= 30)
    .slice(-3)
}

async function getWorker(onProgress?: (progress: OcrProgress) => void) {
  progressHandler = onProgress ?? null

  if (worker) return worker

  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
      logger(message) {
        progressHandler?.({
          status: message.status,
          progress: Math.max(0, Math.min(1, message.progress ?? 0)),
        })
      },
    }).then(async (createdWorker) => {
      await createdWorker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        preserve_interword_spaces: '1',
      })

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
  const startedAt = performance.now()
  const activeWorker = await getWorker(onProgress)
  const result = await activeWorker.recognize(image)
  const elapsedMs = performance.now() - startedAt

  return {
    text: result.data.text.trim(),
    elapsedMs,
    mrzCandidates: findMrzCandidates(result.data.text),
  }
}

export async function terminateOcrWorker() {
  if (worker) {
    await worker.terminate()
  }

  worker = null
  workerPromise = null
  progressHandler = null
}
