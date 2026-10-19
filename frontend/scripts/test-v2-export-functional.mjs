import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync('src/views/TourDetailPage.vue', 'utf8')

// Exercise the actual production CSV functions, not reimplemented copies.
// These helpers are deliberately extracted only inside this synthetic test.
function extract(start, end) {
  const from = source.indexOf(start)
  const until = source.indexOf(end, from + start.length)
  assert.ok(from >= 0 && until > from, `Missing CSV function: ${start}`)
  return source.slice(from, until)
}

const code = [
  extract('function escapeCsv(', 'function membersForExport('),
  extract('function membersForExport(', 'function buildExportCsv('),
  extract('function buildExportCsv(', 'function safeFilename('),
].join('\n')

const js = ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

const data = {
  tour: { requiredDocumentTypes: ['PASSPORT', 'TAIWAN_COMPATRIOT_PERMIT'] },
  members: [
    {
      nameZh: '溫明',
      nameEn: 'WEN MING',
      birthDate: '1991-05-06',
      gender: 'M',
      nationality: 'TWN',
      nationalIdNumber: '',
      documents: [
        { documentType: 'PASSPORT', documentNumber: 'T88776655' },
        { documentType: 'TAIWAN_COMPATRIOT_PERMIT', documentNumber: '87654320' },
      ],
    },
    {
      nameZh: '測試,「人」',
      nameEn: 'TEST PERSON',
      birthDate: '1992-02-03',
      gender: 'F',
      nationality: 'TWN',
      nationalIdNumber: '',
      documents: [{ documentType: 'PASSPORT', documentNumber: 'T77889900' }],
    },
  ],
}

const detail = { value: data }
const exportColumns = { value: {
  TOTAL: ['passportNumber', 'nameZh', 'birthDate'],
  PASSPORT: ['nameZh', 'passportNumber'],
  TAIWAN_COMPATRIOT_PERMIT: ['nameZh', 'permitNumber'],
  TAIWAN_NATIONAL_ID: ['nameZh'],
} }
const labels = {
  passportNumber: '護照號碼',
  nameZh: '中文姓名',
  birthDate: '出生日期',
  permitNumber: '台胞證號碼',
}
const exportFieldsFor = kind =>
  Object.keys(labels).map(key => ({ key, label: labels[key] }))
const exportFieldValue = (member, key) => ({
  passportNumber: member.documents.find(d => d.documentType === 'PASSPORT')?.documentNumber ?? '',
  permitNumber: member.documents.find(d => d.documentType === 'TAIWAN_COMPATRIOT_PERMIT')?.documentNumber ?? '',
  nameZh: member.nameZh,
  birthDate: member.birthDate,
})[key] ?? ''

const load = new Function(
  'detail', 'exportColumns', 'exportFieldsFor', 'exportFieldValue',
  `${js}; return { escapeCsv, membersForExport, buildExportCsv }`,
)
const { escapeCsv, membersForExport, buildExportCsv } =
  load(detail, exportColumns, exportFieldsFor, exportFieldValue)

assert.equal(escapeCsv('a"b,c'), '"a""b,c"')
assert.equal(escapeCsv('溫明'), '"溫明"')
assert.deepEqual(membersForExport('TAIWAN_COMPATRIOT_PERMIT').map(m => m.nameZh), ['溫明'])
assert.equal(
  buildExportCsv('TOTAL'),
  [
    '"護照號碼","中文姓名","出生日期"',
    '"T88776655","溫明","1991-05-06"',
    '"T77889900","測試,「人」","1992-02-03"',
  ].join('\r\n'),
)
assert.equal(
  buildExportCsv('TAIWAN_COMPATRIOT_PERMIT'),
  ['"中文姓名","台胞證號碼"', '"溫明","87654320"'].join('\r\n'),
)

// Changing the chosen column order must change both header and values.
exportColumns.value.TOTAL = ['birthDate', 'nameZh']
assert.equal(
  buildExportCsv('TOTAL').split('\r\n')[0],
  '"出生日期","中文姓名"',
)
assert.equal(
  buildExportCsv('TOTAL').split('\r\n')[1],
  '"1991-05-06","溫明"',
)

assert.match(source, /const blob = new Blob/)
assert.ok(source.includes(String.raw`'\ufeff'`))
assert.match(source, /exportConfiguredCsv\(\)/)
assert.match(source, /persistExportColumns\(kind\)/)

console.log('D-132 production CSV synthetic content, filtering, and column order passed.')
