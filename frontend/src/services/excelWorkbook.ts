// Dependency-free XLSX writer for browser-only, private local exports.
// All cells are inline strings: IDs retain leading zeros and letters.
export type ExcelSheet = {
  name: string
  headers: string[]
  rows: string[][]
}

const utf8 = new TextEncoder()
const xml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

const columnName = (index: number) => {
  let value = index + 1
  let name = ''
  while (value) {
    value--
    name = String.fromCharCode(65 + value % 26) + name
    value = Math.floor(value / 26)
  }
  return name
}

function spreadsheetXml(sheet: ExcelSheet) {
  const all = [sheet.headers, ...sheet.rows]
  const widths = sheet.headers.map((header, col) =>
    Math.min(48, Math.max(14, ...all.map(row => {
      const text = String(row[col] ?? '')
      return [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0) + 3
    })))
  )
  const cols = widths.map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
  ).join('')
  const rows = all.map((values, ri) =>
    `<row r="${ri + 1}">${sheet.headers.map((_, ci) => {
      const value = xml(String(values[ci] ?? ''))
      return `<c r="${columnName(ci)}${ri + 1}" s="${ri === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${value}</t></is></c>`
    }).join('')}</row>`,
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${rows}</sheetData>
<autoFilter ref="A1:${columnName(sheet.headers.length - 1)}${Math.max(1, all.length)}"/>
</worksheet>`
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zip(files: { path: string; data: string }[]) {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const put16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true)
  const put32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true)
  for (const file of files) {
    const name = utf8.encode(file.path)
    const data = utf8.encode(file.data)
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    put32(lv, 0, 0x04034b50)
    put16(lv, 4, 20)
    put16(lv, 6, 0x0800)
    put32(lv, 14, crc)
    put32(lv, 18, data.length)
    put32(lv, 22, data.length)
    put16(lv, 26, name.length)
    local.set(name, 30)
    chunks.push(local, data)

    const record = new Uint8Array(46 + name.length)
    const cv = new DataView(record.buffer)
    put32(cv, 0, 0x02014b50)
    put16(cv, 4, 20)
    put16(cv, 6, 20)
    put16(cv, 8, 0x0800)
    put32(cv, 16, crc)
    put32(cv, 20, data.length)
    put32(cv, 24, data.length)
    put16(cv, 28, name.length)
    put32(cv, 42, offset)
    record.set(name, 46)
    central.push(record)
    offset += local.length + data.length
  }

  const centralLength = central.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  put32(ev, 0, 0x06054b50)
  put16(ev, 8, files.length)
  put16(ev, 10, files.length)
  put32(ev, 12, centralLength)
  put32(ev, 16, offset)
  const parts = [...chunks, ...central, end]
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let pos = 0
  for (const part of parts) {
    output.set(part, pos)
    pos += part.length
  }
  return output
}

export function createExcelWorkbook(sheets: ExcelSheet[]): Uint8Array {
  if (!sheets.length || sheets.some(sheet => !sheet.headers.length)) {
    throw new Error('Excel 至少需要一個工作表及一個欄位。')
  }
  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    ...sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
    '</Types>',
  ].join('')
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="11"/><name val="Microsoft JhengHei"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs>
</styleSheet>`
  return zip([
    { path: '[Content_Types].xml', data: contentTypes },
    { path: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { path: 'xl/workbook.xml', data: workbook },
    { path: 'xl/_rels/workbook.xml.rels', data: rels },
    { path: 'xl/styles.xml', data: styles },
    ...sheets.map((sheet, i) => ({ path: `xl/worksheets/sheet${i + 1}.xml`, data: spreadsheetXml(sheet) })),
  ])
}
