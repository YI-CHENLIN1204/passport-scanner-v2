# AGENTS.md

本文件提供給 Codex、AI coding agent 與協作者。開始修改程式碼前，**必讀 `docs/HANDOFF.md` 頂端最新狀態、`docs/WORKLOG.md` 末尾、`docs/DECISIONS.md`、`docs/OCR_OPEN_SOURCE_REVIEW.md`**，再查最新 main SHA、PR、CI 與實際程式；下方過去的優先序不能凌駕於明確最新交接。

## 最新單人開發流程（2026-10-11；優先於歷史開發節奏）

- 使用者目前單獨開發，要求以 main 為主要工作線，將相關 OCR 修改集中為批次，不再每個小功能都建立分支和 PR。必要隔離風險時才使用短期分支。
- 舊 PR #33 已由 main 直接整合並關閉，沒有 open PR；不要重新合併舊分支。
- GitHub Actions 分鐘已接近額度：ci.yml 僅 workflow_dispatch，禁止自行觸發或恢復自動 CI。PowerShell 本機用 npm.cmd 執行測試與 Build。
- 最新照片實測 `.10` 已確認台胞證退步；main 目前正式最佳實測為 `.19` standalone-sex-token：台胞證中文姓名 13/13、性別 12/13、全欄 12/13；下一步 `.20` 只處理最後 1 張 sex empty 的 focused retry；不將合成測試、PR 數量或診斷欄位數當成準確率提升。
- 聚焦台胞證中文姓名辨識、工作影像、ROI 以及可比較的錯誤分析，累積一批有實質假設的改進後一次正式 Validation。固定 Test 不做調參，個資與證件圖片不推 GitHub。
- `.10/.11` 真實 Validation：護照皆 13/19 全欄；台胞證皆 4/13 全欄、中文姓名 5/13。8 個錯誤姓名 8/8 已完整存在 raw row。`.12` 已發現 `Name LIN YI CHEN` 會被舊 stop-word parser 拒絕，優先修 Romanization anchor，不再增加影像 retry。

## 專案目標

建立 Passport Scanner V2：旅行社內部使用的證件掃描系統，核心是瀏覽器端 OCR、人工覆核、旅客主檔／證件版本管理，以及由團別頁手動匯出 CSV。

## 必須遵守

- V2 的 OCR 推論必須在使用者瀏覽器端執行。
- 不可自行改成把證件影像送到雲端 OCR API。
- 不可假設護照一定是台灣護照；必須依證件實際內容辨識國籍與簽發國。
- 台灣身分證號必須做檢查碼驗證。
- 不要新增沒有明確分析或業務價值的證件欄位。
- OCR 結果必須經人工覆核後才可成為可信資料。
- V2 不做 ERP 整合。
- V2 不做 CRM 系統；Traveler / DocumentVersion 只是掃描系統所需的正式旅客與證件資料層。
- V2 不做複雜登入／角色權限系統。
- V2 正式匯出格式為 CSV；欄位選擇與排序由使用者在匯出視窗設定。
- 未經文件確認，不要自行擴充 V3 / V4 功能。

## 目前開發優先順序

- **固定 Test baseline** `2026.10.09.1` 凍結、不得反覆調參；**它不是目前正式 OCR 程式版本**。目前最佳實測 OCR pipeline 為 `2026.10.11.20`：護照 13/19 全欄、台胞證全欄 13/13、中文姓名 13/13、性別 13/13；以 `docs/HANDOFF.md` 最上方最新段落為權威。
- 使用者**已明確要求加速推進 OCR 精準度改善**。必須集中有依據的修改、自動化回歸，並以一次 Validation 檢驗淨改善／退步；不得擅自改固定 Test split 或把未實測 PR 說成精準率提升。
- 不要把固定 Test 圖片加入 Train；Train / Validation / Test 仍以 Traveler group 切分，避免同人資料洩漏。
- 現階段優先完成 V2 系統本體：團別收件、批次掃描生命週期、人工審核、Traveler / DocumentVersion、人物合併、資料一致性、production photo retention、Training Dataset 管理、CSV 匯出與備份／還原。
- OCR 歷史 PoC 文件可保留作技術歷史，不可因舊文件的 TODO 將已凍結 OCR 工作重新當成目前優先事項。

## 隱私與敏感資料

- 證件影像、身分證字號、護照號碼都視為敏感資料。
- 不可把真實 API key、金鑰、密碼、服務帳號憑證提交到 Git。
- 使用環境變數或 GitHub / 部署平台的 secrets。
- 若建立範例設定，只提交 `.env.example`，不可提交 `.env`。
- 原始照片的保存期限必須依 docs/DECISIONS.md；若該規則仍標示待定，不可擅自改成永久保存。

## 實作方式

- 每次新增功能前，先對照 docs/DECISIONS.md。
- 若文件互相衝突，以較新的「已確認決策」為準。
- 如果需求尚未定案，先以最小可逆方式實作，不要把假設寫死。
- 優先建立小而清楚的模組，避免一次做過多未確認功能。
- 所有 OCR 欄位都應能記錄辨識信心或至少提供人工修改入口。

## 目前不是 V2 目標

- 旅客自行上傳證件。
- 伺服器常駐 OCR。
- 即時 ERP 寫入。
- 全自動無人工審核。
- 複雜 RBAC 權限。
- 把三類證件的所有可見欄位全部 OCR / 儲存。


## 2026-10-12 — .20 正式 Validation：台胞證全欄 13/13

2026.10.11.20 固定 auto Validation 32/32 完成、失敗 0。護照全欄和中文姓名 13/19，其餘七欄 19/19；台胞證全欄、中文姓名、出生日期、性別、證件號碼、有效期限全部 13/13。相較 .19，台胞證性別與全欄各新增 1 張正確，護照未退步。Focused sex retry 匿名診斷：started 1、label ROI 1、fixed ROI 0、detected text 1、candidate 1、conflict 0、applied 1、still empty 0。standalone-token 仍補回 2 張，姓名 selector 維持 13/13。此為 legacy 固定照片 Validation，32 張皆缺當時 OCR 工作輸入圖，不代表對新照片泛化達 100%。正式最佳實測為 .20；下一主要目標護照中文姓名 13/19。禁止 GitHub Actions，保留成功台胞證路徑。


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
