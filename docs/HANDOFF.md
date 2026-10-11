# 護照掃描系統 V2 — 交接入口（持續維護）

## 2026-10-12 — `.19` 再次提升：台胞證全欄 12/13、sex 12/13；下一步只剩 1 張 sex empty

使用者完成 `2026.10.11.19` 正式 auto Validation，32/32 成功。護照維持：全欄 68%（13/19）、中文姓名 68%、其他評估欄位 100%。台胞證提升到 **全欄 92%（12/13）**、中文姓名 **100%（13/13）**、出生日期 100%、性別 **92%（12/13）**、證件號碼 100%、有效期限 100%。相較 `.18`：sex 10/13→12/13、全欄 10/13→12/13；護照與姓名無回歸。

`.19` sex evidence 診斷：MRZ sex 0；geometry label sex 10；same-row semantic sex 3；有單一 standalone 男/女/M/F token 12；standalone M/F conflict 0；最終來源 visual-agreement 3、label 7、standalone-token fallback **2**、semantic-row override 0、MRZ 0、semantic fallback 0、**empty 1**。因此 `.19` 的 standalone-token fallback 已被實測證明有效，並且只剩 1 張台胞證完全沒有任何 sex evidence。

### 下一步 `.20` 方向

- **不再放寬 selector**。`.19` 已證明 selector 可在既有 OCR detection 中補回 2/3；最後 1 張是 detection/recognition 沒產生任何可用 sex evidence。
- `.20` 只針對 `finalSex === ''` 的台胞證啟動 focused sex retry：以正面版面性別欄附近的小區域 crop / re-OCR 為主，或以已偵測到的 Sex/性別 label 位置建立窄 ROI；不得對已經有 sex 的 12 張額外重跑。
- retry 結果只接受非常保守的 `男/女/M/F` 或 same-row Sex/性別語意；若 ROI 同時出現衝突值，維持 empty / 人工審核。
- 需要新增匿名 retry 診斷：sex retry 啟動件數、有文字框件數、有候選件數、實際覆寫件數、仍 empty 件數。不要記錄旅客內容。
- 中文姓名 `.17` 路徑已達 13/13，**禁止再動姓名 selector**，除非新資料出現回歸。

目前正式最佳基準：護照全欄 13/19；台胞證全欄 12/13、中文姓名 13/13、sex 12/13。`.20` 若能補回最後 1 張 sex，現有 13 張台胞證固定 Validation 將可達 13/13 全欄。

## 2026-10-12 — `.18` 無提升但定位 sex 缺失來源；main 已進入 `.19` standalone-token fallback

使用者完成 `2026.10.11.18` 正式 auto Validation，32/32 成功。護照維持全欄 68%（13/19）。台胞證維持全欄 77%（10/13）、中文姓名 100%（13/13）、出生日期 100%、性別 77%（10/13）、證件號碼 100%、有效期限 100%。因此 `.18` 沒有提高準確率，但姓名 13/13 無回歸。

`.18` sex evidence 診斷否定了原先 MRZ override 假設：13 張中 **MRZ 有性別 0 張**；geometry labeled sex 10 張；same-row semantic sex 3 張；MRZ vs semantic conflict 0；最終來源 visual-agreement 3、label 7、semantic-row override 0、MRZ 0、semantic fallback 0、**empty 3**。這 3 張 empty 正好解釋 sex 10/13，因此剩餘問題是「沒有抽到 sex evidence」，不是 MRZ 蓋掉正確值。

### `.19` main 候選：standalone sex token

- 不再調 MRZ priority，也不再碰已達 13/13 的台胞證姓名 selector。
- 新增 `permitStandaloneSexEvidence.ts`：只把 OCR detection box **整個文字恰好等於** `男`、`女`、`M` 或 `F` 視為 standalone sex token。`SEX F`、姓名英文、MRZ 整列等都不符合。
- 如果同張影像只有單一性別值（可有多個同值 token）則形成 standalone candidate；若同時出現 M 與 F，標記 conflict 並拒絕自動選。
- selector 優先序保持保守：visual-agreement > semantic-row conflict override > MRZ > labeled sex > semantic sex > **standalone-token fallback** > empty。也就是 standalone token 只在所有既有強證據都沒有時才生效。
- Validation 新增匿名 standalone 指標：有唯一 standalone sex token 的樣本數、M/F token 衝突樣本數、最終實際採用 standalone-token 的樣本數。
- executable tests 新增：男/女/M/F 單 token 正例、M+F 衝突拒絕、`SEX F` 不當 standalone；selector 測試保證 MRZ / label / semantic 都優先於 token；sex diagnostics/UI wiring 已同步。
- pipeline metadata 更新為 `2026.10.11.19`。

`.19` 尚未在使用者 Windows 本機執行 `npm.cmd run verify:ocr`、Docker rebuild 或 32 張 Validation，不能宣稱 sex 改善。若 `.19` 顯示 3 張 empty 樣本連 standalone token 都沒有，下一步直接做性別小區域重讀，不再繼續放寬 selector。

## 2026-10-12 — `.17` 台胞證中文姓名達 13/13；main 已轉向 `.18` 性別證據修正

使用者完成 `2026.10.11.17` 正式 auto Validation，32/32 成功。護照維持全欄 68%（13/19）、中文姓名 68%。台胞證再提升：全欄 **77%（10/13）**、中文姓名 **100%（13/13）**、出生日期 100%、性別 **77%（10/13）**、證件號碼 100%、有效期限 100%。因此目前台胞證唯一剩餘非滿分欄位就是 sex，且 3 張整張錯誤可由 sex 77% 解釋。

`.17` one-syllable fallback 命中 2 張且實際採用 2 張；BOCA official promotion 4 張、joined-token promotion 2 張仍保留。最終 raw-row 姓名 13/13 都有結果，台胞證中文姓名正式達到 13/13。後續 **不得再調整姓名 selector**，除非新資料證明回歸；`.17` 姓名策略視為目前最佳基準鎖住。

### `.18` main 候選：sex evidence

檢查 `taiwanPermitMrz.ts` 確認 MRZ sex 字元位於 line1 index 22，但 composite checksum 使用 `slice(2,22) + slice(23,30)`，明確跳過 sex。故 `requiredValid=true` 也不能驗證 M/F 是否正確。

舊 `selectPermitSexCandidate()` 只有在 geometry labeled sex 與 semantic sex 同時一致且高分時，才允許覆蓋 MRZ；若 OCR raw row 已直接讀到 `性別女 / Sex F`，但 geometry label 沒抓到，仍會錯誤保留未受 checksum 保護的 MRZ sex。

`.18` 新增 `selectPermitSexEvidence()`：保留既有高分 visual-agreement 優先；若 **同列 strong semantic sex** 與 MRZ 衝突，允許 semantic-row override；沒有 strong semantic 時仍保留 MRZ。semantic parser 已抽成 `permitSexSemantics.ts`，只逐 row 接受同列 `性別男/女`、`男/女性別`、`Sex M/F`，不再把全部 OCR rows 串起來跨列湊字。

Validation 新增匿名 sex evidence：有 MRZ sex、geometry label、same-row semantic 各幾張；MRZ vs semantic conflict 幾張；其中 MRZ 其他 checksum 仍 requiredValid 幾張；最終來源 visual-agreement / semantic-row / MRZ / label / semantic / empty 各幾張。不保存旅客資料。

新增 executable tests：直接驗證 semantic-row 可覆蓋 MRZ、無 semantic 時 MRZ 保留、same-row parser 正負例（跨 row 不得誤判）、sex diagnostics aggregate/UI wiring。`npm.cmd run verify:ocr` 已納入 sex evidence test。pipeline metadata 為 `2026.10.11.18`。

`.18` 尚未在使用者 Windows 本機跑 verify/build 或 32 張 Validation，不能宣稱 sex 13/13。GitHub Actions 維持 workflow_dispatch only、未執行。

## 2026-10-12 — `.17` 候選完成：只處理唯一 short/exact one-syllable mismatch

在 `.16` 已達到台胞證中文姓名 11/13、整張 9/13、護照 13/19 的目前最佳基準後，main 已完成 `.17` 候選。`.17` 不改 BOCA official promotion、不改 exact joined-token promotion、不恢復 row-distance fallback，也不做任意 fuzzy Romanization。

`.17` 唯一新增 production selector 規則：只有在沒有任何 compatible 或可接受 unknown candidate 時，收集所有 `compatibility=conflict` 且為 **2–4 個中文字、完整獨立 raw row** 的候選；若這類 short/exact conflict **恰好只有一個**，而且 subtype 正好是 `one-syllable-mismatch`，才回傳該候選並標記 `oneSyllableFallbackPromotion=true`。只要有第二個 short/exact conflict，或候選不是完整列、不是 2–4 字、不是 one-syllable mismatch，就不自動選。

此 fallback 保留 candidate 的 `compatibility='conflict'`，不假裝成 phonetic-compatible；因此 downstream confidence 仍是較保守的 row/conflict 路徑，人工審核語意不會被抬高。Validation 新增匿名指標：符合 one-syllable fallback 條件的樣本數、實際採用件數。

synthetic regression 已覆蓋：唯一 one-syllable 成功、非 exact 拒絕、5 字以上拒絕、存在第二個 short conflict 拒絕、compatible 優先、anchored unknown 優先、token-count conflict 不得誤採。版本 metadata 已更新為 `2026.10.11.17`。

`.17` 尚未在使用者 Windows 本機執行 `npm.cmd run verify:ocr`、Docker frontend rebuild 或 32 張 Validation，不能宣稱達到 13/13。GitHub Actions 仍 workflow_dispatch only，未執行。

## 2026-10-12 — `.16` 再次實質提升；main 下一步聚焦唯一 one-syllable mismatch

使用者完成 `2026.10.11.16` 正式 auto Validation，32/32 成功。護照維持：全欄 68%（13/19）、中文姓名 68%、其餘評估欄位 100%。台胞證再提升：全欄 **69%（9/13）**，中文姓名 **85%（11/13）**；出生日期 100%、性別 77%、證件號碼 100%、有效期限 100%。相較 `.15`，台胞證全欄 7/13→9/13，中文姓名 9/13→11/13；護照無退步。

`.16` joined-token Romanization 路徑已被實測證明有效：有 exact joined-token promotion candidate 2 張，最終實際選中 2 張；BOCA official promotion 仍維持 4 張、實際選中 4 張。最終 compatible 共 11 張，unknown 0，raw-row none 2。這與中文姓名 11/13 正確率一致。

剩餘 conflict subtype 匿名樣本數：token-count mismatch 5、one-syllable mismatch 2、other 0、unclassified 0。這些計數可重疊；但只剩 2 張最終沒有 raw-row 姓名，而既有 ground-truth 對照顯示這 2 張中文姓名錯誤樣本的正確姓名 **2/2 仍完整存在 raw row**。下一步應只針對最保守的 one-syllable 唯一候選條件，不再放寬 token segmentation、row distance 或任意 fuzzy spelling。

`.16` 已成為目前最佳基準：護照全欄 13/19；台胞證全欄 9/13、中文姓名 11/13。任何後續版本必須至少維持此基準。

## 2026-10-12 — `.15` 首次大幅提升；main 已進入 `.16` exact joined-token Romanization

`.15` 正式 auto Validation 已確認有效：32/32 成功；護照全欄維持 68%（13/19）、中文姓名 68%。台胞證全欄提升到 **54%（7/13）**，中文姓名提升到 **69%（9/13）**；出生日期 100%、性別 77%、證件號碼 100%、有效期限 100%。這是自 `.6` 之後第一個明確超越舊基準的台胞證姓名版本。

`.15` 匿名 selector 證據：BOCA 官方／舊式拼音 promotion candidate 4 張，最終實際選中 4 張；最終 compatible 共 9 張，raw-row none 4 張。剩餘 conflict subtype 樣本數為 token-count mismatch 6、one-syllable mismatch 2、other 0、unclassified 0。這些 subtype 樣本數可重疊，不等同 8 張唯一錯誤樣本。

### `.16` main 候選

- 不改 BOCA `.15` 成功邏輯，也不恢復 row-distance fallback。
- 針對最大的剩餘 subtype `token-count-mismatch`：新增 `matchesChineseNameToJoinedRomanizationWithOfficialVariants()`。只有當標準與 BOCA 一般 token-by-token 比對仍 conflict，且 conflict subtype 是 token-count mismatch 時才啟用。
- joined-token 判斷會把 surname + given-name tokens 正規化後完整串接，再以每個中文字所有合法 Hanyu/common/BOCA 拼音 aliases 做精確動態切分；**每個中文字必須消耗一個合法 alias，整個 Latin 字串必須剛好全部消耗**。不允許任意 fuzzy edit，也不處理 one-syllable mismatch。
- 範例：`王一明 / WANG IMING` 可由 `WANG + I + MING` 精確切分；`王英明 / WANG YINMING` 仍不可因只差一個音節而通過。
- resolver 優先序：標準 compatible > BOCA official compatible > exact joined-token compatible > anchored unknown > conflict。標準 compatible 即使距離較遠仍優先於 promotion。
- Validation 新增匿名 joined-token 指標：有 exact joined-token promotion candidate 的樣本數、最終實際選中 joined-token candidate 的樣本數。既有 conflict subtype 同輪保留，因此 `.16` 若仍未救完剩餘 4 張，不需再跑純診斷版本。
- 新增/擴充 executable tests：`test-romanization.mjs` 直接測 joined-token 正負例；`test-permit-raw-name-romanization.mjs` 測 resolver promotion、標準優先及負例；diagnostics test 驗證 joined-token 匿名 aggregate 與 UI wiring。所有測試仍由 `npm.cmd run verify:ocr` 一次執行。
- pipeline metadata 更新為 `2026.10.11.16`。

`.16` 尚未在使用者 Windows 本機執行 verify/build 或照片 Validation，不能宣稱進一步提升。GitHub Actions 仍 workflow_dispatch only、未執行。

## 2026-10-12 — `.15` 首次取得明確實質提升；BOCA 官方拼音路徑有效

使用者完成 `2026.10.11.15` 正式 auto Validation，32/32 成功。護照維持：全欄 68%（13/19）、中文姓名 68%、其餘評估欄位 100%。台胞證明顯提升：全欄 **54%（7/13）**，中文姓名 **69%（9/13）**，出生日期 100%、性別 77%、證件號碼 100%、有效期限 100%。相較 `.14` / `.6`：台胞證全欄由 4/13 / 5/13 提升到 7/13；中文姓名由 5/13 / 6/13 提升到 9/13。

`.15` raw-row selector 診斷顯示 BOCA 官方／舊式拼音 promotion 是有效來源：有 official-variant promotion candidate 4 張，最終實際選到 official-variant candidate 4 張；最終 compatible 共 9 張，unknown 0 張，raw-row none 4 張。這與中文姓名 9/13 正確率一致，說明此次增益直接來自 Romanization gating 修正，而不是影像 retry 或 row-distance fallback。

剩餘 conflict subtype 匿名樣本數：token-count mismatch 6、one-syllable mismatch 2、other 0、unclassified 0。這些是樣本是否出現該類 conflict candidate 的匿名計數，可重疊，不等於 8 張唯一錯誤樣本。下一步應針對剩餘 4 張姓名錯誤，先處理 **token-count mismatch** 與 **one-syllable mismatch** 的可安全自動判斷，不再回到 row-index distance fallback。

`.15` 已證明：標準 romanization + BOCA 官方拼音別名 + all-raw-row selector 是目前有效方向。任何後續修改都必須維持護照 13/19、不降低台胞證現有 9/13 中文姓名，並保留固定 Validation 比較。

## 2026-10-11 — `.14` 實測證明 row-distance fallback 無效；main 已進入 `.15` BOCA 官方拼音升級

使用者完成 `.14` 正式 auto Validation：32/32 成功。護照維持全欄 68%（13/19）、中文姓名 68%；台胞證仍全欄 31%（4/13）、中文姓名 38%（5/13）、性別 77%、出生日期／證件號碼／有效期限 100%。因此 `.14` 沒有準確率提升。

`.14` raw-row selector 診斷：13/13 有英文姓名列；0/13 有姓名標籤列；5/13 有標準 romanization-compatible 中文候選；9/13 有 conflict 中文候選；其中 8/13 是 2–4 字完整獨立列。**最近英文姓名 row 距離分布為 <=2: 0、3–4: 0、>=5: 8**。所以 `.13/.14` 的 row-index distance 並不是可靠姓名 anchor；把距離門檻從 2 放寬到 4 仍 0 張 eligible，且不得再繼續無限制放寬。

同時既有 ground-truth 對照仍顯示 8 張台胞證中文姓名錯誤樣本中，8/8 正確姓名完整存在 raw row。問題因此集中在 Romanization gating，而不是 Detection、Recognition、Latin row 解析或 retry。

### `.15` main 候選

- 停止 row-distance conflict fallback 對正式 selector 的影響；`permitRawNameEvidence.ts` 現在只接受 compatible 或有合理 anchor 的 unknown。距離 bucket 僅保留匿名診斷用途。
- raw-row Romanization 判斷改由 `permitRawNameRomanization.ts` 純函式統一處理。標準拼音 compatible 永遠優先；若標準 comparator 為 conflict，但 `compareChineseNameToMrzWithOfficialVariants()` 根據既有 BOCA WG / MPS-II / Tongyong / Hanyu 對照表可完整匹配，才升級為 compatible。
- 官方拼音升級不放寬 one-syllable mismatch，也不接受任意 fuzzy spelling；真正錯誤仍保持 conflict。
- Validation 新增匿名 BOCA 指標：有 official-variant promotion candidate 的樣本數、最終實際選到官方拼音升級候選的樣本數。
- 同一輪新增匿名 conflict subtype：token-count-mismatch、one-syllable-mismatch、other-mismatch、unclassified。若 `.15` 沒提升，下一步可直接依 subtype 處理，不需另跑一輪只為診斷。
- 新增 `test:permit-raw-romanization` 功能測試，直接執行 resolver，驗證標準 compatible、BOCA-only compatible、標準優先、真正 conflict、token-count conflict、unknown 與無 anchor。既有 selector/diagnostics tests 已移除 `.14` fallback 預期並改鎖 `.15` 行為。
- pipeline metadata 更新為 `2026.10.11.15`。

`.15` 尚未在使用者 Windows 本機執行 `npm.cmd run verify:ocr`、Docker frontend rebuild 或 32 張照片 Validation，不能宣稱提升。GitHub Actions 維持 workflow_dispatch only，未執行。

## 2026-10-11 — `.13` 實測仍無改善；main 已進入 `.14` four-row conservative conflict fallback

使用者完成 `.13` 正式 auto Validation：32/32 成功。護照維持全欄 68%（13/19）、中文姓名 68%；台胞證仍全欄 31%（4/13）、中文姓名 38%（5/13）、性別 77%、出生日期／證件號碼／有效期限 100%。因此 `.13` 的 conflict fallback 在原本 `latinDistance <= 2` 條件下沒有改善。

`.13` selector 診斷：13/13 台胞證都有英文姓名列；0/13 有姓名標籤列；5/13 有 romanization-compatible 中文候選；9/13 有 romanization-conflict 中文候選；但 **0/13 符合原本保守 fallback 條件**，最終 compatible 5、unknown 0、conflict fallback 0、raw-row none 8。既有 ground-truth 對照仍顯示 8 張姓名錯誤中 8/8 正確姓名完整存在 raw row。這強烈指向 `latinDistance <= 2` 對 OCR row grouping 過嚴。

### `.14` main 候選

- 保留原本安全框架，只將 conflict fallback 的 Latin row 距離由 `<=2` 放寬到 `<=4`。其他條件不變：candidate 必須為 standalone/exact raw row、2–4 個中文字，且只有在 compatible / 合理 unknown 候選都不可用時才考慮。
- 再加一層保護：**只有恰好一個** eligible conflict fallback candidate 才自動選用；如果同一張有多個 eligible short Han row，直接放棄 fallback，交人工審核，不猜。
- 新增匿名距離診斷：有 short/exact conflict candidate 的樣本數、最近 Latin row 距離 `<=2` / `3–4` / `>=5`、eligible fallback 樣本數、unique eligible 與 ambiguous eligible 件數、最終實際選到 fallback 件數。
- synthetic tests 已補：4 rows 可接受、5 rows 拒絕、長中文拒絕、非 exact row 拒絕、compatible/unknown 永遠優先、多個 eligible conflict 候選必須拒絕。
- pipeline metadata 更新為 `2026.10.11.14`。

`.14` 尚未在使用者 Windows 本機執行 `verify:ocr`／Docker rebuild／32 張照片 Validation，不能宣稱提升。GitHub Actions 維持 workflow_dispatch only，未執行。

## 2026-10-11 — `.12` 實測仍無改善；main 已進入 `.13` conservative conflict fallback

使用者完成 `.12` 正式 auto Validation：32/32 成功。護照維持全欄 68%（13/19）、中文姓名 68%；台胞證仍全欄 31%（4/13）、中文姓名 38%（5/13）、性別 77%、出生日期／證件號碼／有效期限 100%。因此 `.12` 的 `Name ...` Latin-row parser 修正本身沒有提高正確率。

`.12` 新增 selector 診斷顯示：13/13 台胞證都有英文姓名列；0/13 有獨立姓名標籤列；5/13 有 romanization-compatible 中文候選，最終也正好選到 compatible 5 張；selected unknown 0 張；8 張完全沒選到 raw-row 姓名。另一方面，既有 ground-truth 對照仍顯示這 8 張錯誤樣本的正確中文姓名 **8/8 已完整存在 raw row**。因此剩餘阻塞高度集中在 Romanization `conflict`／anchor gating，而不是 Detection、Recognition 或 Latin row 解析。

### `.13` main 候選

- `permitRawNameEvidence.ts` 新增保守 conflict fallback：只有在沒有任何 compatible / 可接受 unknown 候選時，才允許 `compatibility=conflict` 的 raw-row candidate。
- fallback 必須同時滿足：standalone/exact raw row、純姓名值 2–4 字、距離已解析 Latin name row 最多 2 個 OCR row。目的是救 legacy／非標準拼音或英文 OCR 輕微偏差，不放寬到發證機關、地址、長中文文字。
- compatible / anchored unknown 永遠優先於 conflict fallback；已新增 synthetic regression tests 鎖定此排序。
- pipeline metadata 更新為 `2026.10.11.13`。
- Validation 匿名診斷增加：有 conflict candidate 的樣本數、符合 fallback 條件的樣本數、實際選到 conflict fallback 的樣本數；不保存姓名、raw row、sample ID 或影像。

`.13` 尚未本機 `verify:ocr`／Docker rebuild／照片 Validation，不能宣稱提升。下一個驗證點只需一次完整流程；GitHub Actions 維持關閉。

## 2026-10-11 — `.12` 本機驗證被 Latin-name regex 語法錯誤阻擋，已直接修復

使用者執行 `npm.cmd run verify:ocr` 時 Node/TypeScript 在 `src/services/permitLatinName.ts(33,20)` 報 `TS1517: Range out of order in character class`，同時 Node 顯示 `SyntaxError: Invalid regular expression: /[^A-Z,- ]/g`；Docker frontend rebuild 也在 `npm run build` 同樣失敗。這代表 `.12` 尚未進入 OCR Validation，不能把任何舊頁面結果當成 `.12`。

根因是從 GitHub 端新增 parser 時正則跳脫遺失：`/[^A-Z,\- ]/g` 被寫成非法的 `/[^A-Z,- ]/g`，且 whitespace normalization 的 `/\s+/g` 也被誤寫成 `/s+/g`。已在 main 修正兩處並重新核對 `permitLatinName.ts` 實際內容：字元類別中的 hyphen 已 escape、whitespace regex 已恢復。GitHub Actions 未執行。

下一步只需重新 `git pull origin main` 後跑既有 `npm.cmd run verify:ocr`；若通過，再 rebuild frontend container 並進行 `.12` Validation。不要重複修改 OCR 邏輯，先確認此語法修復。

## 2026-10-11 — `.11` 實測無準確率改善；main 已進入 `.12` Latin-name anchor 修正

使用者在 Docker frontend 顯示 `目前頁面 OCR pipeline: 2026.10.11.11` 後完成正式 auto Validation。32/32 成功；護照維持全欄 68%（13/19）、中文姓名 68%、其餘欄位 100%。台胞證仍為全欄 31%（4/13）、中文姓名 38%（5/13）、性別 77%、出生日期／證件號碼／有效期限 100%。因此 `.11` 的 all-raw-row selector 在現有樣本上沒有帶來正確率提升。

`.11` 診斷進一步確認：8 張錯誤姓名仍有 8/8 完整 ground-truth 姓名存在 raw row；retry 由 `.10` 的 24 次降至 16 次，16/16 有文字框、只有 1 次有合格候選，且「姓名重讀實際覆寫」為 0。故 `.10`/`.11` 的姓名錯誤不是 retry 覆寫造成；問題仍是 raw-row candidate 沒有取得足夠 anchor evidence。

### `.12` 直接根因修正

程式檢查發現 `extractPermitLatinName()` 把 `NAME` 列為 stop word。台胞證 OCR 若把印刷標籤與英文姓名合併成 `Name LIN YI CHEN`，舊 parser 會整列拒絕，導致 `.11` 的 raw-row selector 沒有 Romanization anchor；即使正確中文姓名已在 raw row，仍可能只得到 `unknown` 並因離姓名 label 太遠而被排除。

`.12` 將英文姓名 parser 抽成 `permitLatinName.ts`：只移除**開頭**的 `Name` 標籤，再套原有 stop-word 與格式檢查；`NAME` 出現在其他位置仍會拒絕。新增功能測試涵蓋 `Name LIN YI CHEN`、`NAME CHEN, YI-CHEN`、無標籤姓名與 SEX/TAIWAN/單 token 負例。

同批加入匿名 raw-row selector 診斷：Latin row 件數、姓名 label row 件數、是否存在 romanization-compatible candidate、最後選到 compatible/unknown/none 的件數。只保存彙總，不保存姓名、raw row、sample ID 或圖片。新增 `test:permit-raw-name-diagnostics` 並納入 `verify:ocr`。

pipeline metadata 已更新為 `2026.10.11.12`。`.12` 尚未本機 regression/build 與照片 Validation，不能宣稱提升。下一個唯一驗證點：`npm.cmd run verify:ocr` → rebuild frontend container → 確認頁面 `.12` → 同一組 32 張 auto Validation。GitHub Actions 仍禁止執行。

## 2026-10-11 — `.10` 實測退步，main 已轉為 `.11` raw-row selector 修正候選

使用者完成正確 Docker frontend 重建後，正式 auto Validation 明確顯示版本 `2026.10.11.10`，32/32 成功。護照維持：全欄 68%（13/19）、中文姓名 68%、其餘評估欄位 100%。台胞證退步為：全欄 31%（4/13）、中文姓名 38%（5/13）、性別 77%（10/13）、出生日期／證件號碼／有效期限 100%。因此 `.10` 不可視為改善，與 `.6` 比較台胞證中文姓名由 6/13 降至 5/13、全欄由 5/13 降至 4/13。

真正關鍵證據：`.10` 的 8 張台胞證中文姓名錯誤樣本中，ground truth 姓名 **8/8 都完整存在於選中 OCR raw row**；embedded 0、raw row 缺失 0。錯誤子群啟動姓名重讀 8 張，共 24 次裁切 OCR，24/24 有文字框，但只有 1 次形成目前規則下的合格姓名候選。這表示此批主要瓶頸已從 Detection/Recognition 縮小到 **raw row 後處理／候選選擇**。

另發現 `.10` 診斷文字「姓名重讀候選已採用 6」是統計語意 bug：原程式用 `chineseNamePasses > 0` 代表 retry accepted，但初次 OCR 有姓名也會 passes=1。`.11` 新增明確 `nameRetryApplied`，只在 retry 真正覆寫最終姓名時為 true；Validation 改顯示「姓名重讀實際覆寫」。

### `.11` main 候選變更

- `extractPermitChineseNameFromRows` 不再只找「Latin name 前 1–2 列並取第一個非 conflict」；現在掃描全部 raw rows，把所有 plausible Han candidate 與所有 Latin name rows、姓名 label row 建立匿名 evidence，再由 `permitRawNameEvidence.ts` 排序。
- romanization `compatible` 的 raw-row candidate 即使因 row grouping 距離較遠也優先；`unknown` candidate 必須靠近姓名 label 或 Latin row；`conflict` 一律排除。
- `.10` 的灰階／對比 enhancement retry 已退出正式流程並刪除相關模組與測試：實測沒有帶來姓名收益，卻增加 8 張錯誤樣本到 24 次 retry OCR。
- 恢復保守 retry policy：已有姓名但沒有可量化 confidence 時不做無效 retry，也不能被 retry 覆寫；只有缺姓名或低數值 confidence 才重讀。
- pipeline metadata 更新為 `2026.10.11.11`。
- 新增 `test:permit-raw-name`，並納入單一 `npm.cmd run verify:ocr` regression/build 入口；測試包含 compatible far-row 優先、conflict 排除、unknown 無錨點拒絕、近 label unknown 允許，以及實際 OCR wiring 不再使用舊 `offset <= 2` first-match 邏輯。

`.11` 尚未本機程式驗證與照片 Validation，不能宣稱提升。下一個驗證點是一次 `verify:ocr` + Docker frontend rebuild + 固定 32 張正式 auto Validation。GitHub Actions 維持禁用。

### Validation 舊版本防誤判

Validation 歷史結果若 `pipelineVersion !== OCR_PIPELINE_VERSION`，頁面現在會直接警告「這是舊 OCR 版本結果」，並顯示目前頁面 pipeline 版本。目的在避免 host 已更新、Docker frontend 仍舊 bundle 時，把 `.6` 歷史結果誤認為 `.10` 新實測。此 UI 改動將由下一次 `docker compose up -d --no-deps --build frontend` 內的 Docker `npm run build` 一併驗證。

## 2026-10-11 — `.10` 本機程式驗證已通過；Docker 舊前端造成 Validation 仍顯示 `.6`

使用者於 Windows `main` 執行 `npm.cmd run verify:ocr`，畫面確認完整 OCR regression 全部通過，包含 8 個 romanization cases、6 個 review suggestion checks、35 個 permit field/MRZ/retry guards、selected-image/rotation、raw-row bucket、ROI coordinate source、Chinese label anchor、anonymous source evidence、broad-name crop、name enhancement、retry detection、independent-region evidence；其後 `vue-tsc --noEmit && vite build` 成功，Vite 共轉換 106 modules。黃色 externalized module/chunk size 訊息為 warning，不是 build failure。

同一輪瀏覽器 Validation 畫面底部仍顯示 `版本 2026.10.11.6`，且結果與舊基準完全相同（護照全欄 68%、台胞證全欄 38%、台胞證中文姓名 46%）。這**不是 `.10` 的照片實測結果**。專案的日常整合環境由 Docker `frontend` Nginx 提供；直接在 host 執行 `npm run build` 只更新 host `frontend/dist`，不會把既有 container 中 `/usr/share/nginx/html` 的舊 bundle 換掉。要驗證新 main，需在 repo 根目錄重建並 recreate frontend container，例如：`docker compose up -d --no-deps --build frontend`，再瀏覽器強制重新整理。不要執行 `docker compose down -v`。

因此最後有效照片準確率仍是 `.6`，`.10` 目前只有程式 regression/build 證據；待 Docker frontend 更新後才跑一次固定 32 張 auto Validation。

## 2026-10-11 — OCR 2026.10.11.10 main 批次候選（已完成程式，待一次本機＋照片驗證）

本批依單人 main-first 流程直接累積於 `main`，不再拆小 PR；舊 PR #33 的匿名診斷能力已安全搬回 main，PR #33 已關閉且未合併，避免舊分支覆蓋新版。

### 本批真正影響 OCR 的變更

- 台胞證姓名 broad retry 不再用會縮小低解析來源的通用 crop，改用有限放大的 `createPixelCrop`。
- ROI 起點 clamp 到影像合法邊界；放大最多 2.5x、輸出寬度最多 1800px，避免極端插值與 Canvas 資源暴增。
- 對姓名 retry 只增加 **一個**灰階＋1.25 對比增強變體；優先 tight/anchored ROI，沒有 anchor 才增強 broad ROI。
- retry 每次 OCR 前檢查既有 9 秒 soft budget；超時即停止，不強制跑完所有變體。
- `currentConfidence === null` 現在視為不確定，而不是可靠：允許啟動 retry，也允許高品質 retry 結果取代未知 confidence 的既有姓名。
- 增強圖與原圖若來自同一 ROI，不再算兩個獨立 consensus；覆蓋既有姓名仍要求 anchored / broad 兩個獨立區域一致。
- pipeline metadata 已正確更新為 `2026.10.11.10`（先前文件提到 .9/.10，但程式常數仍停在 .8 的問題已修正）。

### 診斷與測試

- PR #33 的匿名 retry 診斷已直接整合 main：Validation 可看到全部台胞證及「中文姓名錯誤子群」的 retry 次數、OCR box 次數、姓名候選次數。
- 新增/更新純函式測試：pixel enhancement、retry evidence independent-region consensus、null-confidence policy、retry diagnostics、ROI scale/bounds。
- `npm.cmd run verify:ocr` 會一次執行全部 OCR regression scripts 與 Vite/TypeScript Build，作為本批唯一程式驗證入口。
- 已用 GitHub 端靜態檢查確認 `.10` 版本、bounded upscale、ROI clamp、enhancement、time budget、independent consensus、Validation wrong-name wiring 均存在；**GitHub Connector 不能代替本機 Node/Vite 執行**。
- GitHub Actions 仍僅 `workflow_dispatch`，本批沒有啟動 Actions。

### 驗證標準

最後有照片實測證據的仍是 `.6`：護照全欄 13/19、台胞證全欄 5/13；台胞證中文姓名 6/13。`.10` 尚未照片驗證，絕不可先宣稱提升。下一次應只做一次集中驗證：本機 regression + build 通過後，再跑既有 32 張 auto Validation，比較 `.10` 對 `.6` 的淨改善、退步及耗時。固定 Test 不變，不把 Test 圖加入 Train。

## 2026-10-11 main OCR .9 裁切防退步修正（待一次集中本機驗證）

在 `createPixelCrop` 讀取 bitmap 後先將 x/y 限制於有效畫素起點 `0..width-1` / `0..height-1`，防止來源 OCR anchor 略為超出影像邊界，導致無效 Canvas 來源裁切。修正 `test:permit-broad-crop` 新腳本最初不正確的雙重 regex escape，現在以來源守衛檢查邊界、2.5x 上限、1800px 上限與廣域重讀流程；**測試尚未在用戶 Windows 本機真正執行**。這是健全性修正，非實測辨識準確率提升。沿用 main-first，不新增 PR，不跑 GitHub Actions。舊 PR #33 尚未合併，須後續成批處理且不能直接覆蓋 main .9。

## 2026-10-11 main OCR .9 第二批：限制小圖片不合理放大（未本機驗證）

延續 main 的姓名重讀 ROI 改動，`createPixelCrop` 由一律填補到至少 1200/1500px 改成最多放大 2.5 倍、整體 1800px 上限：例如 300px 裁切最多 750px，600px 可到 1500px，避免低解析裁切被過度插值、大型 Canvas 占用瀏覽器資源。新增 `test:permit-broad-crop` 的邊界案例。此函式也用於其他姓名 crop，故須整批執行既有測試及 Build，並在正式照片 Validation 檢查準確率和時間是否退步。**沒有實測證據，不宣稱提升**。GitHub Actions 禁止執行，PR #33 仍獨立待本機測試與合併。後續盡量維持 main，勿再為每個小修改建立 PR。

## 2026-10-11 — main 直接開發：台胞證姓名重讀影像清晰度（OCR 2026.10.11.9；待驗證）

依單人 main-first 決策，不再為每個小改動開 PR。將 `retryPermitChineseName` 中原使用 `createRelativeCrop(image, .08, .06, .84, .72)` 的廣域姓名二次 OCR，改為相同來源範圍、`createPixelCrop(..., 1500)`：較小影像不再因通用裁切縮至原寬，而能有限度提升漢字 OCR 輸入寬度；沿用共用裁切 1800px 上限。原照片及主要 OCR 管線均未改；無網路 OCR、無影像持久化。新增 `npm.cmd run test:permit-broad-crop` 原始碼守衛；需要搭配本機 Build 與後續 Validation 實測，**尚不能宣稱準確率提升**，也不保證放大一定有效，可能使運算時間增加。

這個 main 修改目前未含 PR #33 的診斷功能，PR #33 仍在獨立舊分支上且尚未本機測試；不能直接假設 PR 已併入或在未檢查衝突前合併。後續應先驗證 main .9，統一收束 PR #33，避免重複小 PR。GitHub Actions 僅 workflow_dispatch，禁用雲端執行。最後實際照片準確率仍 .6，凍結 fixed Test 不變。

## 2026-10-11 — 台胞證 OCR 匿名來源統計（待本機驗證）

延續 `.8` 主線，只增加 Validation 的可觀察性，不更改 OCR 判斷／模型／輸出或版本號。利用現有 `distanceCropUsed`、`chineseNamePasses`、`chineseNameConsensus`、`mrzUsed`，在每張 Evaluation 的記憶體內做匿名彙總，僅報告「選用放大距離裁切」「姓名重讀候選已採用」「雙區域一致候選」「MRZ 提供過欄位」四項件數。程式抽出 `permitSourceEvidence.ts`，新增 synthetic `test:permit-source` 驗證計數與無個資輸出。與既有「7 張姓名錯誤未在選中 rawRows 中出現」分類搭配，僅可縮小研究範圍；**不能確定 Detection/Recognition 因果，也沒有修正 OCR 精準率**。沒有個人名字、原始 OCR 文字、sample ID、工作影像或逐張資料保存到結果或 GitHub。

GitHub Actions 因額度限制維持 `workflow_dispatch` 且不得執行。此批在 GitHub Connector 完成原始碼和文檔更新，尚無本機 Build／照片 Validation 證據；等本批整理完成再讓使用者一次執行。正式 `.8` 與最後實際 `.6` 精準度請區分；fixed Test 不變。

## 2026-10-11 — 候選 .8：台胞證姓名二次裁切標籤信任順序（未實測）

程式檢查發現：目前 `createPermitNameGroupCrop()` 同時將「姓名」及 `Name` 放在同一組 label anchors，以 confidence 排序，會讓較高分的英文 Name 標籤擠掉真實中文字樣。候選版 `.8` 只改 **name retry ROI anchor**：先找中文「姓名」，缺失才用英文 Name，仍找不到才以拉丁姓名為錨點。保留 .7 的 `predictionImage` 同座標來源、既有姓名共識檢查與人工審核；不改固定 Test、照片保留或旅客正式資料。加入 `npm.cmd run test:permit-name-roi` 的結構性來源防退步測試，但 GitHub Actions 額度保護仍有效且不會觸發。**這是推定具風險的選錨行為修正，沒有真實影像驗證，不能宣稱準確率提升或新版本成功。** 待本機 test + build 後才合併，之後與其他有效批次一次 Validation。仍優先取得真正工作影像與 Detection/Recognition 的可用證據。

## 2026-10-11 — GitHub Actions 額度保護（最新操作規範）

GitHub 寄送已用 2,700 / 3,000 included Actions 分鐘（90%）通知；使用者明確要求**停止使用 GitHub Actions 額度**。因此在 main commit `fdea84db799c9b6a19f1ac7bca2f15b68763e5ca`，將唯一 `.github/workflows/ci.yml` workflow 由 push + pull_request 自動觸發改成 **workflow_dispatch 手動觸發**，以免每輪提交或 PR 自動跑昂貴的 Docker smoke test。**嚴禁自行手動觸發 workflow 或恢復自動 CI**，除非使用者明確同意。

往後採用本機檢查：`cd frontend && npm ci && npm run test:romanization && npm run test:permit-evidence && npm run test:permit-image && npm run test:permit-buckets && npm run build`；`dotnet build backend/PassportScanner.Api/PassportScanner.Api.csproj --configuration Release`（請先核對 csproj 實際路徑）。必要時本機 `docker compose up -d --build` 做煙霧驗證，但絕不執行 `down -v`。若 GitHub Connector 環境無法執行本機驗證，必須將狀態寫明「未在本機執行」而非宣稱 CI 成功。之後 PR 不會有自動 CI；禁止把它當作通過測試。

最新版 OCR 原碼仍為 `2026.10.11.6`；最後照片準確率實測仍為 `.5`，無增益。應優先影像來源/ROI 的實質改善與合法樣本可用性，不再反覆小幅 selector 調參。


## 2026-10-11 — 台胞證匿名 OCR 原始文字列分類（候選，未實測）

在 Validation 內針對台胞證姓名錯誤，比對選中 OCR 的 rawRows 後只保存三種分類計數：`exact-raw-row`、`embedded-in-raw-row`、`not-in-selected-raw-rows`。僅瞬間在本機記憶體處理姓名，報告不含真值、OCR 文字、ID、逐張結果與影像。合成測試檢查分類及匿名輸出並接入 CI。這只能指出最終 OCR 文字列是否包含姓名，**不能確定 Detection/Recognition/ROI 的根因**，也無法補回缺失的 OCR 工作輸入圖。尚無本機 Validation 或精準率提升證據。保留固定 Test、人工覆核與影像政策；下一步做真實工作圖來源／ROI 分析並整批驗收。

## 2026-10-11 — OCR .6 選中影像與覆核顯示一致性修正（待 CI / 本機驗收）

在台胞證 `recognizeTaiwanCompatriotPermitWithPaddle` 找到真實程式缺口：deskew 後若重新 OCR 品質分數比原候選差，`best` 仍保留原候選，但舊碼會繼續用 deskew 圖作為覆核圖及旋轉角度，導致覆核圖不一定是 OCR 真正選中的影像。新分支 `fix/permit-selected-image-consistency` 改為**先完成 candidate 品質比較，再從選中的 `best.image` / `best.rotation` 取得覆核輸入與角度**，保留原有角度判斷、分數門檻、MRZ、姓名和人工審核機制。提議 OCR 版本 `2026.10.11.6`；新增程式結構自動守衛並放入 CI。此修正主要改善結果／覆核影像一致性，**不能聲稱 OCR 準確率已提高，也未獲照片驗收**。最新正式實測仍是 `.5` 無淨增益。此項不代替後續真實 OCR 工作輸入影像和 ROI 錯誤歸因。


## 最新實測狀態：2026-10-11 15:03（優先於下方交接快照）

**OCR `2026.10.11.5` 已由使用者本機正式 auto/WebGPU 完成一次 32 張 Legacy Validation，沒有淨增益。** 護照 n=19：整張全對及中文姓名 13/19 (68%)；台胞證 n=13：整張 5/13 (38%)、中文姓名 6/13 (46%)、性別 10/13 (77%)；其餘評估必要欄位 100%，失敗 0/32。護照 OCR median/P90 為 2.1/4.5 秒；台胞證 3.4/6.8 秒。與最後 `.3` 實測比例持平。PR #21/#22 雖已合併且 CI 成功，但在此 Legacy cohort 未證實精準率提升。

**後續動作已更改：不需再請使用者跑 `.5` 的相同 32 張，也不做 WASM/Worker 或 fixed Test。** 直接依 Issue #25 開發以真實 OCR 工作輸入影像、orientation/ROI/detection/recognition 錯誤歸因為核心的單一改善批次；自動測試與一次下輪 Validation 驗收。現有 32 張均沒有當次真正 OCR 工作輸入圖，可能同 Traveler 重複，身分證 n=0；只能作 legacy regression。不可擅自擴展 production 照片保存期限、上傳個資或改既有證件歷史／人工審核規則。

**本段是使用者實測證據紀錄，並非新的 OCR 程式改善或 CI 結果。** 後續最新 SHA、CI 需持續按 GitHub 檢查。參見 [WORKLOG.md](WORKLOG.md) 最新實測與 [Issue #25](https://github.com/YI-CHENLIN1204/passport-scanner-v2/issues/25)。

---


## 新對話啟動指令（直接複製到新的 ChatGPT / Codex）

> 請直接延續 GitHub 專案 **`YI-CHENLIN1204/passport-scanner-v2`**，不要重新規劃 V2 或重新研究已結案的 OCR 實驗。請先讀取 `docs/HANDOFF.md` 的最新狀態、`docs/WORKLOG.md` 最末幾輪、`docs/DECISIONS.md`、`docs/OCR_OPEN_SOURCE_REVIEW.md`，再檢查 GitHub `main` 最新 SHA、PR、CI 和實際程式碼。不要只憑舊對話或文件中的歷史 TODO 開工。
>
> **交接時 GitHub main** 為 `745280ab3f67c9aa4a5ea355a03f1c3c7e83be90`（PR #23 已整理交接，main CI #805 Success）；實際程式 OCR pipeline 是 **`2026.10.11.5`**，PR #21（台胞證 MRZ 姓名／性別交叉證據）與 #22（姓名標籤優先裁切）都已合併，但 **.5 尚未經使用者本機 Validation 驗證**。最後實測為 **`2026.10.11.3`**：護照 13/19 整張全對＝68%；台胞證 5/13＝38%，中文姓名 6/13＝46%，性別 10/13＝77%；32/32 完成，0 失敗。不可把 CI 綠燈當成實測精準度提升。
>
> **立刻下一步：** 只請使用者在 pull 最新 main 後跑**一次正式 auto Validation 32 張**，先確認版本 `2026.10.11.5`，再比對護照 68%、台胞證 38%／46%／77% 和 OCR 延遲。**若台胞證仍無改善，轉而整批處理真實影像 ROI、裁切、Detection / Recognition、MRZ 與資料集品質，停止反覆微調小型 selector 門檻。** 不要重跑已凍結的 fixed Test `2026.10.09.1`。這 32 張 legacy Validation 均缺當次 OCR 真正工作圖，不能宣稱新照片端到端準確率。
>
> V2 是旅行社內部的團別證件掃描／旅客審核／證件歷史與 CSV，不是 ERP、CRM 或旅客自助端。**禁止舊證件自動 fallback；團別歷史快照獨立；已審核資料不得一般刪除；必須人工覆核。** 原圖 production 保存期限是回國日 + 7 天，不得擅自延長。不得將證件影像、姓名、證號、金鑰、私人資料集上傳 GitHub。
>
> 請用**整批改進 → 自動測試與 CI → 一次 Validation → 紀錄改善／退步**的節奏快速推進。每輪更新 `HANDOFF.md`、`WORKLOG.md`，OCR 結論更新 `OCR_OPEN_SOURCE_REVIEW.md`，決策異動更新 `DECISIONS.md`，並以 PR 合併 GitHub。先告訴我當前確認的狀態與下一個實際改進批次，**不要從頭問需求或要求重做已完成的實驗**。

---


## 最新狀態：2026-10-11 13:56（優先於本文下方歷史段落）

**下一個對話從這一節開始，不要依照下方較早的「待做事項」重新開發。**

- Repository：`YI-CHENLIN1204/passport-scanner-v2`，`main` 已核對為 `745280ab3f67c9aa4a5ea355a03f1c3c7e83be90`（PR #23 交接文件整理合併，main CI #805 Success；接手時仍須重新查 SHA）。
- 主線目前**程式中定義的 OCR pipeline**：`2026.10.11.5`，已合併 **PR #21**（台胞證 MRZ 姓名與性別證據信任順序，main CI #801 Success）及 **PR #22**（姓名重試裁切優先「姓名」標籤，main CI #803 Success）。這兩項**尚未取得使用者本機 Validation 實測**，不能說已改善精準率。
- **最後一次實際本機 Validation（2026-10-11 05:02）使用的版本是 `2026.10.11.3`，不是目前 main 的 `.5`。** 正式 auto backend，偵測／辨識 provider 均 `webgpu`；32/32 完成，0 失敗。護照 n=19：中文姓名與整張全對 13/19＝68%，其餘有評估的必要欄位 100%。台胞證 n=13：整張全對 5/13＝38%，中文姓名 6/13＝46%，性別 10/13＝77%，生日／證號／有效期限 100%；簡繁字形可能相當但 exact 不同的姓名 0 張。身分證 Validation 目前 0 張。
- 歷史對照：正式 `2026.10.09.1` 護照 7/19（37%），`2026.10.11.1` 用受限 BOCA 官方拼音候選提高至 13/19（68%）；已在 `2026.10.11.2`、`.3` 維持 13/19。台胞證 `.1` → `.2` → `.3` 的 38%／46%／77% 均沒有可觀察到的淨增益。**不要再重做已經證實沒幫助的微幅 selector threshold 變動。**
- **極重要統計限制：** 32/32 保存的「當次實際 OCR 工作輸入影像」都是 0 張，使用保留的覆核影像回歸；可能存在同 Traveler 多張影像。這些是舊樣本回歸結果，**不是新上傳照片端到端辨識率**。完整的未公開影像、真實姓名、證件號碼都不應推送 GitHub。
- **固定 Test baseline `2026.10.09.1` 是資料與比較基準的凍結版本，與目前 OCR pipeline `2026.10.11.5` 不相同。** 不能拿 Test 反覆調參、改 split 或洩漏同人影像。
- **下一步唯一需要使用者操作的驗證：** 更新本機到最新 `main` 後，做**一次正式 auto Validation 32 張**，確認頁面版本 `2026.10.11.5`，比對護照是否保有 68%，以及台胞證中文姓名／性別／全對率是否高於 `2026.10.11.3`；同時觀察耗時。**尚未取得這輪結果，不能捏造。**
- 若 `.5` 仍無增益，**直接進行批次影像裁切／文字辨識來源的改善研究**，而非繼續一個一個增加匿名診斷、請使用者反覆執行 32 張。首要建立可按 Traveler 分組且合法保存真正 OCR 工作輸入的 Validation，釐清台胞證錯誤究竟在 detection、rec、crop、MRZ 或解析階段；保留既有正式結果及人工覆核、必須比較新增正確與退步案例。
- 使用者要求**快速提高實際準確率**：集中幾個有根據的修改 → 自動化正反案例與 CI → 一次 Validation 驗收 → 記錄實際數據；不要把影子推測百分比冒充正式提升。
- 業務不變：V2 是旅行社內部團別掃描、旅客／證件歷史及 CSV；不得自動 fallback 舊證件，不得因主檔更改連動改寫歷史團別 snapshot；已審核資料及照片保留另依 `DECISIONS.md`，不得以 OCR 為由擅自放寬期限。

**交接查閱：** [本頁](HANDOFF.md) → [每輪工作與實測](WORKLOG.md) → [OCR 深入紀錄](OCR_OPEN_SOURCE_REVIEW.md) → [正式決策](DECISIONS.md) → [架構](SYSTEM_ARCHITECTURE.md)／[資料模型](DATA_MODEL.md)／[本機啟動](DEVELOPMENT.md)。

> 這份文件是新對話、新開發者或 AI Agent 接手本 repository 時**優先閱讀**的入口，不應以聊天紀錄當唯一知識庫。
> 每次實質修改與實驗結束後更新本文與 `docs/WORKLOG.md`；在 CI 通過後提交 GitHub。請先核對 GitHub main 最新 SHA 和 CI，**不要把這份文件的 SHA 當永遠最新**。

## 接手時閱讀順序

1. 本文：現況、禁區、下一步與交接方法。
2. [工作與實驗紀錄](WORKLOG.md)：依日期追查做過什麼、是否有實測及結論。
3. [正式設計決策](DECISIONS.md)：核對已生效的決策，尤其 D-072、D-084。若文件有衝突，找出最新取代關係，不能自行猜測。
4. [資料模型](DATA_MODEL.md)、[系統架構](SYSTEM_ARCHITECTURE.md) 與 [開發／備份指引](DEVELOPMENT.md)。
5. OCR 問題另讀 [開源技術研究及真實測試](OCR_OPEN_SOURCE_REVIEW.md)、[OCR 需求](OCR_REQUIREMENTS.md)。

## 專案定位與不能重新設計的邊界

- GitHub：`YI-CHENLIN1204/passport-scanner-v2`。
- V2 是**旅行社內部的團別證件掃描、旅客資料建立／審核與 CSV 匯出工具**。不是 ERP、CRM、旅客自助端。V3/V4 才討論自助、伺服器常駐及進一步一鍵化。
- 流程：建團 → 設定證件 → 批次上傳 → **瀏覽器端 OCR** → 自動歸組／人工合併 → 人工審核 → Traveler / DocumentVersion / TourMemberDocument → CSV。
- 團別使用的證件資料與全域主檔、歷史證件版本彼此獨立。已審核 ScanItem 不接受一般刪除；**不能自動 fallback 舊證件**。更正／撤銷正式資料需要另外設計可追溯流程，不可暗中改寫別團歷史。
- 結構化資料的保留與圖片生命週期不同；production 原圖仍按原定回國日 + 7 天清理，不能為了 AI 訓練默默放寬期限。
- 旅客證件圖片、未匿名化測試結果與私人 Dataset **不得放進 GitHub 或傳第三方線上 Demo**。

## 歷史 OCR 現況（截至 2026-10-10；最新以頂端狀態為準）

- 已使用 **PaddleOCR.js + PP-OCRv5** 瀏覽器端 SDK，搭配本地 MRZ / parser、角度／裁切及人名候選邏輯；請先閱讀原碼，**不要重新引入另一套 PaddleOCR**。
- **當時的正式 OCR pipeline** 為 `2026.10.09.1`；目前正式版本見本文頂端。固定 Test split / baseline 仍不可反覆調參。只可在 Train/Validation 做候選實驗，通過既定 gate 才討論修改正式版。
- 現有 32 張 Validation：護照 19、台胞證 13、身分證 0；**32/32 沒有保存當次真正 OCR 工作輸入圖**，改用當時保留的審核影像，因此只能用來做 legacy regression，不能稱作端到端上傳準確率。
- 使用者同機實測：正式 auto 護照 Median 1.4s／整張 37%，台胞證 1.0s／38%；單執行緒 WASM direct 護照 7.9s／37%，台胞證 5.9s／31%；WASM Worker 護照 8.9s／37%，台胞證 5.8s／31%。皆完成 32/32。單次小樣本，不能宣稱統計顯著差異。
- 正式 auto 在該次 Chrome 測試的 detProvider 與 recProvider **均為 webgpu**。這是測得的裝置／session 狀態，不代表所有環境均如此。
- Worker 曾因未部署相容的 `ort-wasm-simd-threaded.jsep.mjs` 而初始化在 0/32 失敗；PR #7 同步配送 ORT `.mjs` + `.wasm` 及加測 MIME / 同源資產，後續 32 張 Worker 測試成功。**不要再重做這條排錯路徑**。
- 護照中文姓名 7/19 exact，另外 12 張舊分類為「正確但未選中 7、有錯誤候選 5、無候選 0」。但舊分類把 raw OCR **包含**正確姓名片段當作完整候選。PR #9 已修改 Validation 診斷為五個互斥分類（完整候選、完整原始行、僅片段、候選不符、無候選），新版五分類已實測：7 張為完整候選吻合、0 張原始行吻合、0 張僅字串包含、5 張候選不符、0 張無候選。尚不能直接斷言 7 張皆能靠 selector 修好；需分析位置、score、拼音與 threshold。
- 台胞證正式 auto 中文姓名 46%，性別 77%；尚不能只靠改門檻解決。
- **目前不導入 Worker 至正式掃描**，因這批實測沒有看到它相對同 WASM direct 的效能優勢；正式 OCR 流程未被這些 Validation-only 工具變更。

## 歷史待辦（2026-10-10；已被頂端最新待辦取代）

1. **已取得新版五分類 Validation 實測**（正式 auto：完整候選 7、候選不符 5）。PR #12 shadow selector 已本機實測：護照 7 張完整正確候選全部分類 romanization-conflict。PR #14 拼音子類診斷已合併且使用者本機實測：完整候選遭拒的 7 張全屬 one-syllable-mismatch。PR #16 的匿名單音節 shadow 已合併；PR #17 官方拼音 shadow 已合併：護照相對舊正式版潛在改善 6/19、退步 0，單音節放寬則 7/19、退步 0，皆為裁切近似比較。新分支 feat/guarded-boca-name-suggestion-v2 將唯一且高信心的官方拼音候選作為待人工審核建議，正式 pipeline 版本擬升至 2026.10.11.1；需要真正 Validation 證實，不能直接宣稱 68% 正確率。
2. 針對分類結果，必要時設計**不影響正式輸出**的 shadow selector A/B。不可只看到正確字串就自動採用；須保留位置、羅馬拼音與人工覆核規則。
3. 陸續累積合法、人工確認且保存當次 OCR 工作影像的 Validation，按 Traveler 分組避免資料洩漏。身分證 Validation 目前沒有代表性。
4. V2 尚待獨立設計正式已審核資料的撤銷／更正審計流程；不要把 fallback 或「刪除」當成更正。
5. 若 CI / 本地與本文敘述不一致，**以實際 main 原碼及測試為依據更新文件**，並註明查證時間，不能靜默改歷史結論。

## 不走回頭路：每輪工作必須遵守

1. **先讀文件 + 檢查 main SHA、近期 commit、CI、相關現有函式**；已有實作與已否定方案先列出，不再做一遍。
2. 修改在分支／PR 進行；需區分**想法、正在實驗、已實作、CI 已驗證、使用者本機實測、正式採用、已否定**，不能混成同一狀態。
3. 每一項變更至少留下：日期、目的與觀察、文件／程式路徑、PR / commit、驗證方式與結果、殘留風險、下一步。數據寫樣本數、分組、測試裝置與限制；不能憑印象填寫。
4. 更動架構與業務行為同步記錄在 `DECISIONS.md`；OCR 研究／失敗原因記在 `OCR_OPEN_SOURCE_REVIEW.md`；**所有輪次的摘要記在 `WORKLOG.md` 並維護本文當前狀態**。
5. 只寫 repository 內可公開且不包含旅客個資的記錄；不要提交原圖、掃描結果、姓名、證號、私密 Dataset、金鑰或資料庫 dump。
6. 檢查相關 CI，標示精確 run number；如果 CI 未完成，明寫 `pending`，不能聲稱成功。必要時使用 PR、等待綠燈後再合併。
7. 結束對話前附上可點開的 GitHub 文件與 PR / SHA；下一次接手**從這裡繼續，而不是從聊天推回所有決策**。

## 快速交接啟動指令（給下一個開發者 / Agent）

「請先讀 `docs/HANDOFF.md`、`docs/WORKLOG.md`、`docs/DECISIONS.md` 與 `docs/OCR_OPEN_SOURCE_REVIEW.md`，再查 GitHub `main` 最新 commit 與 CI。不要重做已完成的 OCR Worker 問題或改固定 Test baseline。依工作紀錄未完成事項繼續；每輪變更更新文件、開 PR、跑 CI 後再合併。」

### 2026-10-11 最新交接指標（覆蓋舊的待驗證敘述）

- PR #18 `2026.10.11.1` **已由使用者本機實測正式 OCR**：護照 13/19（68%），從舊版 7/19（37%）增加 6 張；其他欄位 100%。之前提到的「68% 尚未證實」已由本次 legacy Validation 證實，但不代表新照片端到端效能。
- 台胞證仍為 5/13 整張全對、6/13 中文姓名、10/13 性別；新分支 `feat/permit-conservative-name-sex-evidence` 修復保守姓名／性別 evidence precedence，擬更新 OCR pipeline 至 `2026.10.11.2`；需 CI 和本機測試後才確認效果。
- 所有 32 張皆無原始 OCR 工作輸入圖；Test baseline `2026.10.09.1` 不做調參，新正式 pipeline 目前 `2026.10.11.1`，不得混淆。
- 下一步：確認台胞證修正 CI，集中跑一次 Validation，比對是否有淨改善；避免每個小變動重新要求用戶測試。

### 2026-10-11 04:32 回歸：台胞證改善未達成

- 正式 OCR `2026.10.11.2`：護照 13/19 68% 持平；台胞證 5/13 38% 全對、6/13 46% 中文姓名、10/13 77% 性別，與前版**完全持平**。PR #19 的保守條件修正未在這組 Legacy Validation 顯示改善。
- 新開發分支 `feat/permit-name-uncertainty-retry`（版本預計 `2026.10.11.3`）將原本「僅空白才重辨識」擴展為低信心非空白姓名的受限雙裁切重試，並在同一次 Validation 加入匿名簡繁字形可能相當的計數。
- **未取得新的實測改善數字**。下一步 CI 成功後，只需單次 Validation 核對效能及姓名／性別的精準度。固定 Test 不動，32/32 實際工作影像仍缺失。

### 2026-10-11 05:02 — OCR 2026.10.11.3 沒有實測增益

- 正式 auto/WebGPU Validation 32/32：護照 13/19（68%）持平；台胞證 5/13（38%）全對、中文姓名 6/13（46%）、性別 10/13（77%）皆持平；可能僅簡繁字形差異的姓名 0 張。
- PR #20 受限低信心雙裁切重試**已實測但零改善**，不再把它當有效改善方案。所有 32 張缺原始當次 OCR 工作圖，固定 Test baseline 不動。
- 讀原碼確認 `taiwanPermitMrz.ts` composite 檢查**沒有驗證性別字元或中文姓名 GBK 區**。新分支 `feat/permit-mrz-field-evidence-safety`，OCR 候選版本 `2026.10.11.4`，正在調整 MRZ 與視覺 OCR 證據的信任順序，待 CI、真實 Validation 才知有無精準率提升。勿宣稱已改善。


### 2026-10-11 — 台胞證下一輪合併驗收

- PR #21（MRZ 姓名／性別未受檢查碼涵蓋的信任問題）CI #800 Success，已合併 main；候選 `2026.10.11.4` 尚未經本機 Validation。
- 分支 `fix/permit-name-crop-label-first` 將姓名重試的 ROI 錨點從「優先 Latin」改為「優先明確姓名標籤」，預計版本 `2026.10.11.5`，待 CI／合併；兩個改動合併後**只需一次**本機正式 auto Validation，驗證台胞證中文姓名、性別、全對率、執行時間與護照回歸是否退步。
- 若仍 46%／77% 不變，停止再改候選門檻，直接評估圖像輸入、真實 crop 錯誤資料及不同中文字形辨識模型；不得以推測取代精確的 sample 診斷。
