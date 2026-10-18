#!/usr/bin/env node
// D-121. Local-only OCR asset preflight; never reads images, people, or database.
const base = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '')
const paths = [
  '/paddle-models/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_onnx_infer.tar',
  '/paddle-models/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_rec_onnx_infer.tar',
  '/paddle-models/experiments/PP-OCRv6_small_det_onnx_infer.tar',
  '/paddle-models/experiments/PP-OCRv6_small_rec_onnx_infer.tar',
]
async function test(path, expected) {
  const url = base + path
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(15000)})
    const type = response.headers.get('content-type') || ''
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const buf = new Uint8Array(await response.arrayBuffer())
    if (buf.length < 1024) throw new Error('Unexpectedly small payload: ' + buf.length)
    if (expected === 'tar') {
      const header = new TextDecoder('ascii').decode(buf.slice(257, 263))
      if (!header.startsWith('ustar')) throw new Error('Not a tar archive (possible SPA HTML fallback)')
    } else if (expected === 'wasm' && ![0, 97, 115, 109].every((n,i)=>buf[i] === n)) {
      throw new Error('Invalid WASM magic bytes')
    }
    console.log('PASS',path,buf.length+' bytes',type)
    return true
  } catch (error) {
    console.error('FAIL',path, error instanceof Error ? error.message : String(error))
    return false
  }
}
let results = await Promise.all(paths.map(p => test(p,'tar')))
const index = await fetch(base + '/').then(r=>r.text()).catch(()=> '')
if (!index.includes('<html')) { console.error('FAIL web homepage unavailable'); results.push(false) }
console.log(results.every(Boolean) ? 'OCR ASSET PREFLIGHT PASS' : 'OCR ASSET PREFLIGHT FAILED')
process.exitCode = results.every(Boolean) ? 0 : 1
