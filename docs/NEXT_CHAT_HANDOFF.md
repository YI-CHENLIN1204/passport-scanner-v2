# 護照掃描系統 V2 — 新對話交接（2026-10-12）


## 2026-10-12 — .27 第二個 TypeScript build blocker

Windows Docker rebuild 仍因 TS2322 停在 `src/components/PaddleBaseline.vue(512,7)`；其實際型別來源是 `frontend/src/models/passportReview.ts` 中的 `PassportReviewOcrMetadata.chineseNameSource`，先前只允許 `name-field | viz-crop | null`，未包含 `focused-viz`。已擴充此共享 model 聯集，並將驗證守衛加到 `test-passport-focused-viz.mjs`。不需修改 Vue 元件、OCR 演算法或 pipeline 版號（維持 2026.10.11.27）。本次只是 TS 型別編譯修復，尚未在使用者 Windows 本機確認 build 成功，需先 `npm.cmd run verify:ocr`，成功後才 Docker rebuild 與固定 32 張 Validation。不得執行 GitHub Actions 或上傳證件個資。

## 2026-10-12 — .27 TypeScript build blocker 修復（等待本機驗證）

使用者 Docker frontend rebuild 在 `RUN npm run build` 因 TS2322 / TS2345 停止，原因是新增 `focused-viz` 後未同步擴充 `PaddleBaselineResult.chineseNameSource` 聯集，以及 Validation `aggregatePassportCropDiagnostics().count` 的 `focusedViz` key 聯集。已在 main 直接修復這兩處型別，並在 `test-passport-focused-viz.mjs` 加上 source guard。未改 OCR selector、裁切參數、任何台胞證路徑或 pipeline 版本（仍為 `2026.10.11.27`）。此為編譯 blocker 修復，尚未本機跑完整 `verify:ocr`／Docker rebuild／32 張 Validation；不得聲稱 build 已通過或精準率改善。上次 Docker build 失敗，未產生新的 frontend image。下一步集中本機驗證。禁止 GitHub Actions；不得提交證件個資。


## 2026-10-12 — .27 護照 focused VIZ 候選（待本機驗證）

.26 正式固定 Validation 32/32 成功，護照姓名與全欄 14/19，台胞證全欄 13/13。剩下五張護照姓名錯誤中四張沒有完整正確 OCR 候選；.25/.26 嚴格 one-syllable shadow rescued 0，故不再放寬正式 selector。

候選 `2026.10.11.27` 新增護照 `focused-viz` 裁切，範圍沿用現有 broad VIZ 左上邊界 (x=24%、y=12%)、縮至寬 60%、高 34%，使用已有的 bounded `createPixelCrop(...,1500)`。僅在既有 `name-field`、`viz-crop` 都未得到明確 romanization compatible 姓名時，才額外做一次 focused ROI OCR；已有 compatible 的護照不增加 OCR 次數。新候選仍經過既有嚴格 `chooseTaiwanChineseName`，只允許明確 compatible 候選取代保留的 provisional 值；沒有 compatible 時維持原有姓名、不猜。台胞證所有 selector/sex retry 完全不動。Validation 增加 focused VIZ 的匿名 exact/other/none/not-run 數量；新增 synthetic source regression `test-passport-focused-viz.mjs` 並納入 `verify:ocr`。

**尚未跑本機 verify/build 或固定 32 張 Validation，不能宣稱任何改善**。正式最佳已實測仍是 .26 護照 14/19、台胞證 13/13；集中本機驗證後對照新增 focused ROI 命中與總準確率，不成功就不繼續盲目疊加 crop。全部 32 張為缺原始 OCR 工作圖的 legacy Validation，不代表新上傳照片泛化準確率。禁止 GitHub Actions、branch/PR 微改與任何真實證件／個資上傳。


## 2026-10-12 — .26 固定 Validation 實測

使用者完成 pipeline 2026.10.11.26 的固定 32 張 auto Validation，32/32 成功、失敗 0。護照中文姓名及整張全欄 14/19（74%），其他七欄 19/19；台胞證五項必要欄位與整張全欄 13/13（100%）。相較 .25 無改善亦無回歸。嚴格 one-syllable shadow：潛在改善 0、潛在退步 0、維持正確 14、維持錯誤 5；existing-accepted 9、eligible 6、ambiguous 3、wrong-subtype 1。這些 eligible 不是實際正確率，不得將 shadow 政策直接用於正式 selector。剩餘五張護照姓名錯誤：一張具有完整正確候選，被 name-field / romanization:one-syllable-mismatch 擋住；其餘四張沒有完整正確候選。下一步優先改善原有 OCR 文字辨識品質，不再只放寬 selector。此為缺原始 OCR 工作圖的 legacy Validation，不能代表新照片泛化。禁止 GitHub Actions，不上傳證件個資。


## 2026-10-12 — .26 護照 Shadow 最終決策模擬修正（待本機驗證）

.25 固定 Validation：護照全欄／中文姓名 14/19，台胞證全欄 13/13；嚴格單音節 shadow rescued 0、regressed 0、unchanged-correct 14、unchanged-wrong 5；eligible 6、existing-accepted 9、ambiguous 3、wrong-subtype 1。**eligible 非準確率，.25 不可直接提升成正式 selector。**

.26 將 read-only shadow 的不同 ROI 候選合併規則獨立為 `passportShadowMerge.ts`：只要正式姓名已存在，shadow 不能覆寫；無正式姓名且多 ROI 提出不同名字，視為 ambiguous 並拒絕；若所有 ROI 都一致且沒有正式姓名，才產生模擬候選；完全無候選則保留空值。這項修正用於避免舊的「拿第一個 shadow 名稱」模擬與實際策略不一致；**仍不將 shadow 寫進 production OCR 結果**，也不增加任何 OCR 呼叫。新增 `test-passport-shadow-merge.mjs`：synthetic 測試覆蓋已接受姓名保護、多 ROI 相同／不同、無候選及 null input，接入 `verify:ocr`，版本更新為 `2026.10.11.26`。

.26 尚未跑 Windows verify/build 或 32 張固定 Validation。正式最佳已實測準確率仍是護照 14/19、台胞證 13/13；Validation 只核對匿名最終 shadow 統計是否更可信，不能宣稱準確率提高。禁止 GitHub Actions、不新開 branch/PR、不提交真實證件照片或 OCR 個資。固定 legacy Validation 缺少 OCR 原始工作輸入影像。


> 此文件是給下一個 ChatGPT 對話直接接手用的。
> **不要重新設計系統、不要重新跑過去已證明失敗的 OCR 嘗試、不要重新啟用 GitHub Actions。**

## 2026-10-12 — .20 正式 Validation：台胞證全欄 13/13

2026.10.11.20 固定 auto Validation 32/32 完成、失敗 0。護照全欄和中文姓名 13/19，其餘七欄 19/19；台胞證全欄、中文姓名、出生日期、性別、證件號碼、有效期限全部 13/13。相較 .19，台胞證性別與全欄各新增 1 張正確，護照未退步。Focused sex retry 匿名診斷：started 1、label ROI 1、fixed ROI 0、detected text 1、candidate 1、conflict 0、applied 1、still empty 0。standalone-token 仍補回 2 張，姓名 selector 維持 13/13。此為 legacy 固定照片 Validation，32 張皆缺當時 OCR 工作輸入圖，不代表對新照片泛化達 100%。正式最佳實測為 .20；下一主要目標護照中文姓名 13/19。禁止 GitHub Actions，保留成功台胞證路徑。

## 0. 過往候選階段：`.20` 已實作，下一步只需集中本機驗證

main 已完成 focused sex retry `2026.10.11.20` 候選：只對 `sex === ''` 的台胞證做一次小 ROI OCR；label geometry 優先，沒有 label 才 fixed-layout crop；只接受男/女/M/F 或同列 Sex/性別語意，衝突維持 empty。匿名 retry diagnostics 與 regression tests 已接入 `verify:ocr`。

**尚未有 `.20` 真實 Validation 結果。** 最佳已實測仍是 `.19`：護照 13/19、台胞證全欄 12/13、姓名 13/13、sex 12/13。下一步不要再改程式，先在 Windows 本機跑 `npm.cmd run verify:ocr`、Docker frontend rebuild、確認頁面 `.20`，再跑 32 張 auto Validation，將結果寫回文件。

## 1. Repository / current state

Repository：

`YI-CHENLIN1204/passport-scanner-v2`

目前正式最佳實測 OCR pipeline：`2026.10.11.20`，台胞證全欄 13/13，護照 13/19。

目前沒有 open PR。近期已改成**直接在 main 集中開發、集中驗證**，不要再為每個小修改開 branch / PR。

GitHub Actions 已刻意改成 `workflow_dispatch only`。

**禁止執行 GitHub Actions，包括手動 workflow。** 2026-10-11 月額度已接近用完，使用者明確要求不要再浪費 Actions minutes。

## 2. 專案定位

這是旅行社內部使用的「證件掃描／旅客資料建立系統」。

現階段不是 ERP、CRM、客戶端自助系統，也不是完整出團管理。

目前流程：

`建立團別 → 設定需要的證件 → 批次上傳照片 → 瀏覽器端 OCR → 自動建立／合併旅客 → 人工審核 → 形成可靠旅客與證件資料 → CSV 匯出`

OCR 現在完全在瀏覽器端執行，主要為 PaddleOCR.js / PP-OCRv5。

## 3. 絕對限制

1. 不把真實護照、台胞證、身分證照片或個資上傳 GitHub。
2. 不上傳姓名、證件號、sample id 等可識別資料。
3. Validation diagnostics 僅能保存匿名 aggregate counts。
4. 不使用雲端圖片辨識 API。
5. 保留人工審核，OCR 不是最終真值。
6. 正式照片保存規則仍為回國日 + 7 天；不要因 OCR 實驗更改 production retention。
7. 不修改固定 Validation ground truth 來讓數字變漂亮。
8. 不再用 GitHub Actions。
9. 不要再為每個小修改開 branch / PR；此 repo 目前只有使用者自己開發。
10. 不要為每個小修改就要求使用者重跑 32 張；集中一批有意義的修改後再跑一次。

## 4. 本機環境

Windows + VS Code。

Project：`C:\Users\User\Desktop\passport-scanner-v2`

PowerShell 的 `npm` 會受 ExecutionPolicy 影響，因此一律使用 `npm.cmd`。

集中 regression/build：

```powershell
cd C:\Users\User\Desktop\passport-scanner-v2
git pull origin main

cd frontend
npm.cmd run verify:ocr

cd ..
docker compose up -d --no-deps --build frontend
```

之後瀏覽器 Ctrl+F5，確認頁面顯示正確 OCR pipeline 版本，再跑 32 張固定 auto Validation。

## 5. 固定 Validation 的限制

目前 legacy Validation 共 32 張：護照 19、台胞證 13、身分證 0。

重要限制：

- 32/32 都缺少當時真正 OCR work-input image。
- Validation 是用保存的人工審核影像重跑，只能做版本回歸比較。
- 不能把這個數字宣稱為完整真實 production accuracy。
- 樣本可能有同一旅客多張。
- 真實 end-to-end 新照片泛化仍要另外評估。

## 6. 目前正式最佳實測：`.19`

2026-10-12 使用者完成 `2026.10.11.19` auto Validation。

### 護照（n=19）

- 整張全欄正確：**13/19 = 68%**
- 中文姓名：**68%**
- 英文姓名：100%
- 出生日期：100%
- 性別：100%
- 國籍：100%
- 證件號碼：100%
- 簽發國：100%
- 有效期限：100%

護照目前唯一主要問題仍為中文姓名 13/19。

### 台胞證（n=13）

- 整張全欄正確：**12/13 = 92%**
- 中文姓名：**13/13 = 100%**
- 出生日期：100%
- 性別：**12/13 = 92%**
- 證件號碼：100%
- 有效期限：100%

目前台胞證只剩 **1 張 sex 錯 / empty**。

## 7. 台胞證中文姓名：已完成，先鎖住

不要再改目前姓名 selector，除非新資料證明有回歸。

### `.10` ~ `.14`

多次沒有提升。已證明：

- 8 張錯誤姓名中，8/8 正確姓名完整存在 OCR raw row。
- 不是 Detection / Recognition 根本看不到姓名。
- row-index distance 不可靠：8 個 short/exact conflict 候選距離 Latin row 全部 >=5。
- 不要再做 row-distance fallback。

### `.15` BOCA official romanization

加入 BOCA / 台灣官方舊式拼音 variant：台胞證姓名 5/13 → **9/13**，全欄 4/13 → **7/13**。official promotion 4 張、實際採用 4 張。有效，必須保留。

### `.16` exact joined-token segmentation

解決英文拼音 OCR 黏在一起。只有每個中文字都能以 Hanyu/common/BOCA alias 精確消耗整個 Latin string 才通過，不做 fuzzy。

結果：中文姓名 9/13 → **11/13**，全欄 7/13 → **9/13**。joined-token promotion 2 張、實際採用 2 張。有效，必須保留。

### `.17` unique one-syllable fallback

只有 compatible / anchored unknown 都沒有，且只有唯一一個 2–4 字完整獨立 raw row，subtype = one-syllable-mismatch 時才採用。

結果：中文姓名 11/13 → **13/13**，全欄 9/13 → **10/13**。有效，必須保留。

## 8. 台胞證 sex：目前進度

### `.18`

原假設：MRZ sex 可能壓過正確 visual sex。

檢查 MRZ code 發現 sex 字元確實不受 composite checksum 驗證，因此 `.18` 加入 same-row semantic sex。

但真實 Validation 顯示：MRZ 有 sex 0；geometry labeled sex 10；same-row semantic 3；semantic-row override 0；final empty 3。

所以 **MRZ override 假設被否定**。不要再往 MRZ priority 調。

### `.19`

加入非常保守的 standalone token fallback：只有 OCR detection box 整個文字恰好是 `男`、`女`、`M` 或 `F` 才算；如果同張同時出現 M 與 F，拒絕。

selector 優先序：`visual-agreement > semantic-row > MRZ > label > semantic > standalone-token > empty`。

真實 Validation：standalone token 可用 12 張；token M/F conflict 0；standalone-token 實際補回 **2 張**；final empty **1 張**；sex 10/13 → **12/13**；台胞證整張 10/13 → **12/13**。

所以 standalone-token 路徑有效，必須保留。

## 9. 下一個唯一優先工作：`.20` focused sex retry

現在不要再改 selector。

最後 1 張的問題已變成：`OCR detection / recognition 沒有產生任何 sex evidence`。

下一步直接做 focused sex retry：

1. 只有 `finalSex === ''` 的台胞證才啟動 retry。
2. 不要讓已經正確的 12 張增加額外 OCR。
3. 若 geometry 有 Sex / 性別 label，依 label 位置做窄 ROI crop。
4. 若 label 也沒抓到，再使用台胞證正面固定版面附近的 conservative sex region crop。
5. 對 ROI 重新 OCR。
6. 只接受 standalone `男/女/M/F` 或同列 `性別男/女` / `Sex M/F`。
7. ROI 若同時有 M/F 或其他歧義，維持 empty，不猜。
8. 新增匿名 diagnostics：retryStarted、retryDetectedText、retryCandidateFound、retryApplied、retryStillEmpty。
9. 新增 synthetic / wiring tests。
10. pipeline bump 到 `2026.10.11.20`。
11. 一批完成後才請使用者跑 `npm.cmd run verify:ocr` + Docker rebuild + 32 張 Validation。

**目標：台胞證 sex 13/13、整張 13/13，同時中文姓名維持 13/13、護照維持至少 13/19。**

## 10. `.20` 之後的優先順序

如果 `.20` 把台胞證固定 Validation 推到 13/13，下一個主要瓶頸改成：`護照中文姓名 13/19 = 68%`。

護照現有匿名診斷顯示：中文姓名錯誤 6 張；候選文字完整吻合 1 張；原始 OCR 行完整吻合 0 張；僅較長 OCR 文字中出現姓名 0 張；其他候選內容不符 5 張；romanization one-syllable-mismatch shadow 1 張；外交部護照拼音對照候選沒有顯示可直接提升。

因此護照不能直接照抄台胞證 raw-row selector；需要另外研究 passport Chinese-name ROI / recognition。

## 11. 重要檔案

- `frontend/src/services/paddleOcr.ts`
- `frontend/src/services/permitRawNameEvidence.ts`
- `frontend/src/services/permitRawNameRomanization.ts`
- `frontend/src/services/nameRomanization.ts`
- `frontend/src/services/officialRomanizationVariants.ts`
- `frontend/src/services/permitFieldEvidence.ts`
- `frontend/src/services/permitSexSemantics.ts`
- `frontend/src/services/permitStandaloneSexEvidence.ts`
- `frontend/src/services/permitSexDiagnostics.ts`
- `frontend/src/views/OcrQualityPage.vue`
- `frontend/package.json`
- `frontend/scripts/`

集中 regression：`npm.cmd run verify:ocr`。

## 12. 權威文件

下一個對話優先讀：

1. `docs/HANDOFF.md`
2. `docs/NEXT_CHAT_HANDOFF.md`
3. `docs/WORKLOG.md`
4. `docs/OCR_OPEN_SOURCE_REVIEW.md`
5. `docs/DECISIONS.md`
6. `AGENTS.md`

`docs/WORKLOG.md` 為 append-only。

## 13. 工作方式

使用者已多次明確要求：

- 進度要快。
- 不要做一步就停下來。
- 不要每個小修改就叫使用者測。
- 不要每個小修改開 branch / PR。
- 要「集中開發 → 集中 regression → 一次 Validation」。
- 每次真實 Validation 結果要寫回 GitHub 文件。
- 要保留成功與失敗實驗，避免下一個對話走回頭路。
- 目標是快速提高真正 OCR 精準度，不是累積大量無意義測試。

下一個對話應照此方式直接繼續。