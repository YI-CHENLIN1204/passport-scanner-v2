import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const tour = readFileSync('src/views/TourDetailPage.vue', 'utf8')
const travelers = readFileSync('src/views/TravelersPage.vue', 'utf8')
const travelerStore = readFileSync('../backend/PassportScanner.Api/Persistence/PostgresTravelerStore.cs', 'utf8')
const compose = readFileSync('../docker-compose.yml', 'utf8')
const backup = readFileSync('../scripts/backup-db.ps1', 'utf8')
const restore = readFileSync('../scripts/restore-db.ps1', 'utf8')
const acceptance = readFileSync('../scripts/verify-v2-launch.ps1', 'utf8')

// Launch-critical XLSX behavior stays configurable and local to reviewed formal data.
assert.match(tour, /type ExportKind =[\s\S]*'TOTAL'[\s\S]*'PASSPORT'[\s\S]*'TAIWAN_COMPATRIOT_PERMIT'[\s\S]*'TAIWAN_NATIONAL_ID'/)
assert.match(tour, /const exportColumns = ref<Record<ExportKind, string\[\]>>/)
assert.match(tour, /function buildExportSheet\(kind: ExportKind\)/)
assert.match(tour, /function exportConfiguredExcel/)
assert.match(tour, /createExcelWorkbook/)
assert.match(tour, /Excel 只會使用已審核並寫入正式資料的內容/)
assert.match(tour, /function dropExportField\(/)
assert.match(tour, /persistExportColumns\(kind\)/)

// A pending record without its retained production image must not be reviewed.
assert.match(tour, /document\?\.reviewStatus === 'PENDING'[\s\S]*!document\.imageAvailable/)
assert.match(tour, /覆核照片已依保存期限刪除，無法完成人工審核/)

// D-133 keeps format checks and a prominent number, without extra clicks.
assert.match(tour, /護照號碼必須為 5 至 20 碼英文字母或數字/)
assert.match(tour, /passport-number-critical/)
assert.doesNotMatch(tour, /passportNumberVisuallyConfirmed|passport-number-confirmation/)

// Version labels are scan-order labels only; do not imply issuance/current validity.
assert.match(tour, /function documentVersionLabel/)
assert.match(tour, /Version labels are based on capture time, not passport issue date/)

// Manual merge conflict guards must exist in both UI and backend.
assert.match(travelers, /英文姓名不同，請先確認及修正，不能直接合併/)
assert.match(travelers, /中文姓名不同，請先確認及修正，不能直接合併/)
assert.match(travelerStore, /兩筆旅客的英文姓名不同，請先人工確認並修正，系統不會直接合併/)
assert.match(travelerStore, /兩筆旅客的中文姓名不同，請先人工確認並修正，系統不會直接合併/)
assert.match(travelerStore, /NormalizeNameVariantForComparison\(target\.NameZh\)/)
assert.match(travelerStore, /NormalizeNameVariantForComparison\(source\.NameZh\)/)
assert.match(travelerStore, /Replace\('\\u6E29', '\\u6EAB'\)/)
assert.match(travelers, /replaceAll\('温', '溫'\)/)



// D-131 local acceptance must stay isolated from the operator's normal stack.
assert.match(compose, /\$\{FRONTEND_PORT:-5173\}:80/)
assert.match(compose, /\$\{BACKEND_PORT:-5080\}:8080/)
assert.match(backup, /ComposeProjectName/)
assert.match(restore, /ComposeProjectName/)
assert.match(acceptance, /passport-scanner-v2-acceptance/)
assert.match(acceptance, /D-132 manual merge with equivalent name glyphs/)
assert.match(acceptance, /sourceTravelerId = \$glyphPermit\.travelerId/)
assert.match(acceptance, /Variant-only identities must not trigger new automatic traveler merging/)
assert.match(acceptance, /Passport printed name must retain its original glyph/)
assert.match(acceptance, /Permit printed name must retain its original glyph/)
assert.match(acceptance, /15173/)
assert.match(acceptance, /15080/)
assert.match(acceptance, /down -v --remove-orphans/)
assert.doesNotMatch(acceptance, /workflow_dispatch|gh workflow|GitHub Actions/)

console.log('V2 launch static guards passed.')
