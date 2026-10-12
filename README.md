# Passport Scanner V2

> **交接與最新開發狀態：** 請優先閱讀 [docs/HANDOFF.md](./docs/HANDOFF.md) 與 [docs/NEXT_CHAT_HANDOFF.md](./docs/NEXT_CHAT_HANDOFF.md)（正式最佳實測 `2026.10.11.20`：護照全欄 13/19、台胞證全欄與中文姓名及性別均 13/13；下一目標護照中文姓名）。

旅行社內部使用的證件掃描與旅客資料整理系統。

V2 的核心方向是：**在使用者瀏覽器端執行 OCR，降低雲端 AI 成本與敏感證件影像外送風險；只擷取真正有業務價值的欄位，並保留人工覆核流程。**

## V2 目前範圍

- 使用對象：旅行社內部人員（業務／控團）。
- 支援證件方向：護照、台灣身分證、台胞證。
- OCR：在瀏覽器端執行，不把證件影像送到雲端 OCR 服務做辨識。
- 辨識結果：以結構化資料回傳後端。
- 原始證件照片：可因人工覆核需求另行保存，但其保存流程與 OCR 推論分開管理。
- 審核：人工逐筆確認 OCR 結果。
- 匯出：由團別頁人工觸發 CSV 匯出，可依證件類型選擇欄位與排序。
- V2 不做登入與複雜權限管理。
- V2 不直接整合 ERP。

## 目前護照流程

護照已完成第一輪 OCR 引擎選型與 5 張不同條件的泛化測試：

- 正式主引擎：PaddleOCR.js / PP-OCRv5。
- OCR 執行於瀏覽器端。
- 弱偵測時自動改試護照底部 MRZ 區域。
- TD3 MRZ 解析後以 check digit 驗證護照號碼、出生日期、有效期限與 composite。
- 辨識完成後直接進入可編輯的人工覆核卡。
- 人工覆核日期顯示為 YYYY-MM-DD。
- 按下確認後會建立 typed review payload，送到 ASP.NET Core 後端再次驗證，再寫入 PostgreSQL。
- Docker Compose 會啟動獨立 PostgreSQL service，旅客主檔與證件版本保存在 named volume；重啟 frontend／backend 不會清空資料。
- Tesseract Baseline A 與泛化測試工具保留在開發診斷區，不進旅行社員工主要流程。

## 文件

- [AGENTS.md](./AGENTS.md) — 給 Codex / AI Agent 的專案工作規則。
- [docs/PROJECT_CONTEXT.md](./docs/PROJECT_CONTEXT.md) — 專案背景、使用情境與邊界。
- [docs/SYSTEM_ARCHITECTURE.md](./docs/SYSTEM_ARCHITECTURE.md) — V2 架構與資料流。
- [docs/OCR_REQUIREMENTS.md](./docs/OCR_REQUIREMENTS.md) — OCR 文件類型、欄位與驗證原則。
- [docs/OCR_POC.md](./docs/OCR_POC.md) — 瀏覽器 OCR PoC 與引擎比較基準。
- [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) — 旅客主檔、證件版本與團別資料模型方向。
- [docs/DECISIONS.md](./docs/DECISIONS.md) — 已確認決策與尚未定案項目。
- [docs/PASSPORT_REVIEW_CONTRACT.md](./docs/PASSPORT_REVIEW_CONTRACT.md) — 人工覆核完成後的前端 draft / 未來 API payload。
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 本機環境、啟動方式與前後端 port。

## 開發原則

1. 先完成 V2 內部掃描／審核／旅客資料／CSV 匯出，再處理 V3 / V4。
2. 不為了「資料看起來完整」而儲存沒有業務價值的證件欄位。
3. OCR 必須允許人工覆核，不能把辨識結果直接視為正確資料。
4. 敏感資料採最小化蒐集與最小化保存。
5. 尚未寫進「已確認決策」的構想，不可自行當成正式需求實作。


## Current Development Stack

```text
frontend/  Vue 3 + TypeScript + Vite        :5173
backend/   ASP.NET Core Web API (.NET 10)  :5080
```

開發啟動方式請看 [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)。


## 目前資料流里程碑

```text
護照圖片
  ↓
PaddleOCR / PP-OCRv5（瀏覽器）
  ↓
MRZ + check digit
  ↓
人工覆核
  ↓
PassportReviewDraft
  ↓
ASP.NET Core 後端驗證
  ↓
ITravelerStore
  ↓
PostgresTravelerStore
  ├─ travelers
  └─ document_versions
```

目前版本已能驗證：

- 第一次掃描：建立旅客 + 第一個護照版本。
- 同一本護照再次掃描：更新既有版本，不重複新增。
- 同一旅客換新護照：建立新 document version，舊版本保留。
- 舊護照重新掃描：不會自動變回 current。
- 多位完全相同候選：後端拒絕自動合併。

正式 PostgreSQL 已接入；OCR / 覆核 contract 維持不變。


## 目前台胞證流程

台胞證與台灣身分證都已進入正式 OCR / 人工覆核流程。

目前流程：

- PP-OCRv5 瀏覽器端整頁辨識。
- 擷取中文姓名、8 位台胞證號碼、出生日期、性別、有效期限。
- 8 位證號與 2 位簽發次數分開處理，不保存簽發次數。
- 日期統一轉為 YYYY-MM-DD。
- OCR 無法可靠取得的欄位留給人工補填。
- 儲存前需人工對照原圖確認所有欄位。
- 儲存後與護照共用 traveler_master / document_versions 版本邏輯。

## 旅客資料／正式主檔

主介面目前分為：

- 證件掃描。
- 旅客資料。

旅客資料頁已可：

- 搜尋中文姓名、英文姓名或證件號碼。
- 查看 traveler 主檔。
- 查看護照／台胞證／台灣身分證歷史版本。
- 查看目前使用中的證件版本。

目前 persistence 為 PostgreSQL；旅客主檔與證件版本保存在 Docker named volume，backend 重啟後資料仍保留。


## 目前台灣身分證流程

- PP-OCRv5 瀏覽器端整頁辨識。
- 自動判斷 0° / ±90° / 180°，必要時再做小角度校正。
- 擷取中文姓名、國民身分證統一編號、出生日期。
- 民國年出生日期自動轉為 YYYY-MM-DD。
- 性別由身分證字號第 2 碼交叉驗證，不在無可靠字號時預設。
- 前端與 ASP.NET Core 後端都獨立計算身分證字號檢查碼。
- OCR 抓不到的欄位允許人工補填；全部人工覆核後才可儲存。
- 身分證沒有到期日，因此 document_versions 的 expiry_date 對此證件為 NULL。


## PostgreSQL 持久化

目前正式資料層已從開發用記憶體儲存切換為 PostgreSQL。

Docker Compose 會建立三個服務：

- `frontend`：Vue + Nginx。
- `backend`：ASP.NET Core API。
- `database`：PostgreSQL 16。

資料主要分為：

- `travelers`：旅客主檔。
- `document_versions`：護照、台胞證、台灣身分證的歷史版本。

PostgreSQL 使用 named volume `passport_scanner_postgres`。一般的 `docker compose down` 不會刪除資料；只有明確執行 `docker compose down -v` 或手動刪除 volume 才會移除資料。

本機開發密碼可透過環境變數 `PASSPORT_DB_PASSWORD` 覆寫。Compose 內的預設密碼只供本機開發使用，不應直接用於正式公開環境。


> 2026-10-12：main OCR 候選 `2026.10.11.21`（護照 broad VIZ 有限放大，待本機 Validation）。最佳實測仍為 `.20`：護照 13/19、台胞證 13/13；禁止 GitHub Actions。


2026-10-12 實測更新：`.21` 32/32 auto Validation 成功，護照中文姓名及全欄皆 14/19（74%），台胞證全部必要欄位 13/13（100%）。下一步聚焦護照剩餘五張姓名辨識問題。固定 legacy Validation 缺工作輸入影像，不代表新照片泛化準確率；禁止 GitHub Actions。

> 最新候選 .22：護照兩段 crop 分區匿名診斷（無新增 OCR）；最佳已實測 .21，護照 14/19、台胞證 13/13。請以 HANDOFF 頂端為準。

2026-10-12 實測：`.22` auto Validation 32/32 完成、失敗 0，護照 14/19、台胞證 13/13，與 `.21` 準確率相同。護照 5 張錯誤中，name-field 正確候選 1、錯誤候選 2、未執行 2；broad VIZ 正確候選 0、錯誤候選 2、未執行 3。這是匿名分區診斷，並非 selector 可安全改善的證據。下一輪先調查未執行與候選拒絕原因；不得啟動 GitHub Actions。

> `.23` 待驗證候選：護照 name-field unknown 時保留 provisional 並讓 broad VIZ 尋找 compatible，未證實提昇。最佳已實測 `.22`：護照 14/19、台胞證 13/13；禁止 GitHub Actions。

> .23 已正式 Validation：護照 14/19、台胞證 13/13，與 .22 持平；broad VIZ 正確候選 0→1，但未提升最終姓名。下一步追查候選拒絕原因；禁止 GitHub Actions。

> 2026-10-12：main `.24` 只增加護照正確候選 source × rejection reason 的匿名診斷，待本機測試。最佳已實測 `.23` 護照 14/19、台胞證 13/13。禁止 GitHub Actions。

> 2026-10-12 `.24` 實測：32/32 Validation 成功，護照中文姓名 14/19、台胞證全欄 13/13。唯一有正確姓名卻未採用的護照案例原因為 `name-field / romanization:one-syllable-mismatch` 1 張；不可無條件放寬 selector。下一步僅能先做嚴格條件的 shadow / synthetic 驗證；禁止 GitHub Actions。

> `.25` 嚴格護照 one-syllable mismatch 唯讀 shadow 候選已加入，待本機 Validation。已實測最佳 `.24`：護照 14/19、台胞證 13/13。禁止 GitHub Actions。

> 最新 main 候選 `.26`：只修復 read-only shadow 的已接受姓名保護與多 ROI 合併模擬，最佳實測 `.25` 護照 14/19、台胞證 13/13；尚待本機驗證。禁止 GitHub Actions。

## 2026-10-12 — .26 固定 Validation 實測

使用者完成 pipeline 2026.10.11.26 的固定 32 張 auto Validation，32/32 成功、失敗 0。護照中文姓名及整張全欄 14/19（74%），其他七欄 19/19；台胞證五項必要欄位與整張全欄 13/13（100%）。相較 .25 無改善亦無回歸。嚴格 one-syllable shadow：潛在改善 0、潛在退步 0、維持正確 14、維持錯誤 5；existing-accepted 9、eligible 6、ambiguous 3、wrong-subtype 1。這些 eligible 不是實際正確率，不得將 shadow 政策直接用於正式 selector。剩餘五張護照姓名錯誤：一張具有完整正確候選，被 name-field / romanization:one-syllable-mismatch 擋住；其餘四張沒有完整正確候選。下一步優先改善原有 OCR 文字辨識品質，不再只放寬 selector。此為缺原始 OCR 工作圖的 legacy Validation，不能代表新照片泛化。禁止 GitHub Actions，不上傳證件個資。

## 2026-10-12 — .27 護照 focused VIZ 候選（待本機驗證）

.26 正式固定 Validation 32/32 成功，護照姓名與全欄 14/19，台胞證全欄 13/13。剩下五張護照姓名錯誤中四張沒有完整正確 OCR 候選；.25/.26 嚴格 one-syllable shadow rescued 0，故不再放寬正式 selector。

候選 `2026.10.11.27` 新增護照 `focused-viz` 裁切，範圍沿用現有 broad VIZ 左上邊界 (x=24%、y=12%)、縮至寬 60%、高 34%，使用已有的 bounded `createPixelCrop(...,1500)`。僅在既有 `name-field`、`viz-crop` 都未得到明確 romanization compatible 姓名時，才額外做一次 focused ROI OCR；已有 compatible 的護照不增加 OCR 次數。新候選仍經過既有嚴格 `chooseTaiwanChineseName`，只允許明確 compatible 候選取代保留的 provisional 值；沒有 compatible 時維持原有姓名、不猜。台胞證所有 selector/sex retry 完全不動。Validation 增加 focused VIZ 的匿名 exact/other/none/not-run 數量；新增 synthetic source regression `test-passport-focused-viz.mjs` 並納入 `verify:ocr`。

**尚未跑本機 verify/build 或固定 32 張 Validation，不能宣稱任何改善**。正式最佳已實測仍是 .26 護照 14/19、台胞證 13/13；集中本機驗證後對照新增 focused ROI 命中與總準確率，不成功就不繼續盲目疊加 crop。全部 32 張為缺原始 OCR 工作圖的 legacy Validation，不代表新上傳照片泛化準確率。禁止 GitHub Actions、branch/PR 微改與任何真實證件／個資上傳。

## 2026-10-12 — .28 撤回無效 focused VIZ（待本機驗證）

.27 本機固定 32 張 Validation 全部完成，失敗 0。護照中文姓名與整張 14/19，台胞證全欄 13/13。新增 focused VIZ 在五張錯誤護照裡正確候選 0、其他候選 1、未執行 4，沒有提升準確率。因此不再疊加第三次 OCR。

main 的候選版本更新為 2026.10.11.28，撤除 focused VIZ 的額外辨識與建立裁切；保留先前已有實際改善的 name-field 和 broad VIZ 路徑、既有姓名 selector，以及所有已成功的台胞證姓名和 sex 路徑。測試守衛更新為確認 focused crop 不會恢復。這是減少無益的額外運算，不宣稱提高準確率。

目前尚待 Windows npm.cmd run verify:ocr 和 Docker rebuild。最新實測仍為護照 14/19、台胞證 13/13；此固定 legacy Validation 不包含當初原始 OCR 工作輸入影像，不代表新照片泛化。GitHub Actions 禁止執行，不上傳真實證件個資。

## 2026-10-12 — .28 正式固定 Validation：移除 focused VIZ 後無回歸

使用者本機完成 2026.10.11.28 固定 auto Validation，完成 32/32、失敗 0。護照整張及中文姓名 14/19（74%），其餘七欄 19/19；台胞證整張及五個必要欄位 13/13（100%）。相比 .27 無變化，證實撤回無收益的第三次 focused VIZ 沒造成固定樣本回歸。護照五張姓名失敗中，完整正確候選 1 張（name-field / romanization:one-syllable-mismatch）、其他候選不符 4 張。focused VIZ 診斷正確候選 0、未執行 5，符合該 OCR 已撤除。嚴格 one-syllable shadow 潛在改善 0、退步 0。護照 OCR 中位數約 1.2 秒、P90 2.3 秒，台胞證 OCR 中位數約 0.5 秒、P90 2.7 秒。

結論：最佳已實測版本更新為 .28（準確率仍護照 14/19、台胞證 13/13）；不得恢復第三段 fixed focused ROI 或錯誤聲稱帶來提升。下一階段應探索真正 recognition-quality 改進，並保持既有姓名 selector 不變。32 張 legacy Validation 缺原始 OCR 工作輸入照片，不代表新照片泛化準確率。禁止 GitHub Actions，不提交個資。

## 2026-10-12 — .29 護照姓名 OCR 裁切高品質插值候選（待本機驗證）

正式最新已實測 .28 固定 Validation：32/32 完成，護照中文姓名及整張全欄 14/19（74%）、台胞證五欄及整張 13/13（100%）。護照餘下 5 張姓名錯誤，4 張沒有完整正確辨識候選，先前額外 focused VIZ ROI 已在 .27 證明無收益並於 .28 撤除。

main 新候選 2026.10.11.29 不增加任何 OCR 推論／裁切，不變更原本 name-field 及 broad VIZ 比例、不放寬姓名 selector；只對**護照既有兩個姓名 crop 且確實放大時**，在 Canvas 明確啟用 `imageSmoothingEnabled=true`、`imageSmoothingQuality='high'`。共享 `createPixelCrop()` 新增預設為 false 的選用參數，因此台胞證等其他 crop 維持原行為。這只是測試高品質插值能否幫助小字 recognition 的候選，瀏覽器實際實作可能不保證改善。新增 `test-passport-resize-quality.mjs` regression，鎖定只對護照的 opt-in、無額外 focused ROI，加入 `verify:ocr`；既有 OCR 版本測試同步更新。

此候選尚未在 Windows 執行完整 `npm.cmd run verify:ocr`、Docker rebuild 或固定 32 張 Validation；不可宣稱比 .28 改善。若沒有提升或造成退步，應回退此項插值實驗，不再以這條路徑調參。台胞證 BOCA、joined-token、one-syllable、standalone sex、focused retry 全保留。禁止 GitHub Actions，不開小型 branch/PR，不上傳證件影像或真實個資；legacy Validation 缺實際工作輸入影像，不代表新照片泛化準確率。

> 2026-10-12：`.29` 真實固定 Validation 護照 14/19、台胞證 13/13，Canvas 插值沒有改善；後續禁止重複無收益的固定 ROI / shadow / 插值嘗試。模型級 PP-OCRv5 server-rec 對照仍在封裝相容性前置階段（見 `docs/OCR_MODEL_AB_PLAN.md`）；未取得合法 browser-compatible ONNX tar，正式 OCR 不變、不要求使用者重跑 32 張。GitHub Actions 禁止執行。
