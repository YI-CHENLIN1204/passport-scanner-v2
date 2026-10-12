import { PaddleOCR } from '@paddleocr/paddleocr-js'

interface ServerManifest {
  modelName: string
  archive: string
}
export interface ServerRecognitionSmokeResult {
  initialized: true
  input: 'synthetic-only'
  modelName: string
  detections: number
  elapsedMs: number
  backend: 'auto' | 'wasm'
  webgpuFallback: boolean
}

const base = '/paddle-models/experiments/'
const mobileDetection = '/paddle-models/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_onnx_infer.tar'

function isManifest(value: unknown): value is ServerManifest {
  if (!value || typeof value !== 'object') return false
  const m = value as Record<string, unknown>
  return (
    (m.modelName === 'PP-OCRv5_server_rec' ||
      m.modelName === 'PP-OCRv5_server_rec_onnx') &&
    m.archive === 'PP-OCRv5_server_rec_onnx.tar'
  )
}

async function syntheticImage(): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 240
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('無法初始化合成測試 Canvas')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'black'
  ctx.font = 'bold 60px sans-serif'
  ctx.fillText('中文姓名 測試甲乙', 45, 145)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result
      ? resolve(result)
      : reject(new Error('合成圖片建立失敗')), 'image/png')
  })
  return new File([blob], 'synthetic-server-recognition.png', { type: 'image/png' })
}

/**
 * Opt-in, read-only browser runtime smoke test.
 * Only a canvas-generated synthetic image is passed to the experiment.
 * Does not call production getPaddle, use customer images, or write data.
 */
export async function smokeTestServerRecognition(): Promise<ServerRecognitionSmokeResult> {
  const manifestResponse = await fetch(base + 'server-rec-manifest.json', {
    cache: 'no-store',
  })
  if (!manifestResponse.ok) throw new Error('尚未準備 Server Recognition 本機模型資產')
  const manifest: unknown = await manifestResponse.json()
  if (!isManifest(manifest)) throw new Error('Server Recognition 模型 manifest 不符合預期')
  const modelUrl = base + manifest.archive
  const modelResponse = await fetch(modelUrl, { method: 'HEAD', cache: 'no-store' })
  if (!modelResponse.ok) throw new Error('本機 Server Recognition 模型檔案不存在')

  const started = performance.now()
  const sample = await syntheticImage()
  const create = (backend: 'auto' | 'wasm') => PaddleOCR.create({
    lang: 'chinese_cht',
    ocrVersion: 'PP-OCRv5',
    textDetectionModelName: 'PP-OCRv5_mobile_det',
    textDetectionModelAsset: { url: mobileDetection },
    textRecognitionModelName: manifest.modelName,
    textRecognitionModelAsset: { url: modelUrl },
    ortOptions: backend === 'wasm'
      ? { backend: 'wasm', numThreads: 1, wasmPaths: '/ort-wasm/' }
      : { backend: 'auto' },
  })
  const execute = async (backend: 'auto' | 'wasm', fallback: boolean) => {
    const instance = await create(backend)
    try {
      const prediction = await instance.predict(sample)
      const result = Array.isArray(prediction) ? prediction[0] : prediction
      const obj = result as unknown as Record<string, unknown> | null
      const texts = obj?.rec_texts ?? obj?.texts
      return {
        initialized: true as const,
        input: 'synthetic-only' as const,
        modelName: manifest.modelName,
        detections: Array.isArray(texts) ? texts.length : 0,
        elapsedMs: Math.round(performance.now() - started),
        backend,
        webgpuFallback: fallback,
      }
    } finally {
      await instance.dispose()
    }
  }

  try {
    return await execute('auto', false)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Retry only the recognized WebGPU MaxPool limitation; preserve other
    // errors rather than masking invalid model assets or SDK failures.
    if (!/ceil_mode[\\s\\S]*WebGPU MaxPool|WebGPU MaxPool[\\s\\S]*ceil_mode/i.test(message)) {
      throw error
    }
    return execute('wasm', true)
  }
}
