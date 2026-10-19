import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const vue = readFileSync('src/views/TourDetailPage.vue', 'utf8')
const service = readFileSync('src/services/excelWorkbook.ts', 'utf8')
const js = ts.transpileModule(
  service.replace(/export type ExcelSheet = \{[\s\S]*?\n\}/, ''),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText
const module = { exports: {} }
new Function('module', 'exports', js)(module, module.exports)
const { createExcelWorkbook } = module.exports

const bytes = createExcelWorkbook([
  {
    name: '護照',
    headers: ['中文姓名', '英文姓', '護照號碼', '有效期限'],
    rows: [['温明', 'WEN', 'A00123', '2035-04-07']],
  },
  {
    name: '總表',
    headers: ['姓名', '身分證字號'],
    rows: [['溫明', 'A012345678'], ['零前綴', '00123456']],
  },
])
assert.equal(Buffer.from(bytes.subarray(0, 4)).toString('hex'), '504b0304')

// Read local ZIP headers to inspect real generated Excel contents.
const entries = new Map()
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
let pos = 0
while (pos + 30 < bytes.length && view.getUint32(pos, true) === 0x04034b50) {
  const length = view.getUint32(pos + 18, true)
  const nameLength = view.getUint16(pos + 26, true)
  const extraLength = view.getUint16(pos + 28, true)
  const name = new TextDecoder().decode(bytes.subarray(pos + 30, pos + 30 + nameLength))
  const offset = pos + 30 + nameLength + extraLength
  entries.set(name, new TextDecoder().decode(bytes.subarray(offset, offset + length)))
  pos = offset + length
}
assert.ok(entries.has('[Content_Types].xml'))
assert.ok(entries.has('xl/workbook.xml'))
assert.ok(entries.has('xl/styles.xml'))
assert.ok(entries.has('xl/worksheets/sheet1.xml'))
assert.ok(entries.has('xl/worksheets/sheet2.xml'))
assert.match(entries.get('xl/workbook.xml'), /name="護照"/)
assert.match(entries.get('xl/workbook.xml'), /name="總表"/)
assert.match(entries.get('xl/worksheets/sheet1.xml'), /温明/)
assert.match(entries.get('xl/worksheets/sheet1.xml'), /A00123/)
assert.match(entries.get('xl/worksheets/sheet1.xml'), /2035-04-07/)
assert.match(entries.get('xl/worksheets/sheet2.xml'), /00123456/)
assert.match(entries.get('xl/worksheets/sheet1.xml'), /customWidth="1"/)
assert.match(entries.get('xl/styles.xml'), /horizontal="center"/)
assert.match(entries.get('xl/styles.xml'), /numFmtId="49"/)
assert.match(vue, /function buildExportSheet\(kind: ExportKind\)/)
assert.match(vue, /createExcelWorkbook\(\[buildExportSheet\(kind\)\]\)/)
assert.match(vue, /for \(const kind of kinds\)/)
assert.match(vue, /safeFilename\(exportKindLabel\(kind\)\)/)
assert.doesNotMatch(vue, /createExcelWorkbook\(kinds\.map/)
assert.match(vue, /exportConfiguredExcel/)
assert.match(vue, /\.xlsx/)
assert.doesNotMatch(vue, /downloadCsvFile|exportConfiguredCsv/)

console.log('D-132 XLSX formatting and separate-file export guards passed.')
