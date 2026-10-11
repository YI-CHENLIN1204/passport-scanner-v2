# 工作紀錄（append-only 摘要）

> 每輪新增一段，**不要覆寫舊紀錄**。若後來推翻舊結論，新增更正並連到舊條目。詳細設計見 [DECISIONS.md](DECISIONS.md)；交接入口見 [HANDOFF.md](HANDOFF.md)。

## 每輪紀錄模板

```md
### YYYY-MM-DD — 工作主題
- 狀態：提案 / 實驗 / 已實作 / CI 通過 / 本機已測 / 正式採用 / 未採用
- 目的 / 問題：
- 之前已知結論（避免重做）：
- 變更範圍（程式與文件）：
- PR / commit：
- 驗證：CI run、人工測試（樣本、環境、限制）
- 結果與沒做的事：
- 殘留問題 / 下個行動：
```

## 2026-10-10 — 建立永久交接規範（本輪）

- 狀態：文件流程建立中（以 PR / CI 為準）。
- 目的：把歷史研究、決策、失敗原因、實測數據與下一步固定存進 GitHub，後續換對話／電腦／Agent 不重新走回頭路。
- 變更：新增 `docs/HANDOFF.md`、`docs/WORKLOG.md`；更新 `docs/PROJECT_CONTEXT.md` 的導航。
- 已知事實：正式 OCR `2026.10.09.1` 未動；最近一次主要程式變動為 PR #9 的 Validation 姓名分類診斷；PR #9 CI #771 通過、main 合併後 CI #772 通過。
- 待完成：把本輪 PR / commit 與 CI 加回本條目（下一次修改時）；往後每輪執行 template，並確保狀態真實。
- 下一步：正式 auto Validation 五分類；按結果再決定是否進行 shadow selector 實驗。

## 2026-10-10 — 迄今 OCR 實驗結果索引（歷史摘要）

- PR #3：新增只讀 Validation Profiler；不可修改固定 Test；CI #753 通過。
- PR #4：隔離的 WASM direct / Worker 實驗，並保留 production auto；CI #762 通過。
- PR #5：避免把舊成功卡片誤當新一輪完成；加入欄位 exact rate；CI #763 通過。
- PR #6：修復初始化例外被吞掉、無法診斷 Worker 0/32；CI #765 通過。
- PR #7：修正 ORT `.mjs` loader 漏部署，並測 Vite / nginx 同源資源；CI #767 通過；本機後續 Worker 32/32 成功。
- PR #8：加入實際 provider（本機正式 auto 偵測與辨識皆為 WebGPU）與匿名護照姓名錯誤診斷；CI #769 通過。
- PR #9：將「完整候選吻合」和「僅 OCR 長行包含姓名」拆開；CI #771、main #772 通過。**尚待新五分類結果**。
- 一次 Validation 實測（護照 19、台胞證 13、無身分證）：正式 auto 護照 1.4 秒、37%，台胞證 1.0 秒、38%；WASM direct 7.9 秒、37% / 5.9 秒、31%；Worker 8.9 秒、37% / 5.8 秒、31%。各模式 32/32 成功，原 OCR 工作輸入影像 0/32。詳細 caveat 見 [OCR_OPEN_SOURCE_REVIEW.md](OCR_OPEN_SOURCE_REVIEW.md)。
- 決策：目前保留 WebGPU auto 為正式路線、**不正式導入 Worker**；精準度重點先看中文姓名，而不是重造 OCR 引擎。

## 2026-10-10 — 正式證件歷史獨立／禁止 fallback（歷史摘要）

- PR #1：已審核紀錄不能以一般刪除流程刪除，不依掃描順序回退舊證件；對應 D-084，取代舊 fallback 行為。CI #747 通過。
- 記住：`Traveler`（目前人物主檔）、`DocumentVersion`（新舊證件歷史）和 `TourMemberDocument`（某團當時用的證件與 snapshot）必須分清。更正某團資料應另設明確、可審計流程。

## 2026-10-11 — 正式 auto Validation 五分類結果

- 狀態：使用者本機已測；原因定位仍在研究；**尚無正式 OCR 選擇器改動**。
- 測試：32/32 完成，護照 19、台胞證 13；det/rec provider 都是 WebGPU；護照完整正確 37%、台胞證 38%；護照中文姓名失敗 12 張，分類：**完整候選吻合 7、原始行吻合 0、僅子字串 0、候選不符 5、無候選 0**。
- 關鍵發現：7 張已有完整正確文字，但不確定為何沒有成為正式輸出。這不等於可藉調整 selector 完成 7 張修復；需要 eligibility / score / phonetic trace。
- 限制：32/32 沒有實際 OCR 工作圖，使用保存審核影像代替；不代表端到端辨識率。
- 原碼核對：`frontend/src/services/paddleOcr.ts` 的 `chooseTaiwanChineseName()` 有位置、Romanization compatibility、confidence 與 rank 相關條件。
- 決策：先做不改輸出的 shadow selector 診斷，不改 OCR baseline、不放寬正式 threshold。
- 參考：`docs/OCR_OPEN_SOURCE_REVIEW.md` 2026-10-11 節。

## 2026-10-11 — Validation shadow selector decision trace

- 狀態：實驗性診斷程式，PR #12 CI #777 已通過；仍待使用者本機 Validation 實測；**正式 OCR 選擇器輸出不變**。
- 緣由：護照中文姓名錯誤 12 張中 7 張有完整候選。還不知道卡在幾何 anchor、MRZ romanization、分數、unknown 門檻，或較高排名候選。
- 變更：在既有 `chooseTaiwanChineseName()` 增加可選的匿名候選決策回報；Validation 比對人工答案後，僅儲存原因分類並顯示聚合張數。未觸發的預設流程不改回傳值。
- 限制：OCR 可能執行多次 crop／orientation；候選出現於一輪不代表該輪是正式最終來源。分類為近似診斷，不能當成已修復張數。原工作圖仍 0/32，不能外推端到端準確率。
- 下一步：跑正式 auto Validation 觀察各分類；確認是否值得另做 shadow selector 候選 A/B，不直接修改正式輸出。

## 2026-10-11 — Shadow selector 首次實測：7/7 romanization-conflict

- 狀態：使用者本機實測；已核對程式；尚未改正式 OCR。
- 實測：正式 auto，WebGPU detection/recognition；護照 n=19、台胞證 n=13，32/32 完成，0 失敗。護照整張正確率 37%；中文姓名錯誤 12，完整正確候選 7，其 shadow trace 皆歸入 `romanization-conflict`；另 5 張候選不符合，未提供更詳細 trace。
- 現行程式：`frontend/src/services/nameRomanization.ts` 用 `pinyin-pro` 多音字與部分台灣拼音別名比對 MRZ 音節；漢字數與 MRZ token 數不符直接 `conflict`；音節數相等且除一字外幾乎相符也判 `conflict`；其餘可能 `unknown`。在 `chooseTaiwanChineseName()` 中 `conflict` 候選會被排除。
- 未證實：7 張是否因未涵蓋慣用譯名／舊拼法、多音字、OCR 誤字、MRZ token 化或候選幾何造成衝突。不能將 7/7 解讀為放寬拼音後必然修好 7 張。
- 下一步：Validation-only 匿名 trace 區分音節數不符／單一音節不符／其他；影子比較保留原決策，衡量可能增益及既有正確樣本回歸，不直接修改 production selector。
- 限制：32/32 缺少當次 OCR 工作圖，只適合 legacy regression；Test baseline `2026.10.09.1` 不動。

## 2026-10-11 — 只讀 romanization conflict 子類型診斷

- 狀態：實驗分支，待 CI 與使用者本機 Validation 驗證。正式 OCR 未變。
- 範圍：`nameRomanization.ts` 增加只讀 `classifyRomanizationConflict()`，沿用正式 comparator 的相同逐字拼音別名／token 分段邏輯，僅將已判定 conflict 的候選標記為 token-count-mismatch、one-syllable-mismatch、other-mismatch 或 unclassified。
- `paddleOcr.ts` 只在已存在的 shadow decision observer 回傳匿名 subtype；`OcrQualityPage.vue` 聚合數量，**不記錄任何姓名、MRZ token 或每張 OCR 結果**。
- 舊 7/7 皆為 romanization-conflict，細分類仍待本機實測。多 crop 下同張採一個排序後代表原因，並不等於該原因唯一發生。
- 固定 Test baseline `2026.10.09.1` 不動；不改正式候選核准規則。

## 2026-10-11 — 實測：七張完整姓名候選皆為單音節衝突

- 狀態：使用者本機 Validation 截圖確認。PR #14 已合併，程式版本 `2026.10.09.1` 未變。
- 正式 auto（WebGPU det/rec），Validation 完成 32/32、失敗 0：護照 19 張、台胞證 13 張、身分證 0 張。護照整張與中文姓名 exact 均 37%；台胞證整張 38%，中文姓名 46%。
- 護照 12 張中文姓名錯誤中 7 張存在完整正確 OCR 候選、5 張為錯誤候選；7 張都在 shadow trace 顯示 `romanization:one-syllable-mismatch`，而非 token 數不符。這只是 OCR 候選／拼音驗證追蹤，不是修好 7 張的證據。
- 缺陷限制：32/32 缺少保存當時 OCR 工作輸入圖，使用審核影像回歸；7 張可能包含同一 Traveler 的不同照片，不可推為七個獨立人名。
- 直接可疑的判斷規則：`nameRomanization.ts` 對中文字與 MRZ token 數相同，若剛好一字音節不符合現有拼音別名，認定 `conflict`。實測尚未說明是未涵蓋台式慣用譯音、異體字／多音字還是正確的阻擋。
- 下一步：先做 Validation-only、匿名的 shadow「一音節差異候選」的保守反事實評估，衡量有機會救回的案例與原本正確姓名會被誤選的風險；先不放寬 production romanization gate，亦不靠 Test 調參。

## 2026-10-11 — 單音節衝突 shadow 反事實實驗

- 狀態：研究分支；**正式 OCR 候選輸出不改**；需 CI 及本機 Validation 實測。
- 既有 selector 原樣運作；只在診斷 observer 計算允許一音節衝突的候選，且把衝突視作未獲拼音核准，保留較嚴格的 unknown confidence/rank gate，不加 compatible 權重。
- Validation 只留匿名彙總：潛在改善、潛在退步、維持正確、維持錯誤。這是已走到的 crop/方向的近似反事實觀察，不是完整第二套 OCR 流程，也不能當作正式改版門檻。
- 本資料集 32/32 缺少當年確切 OCR 工作圖；須按 Traveler 檢查重複樣本，固定 Test baseline `2026.10.09.1` 不動。

## 2026-10-11 — 加速策略：一次比較正式／外交部拼音／單音節放寬

- 目標：停止每新增一個小分類就要求使用者重跑 32 張；同一次 Validation 計算多個 shadow 候選模式的聚合改善／退步，並自動在 CI 執行合成正負案例測試。
- 官方依據：領事事務局《護照外文姓名拼音對照表》 https://www.boca.gov.tw/cp-2-4226-c0eff-1.html，涵蓋 WG、國語注音第二式、通用及漢語拼音；官方亦說明不強制限於這些拼音 https://www.boca.gov.tw/cp-35-7873-3a928-1.html。
- 新增 `frontend/src/services/officialRomanizationVariants.ts`：來源核對的**部分**官方音節異寫表，非完整表，也不涵蓋各族語／個人選用拼法。新增 `compareChineseNameToMrzWithOfficialVariants` 僅供 shadow；原 `compareChineseNameToMrzRomanization` 保持原核准規則。
- 與 PR #16 的「單音節衝突放寬 shadow」一起計算。兩者均保留原本 candidate geometry、confidence 與 rank 限制；官方音節完全吻合才視為 compatible，未吻合仍不放行。
- `frontend/scripts/test-romanization.mjs` 使用實際 TS 程式在 CI 測合成正反案例，防止改壞正式拼音判斷；測試只涵蓋示例拼法，不代表真實證件辨識率。
- Validation UI 只顯示兩種策略各自的潛在改善、退步與維持不變張數，不儲存人名或原始 OCR。仍是同一次現有 crop 的近似反事實，非完整重新跑另一套 OCR、不是正式導入決策。
- 既有 32 張皆缺乏當次確切 OCR 工作圖，且可能有重複 Traveler；最終應以不同 Traveler、不同證件類別與後續保存完整輸入的 Validation 作審慎評估。
- 本輪 PR/CI：待本分支驗證後補充；正式 OCR pipeline `2026.10.09.1` 與 fixed Test 沒有改動。

## 2026-10-11 — 受限官方拼音候選導入（待真人 Validation 驗證）

- 實測來源：32 張舊 Validation 的正式姓名正確 7/19；官方拼音 shadow 潛在改善 6、退步 0（模擬結果 13/19），單音節放寬潛在改善 7、退步 0（模擬 14/19）。**兩者都不是已實現的正式 OCR 精準率**，因先前的 shadow 只參考已執行 crop，且全部缺少保存當次 OCR 工作圖。
- 為加快實際修復，新增 `officialNameSuggestion.ts` 的嚴格回填：只有現有選擇器原本要留空、OCR 候選已有原本姓名位置或明確姓名標籤資格、有效 MRZ、候選與官方拼音異寫完整相符、OCR score >= 0.78 且只有一種**不同候選字串**符合條件時，才填入待人工審核的中文姓名。不會覆寫既有成功候選；若候選競爭或證據不足則保持留空。
- 這是產生**人工覆核建議**，不改動人工已審核旅客、DocumentVersion、歷史團別紀錄或後端驗證；每位旅客仍需要審核。**不以一個音節任意不符作為核准**。
- 正式 pipeline 字串更新為 `2026.10.11.1`，原固定 Test baseline `2026.10.09.1` 仍保留且禁止反覆調參；CI 的合成案例只驗證決策條件，不能代表照片辨識率。
- 下一步：在新版本下跑一次同批 Validation，觀察中文姓名實際輸出（不只影子候選）；比對是否如預期提升且不降低其他欄位。需逐 Traveler 與包含完整 OCR 工作輸入的新 Validation 共同查核後，才宣稱泛化改善。

## 2026-10-11 — OCR 新版首次實際回歸：護照 37% → 68%；台胞證下一批改善

- 狀態：**使用者本機已實測**護照正式 OCR `2026.10.11.1`，此批台胞證修正僅在開發分支，仍待 CI 與本機 Validation。
- 實測：正式 auto，偵測／辨識均為 WebGPU；Validation 32/32 完成、0 失敗。護照 19 張整張及中文姓名 13/19（68%），相對舊版 7/19（37%）**實際 +6 張／+31 百分點**；其餘驗證必要欄位 100%。護照中文姓名錯誤尚有 6：完整正確候選未選 1、其他候選不符 5；官方 shadow 此次潛在改善 0，維持正確 13、錯誤 6；單音節 shadow 亦顯示潛在改善 1、退步 0、維持正確 13、錯誤 5（這是 proxy，不代表應放寬）。
- 同次台胞證 13 張：整張全對 5/13（38%）、中文姓名 6/13（46%）、性別 10/13（77%）、出生日期／證號／效期均 100%。舊的台胞證邏輯在 `paddleOcr.ts` 只要有任何英文姓名候選，即使位置與中文姓名不相鄰而且沒通過交叉核驗，亦可能抑制強的「姓名」標籤候選；未驗證的 MRZ 性別也可能直接優先於高信心的正面欄位證據。
- 修正：`permitFieldEvidence.ts` 只允許**無相鄰英文姓名**且 OCR score >=0.82 的標籤姓名恢復；有附近英文姓名發生拼音衝突仍拒絕。不覆蓋已取得的強拼音姓名。未驗證 MRZ 性別只有在正面標籤與 row semantic 一致且 score >=0.80 時才可改選正面；驗證有效 MRZ 優先。忽略明顯不像中文姓名的 GBK MRZ 解碼結果。
- CI 增加 13 個不含個資的合成回歸案例；此批尚無真實 Validation 證據，不得宣稱台胞證精準度已提升。
- 重大限制：上述 32 張當時 OCR 工作圖保存仍 0/32，只是 legacy regression，未包含身分證，且可能同一旅客多張影像；正式照片／團別歷史保留與禁止 fallback 規則不變。
- 下一個檢查：CI 成功後，**只做一次**新的正式 auto Validation，核對台胞證中文姓名、性別及整張全對率有無改善或退步。固定 Test baseline 不反覆調參。

## 2026-10-11 — 正式 OCR 2026.10.11.2 台胞證零增益；集中處理低信心姓名

- **已本機實測**：正式 auto（偵測／辨識 webgpu）、Validation 32/32 完成、失敗 0；護照 19 張整張全對 13/19（68%），其他欄位 100%；台胞證 13 張整張全對 5/13（38%），中文姓名 6/13（46%），性別 10/13（77%），生日／證號／期限 100%。
- 與上一版 2026.10.11.1 相較，台胞證中文姓名、性別及整張全對率**全部未改善**。先前 PR #19 的「無關英文遮蔽標籤」「MRZ 性別與正面證據優先」兩種假設沒有得到改善證據；**不再反覆放寬同一條門檻**。
- 新一輪候選版本 2026.10.11.3（**實作待 CI/本機回歸**）：原程式 `retryPermitChineseName` 只在姓名全空白時觸發，而錯誤但非空白的 OCR 姓名不會重試。新增對未經 validated MRZ 支持且信心 <0.90 的非空白姓名做原有姓名區域裁切重辨識，保留 9 秒 soft budget。若原本有姓名，新候選需兩個不同裁切視角一致、score >=0.86、合併 confidence >=0.92，且原先 confidence <0.88，才能取代審核前 OCR 建議；否則保留舊值。這些候選不會自動核准、也不碰團別／已審核資料。
- 同一次 Validation 新增**聚合**「姓名 exact 不同、但簡繁映射可能相同」張數（簡繁字形是一對多映射，**不視為 exact 正確**），區分腳本差異與實際辨識錯誤。此分析不保存姓名、證件號碼或影像，不碰固定 Test baseline。
- 擴增到 24 個合成姓名／性別／重試門檻自動化測試；**CI 成功仍不代表有實測精準度增益**。下一步僅進行一次完整 32 張 Validation，檢查姓名、性別、速度、整張正確率，避免每輪碎片測試。

## 2026-10-11 05:02 — OCR 2026.10.11.3 經 Validation 無改善；檢查 MRZ 覆蓋範圍

- 使用者本機正式 auto/WebGPU Validation 32/32 完成，失敗 0。護照 13/19 全對（68%）；台胞證 5/13 全對（38%），中文姓名 6/13（46%）、性別 10/13（77%），其餘生日／號碼／效期 100%。與 2026.10.11.2 相比沒有改善；簡繁字形可能相當但 exact 不同的姓名 **0 張**。
- 2026.10.11.3 的低信心非空白姓名雙裁切重試並未在這個 Legacy cohort 帶來可量測淨增益。不得將重試實作視為精準率改善；本輪不再針對同一門檻做小修。
- **程式層證實的驗證缺口**：`taiwanPermitMrz.ts` 的檢查碼只覆蓋證號、發證次數、日期及 composite 指定切片；line1[22] 的性別字元以及 line2[0..15] 的 GBK 中文姓名編碼不在目前 composite 計算內。因此 requiredValid=true 並不代表姓名與性別已經過檢查碼驗證。先前 `paddleOcr.ts` 與 `permitFieldEvidence.ts` 把 requiredValid 當成欄位本身可靠的優先序，存在概念錯誤。
- 新候選 2026.10.11.4：僅在正面標籤性別與 row semantic 完全一致、OCR score >=0.90 時允許覆蓋不同的 MRZ 性別；其他仍優先 MRZ。中文姓名若 row name 與 label name 相同、row 拼音相容且 label score >=0.88，可覆蓋不一致的 MRZ GBK 解碼；否則保留原值。沒有獨立證據支持的 MRZ 姓名 confidence 降為 0.86，可參與既有低信心局部覆核，但仍需兩次裁切相同且高分才取代。這些只是未審核 OCR 建議，不改資料庫與歷史證件。
- 這些選擇條件是否能修好本批 7 張姓名錯誤及 3 張性別錯誤**尚未經 Validation 證明**。本批全部 32 張仍無保存原始 OCR 工作輸入圖，不能推斷新照片端到端精準度。固定 Test baseline 2026.10.09.1 不動。
- CI 改寫既有合成測試，加上錯誤 MRZ 性別／GBK 姓名衝突正反案例；下一次只需一輪正式 auto Validation 評估性別、姓名、整張及延遲有無淨改善。

## 2026-10-11 — 合併批次：台胞證裁切改以明確中文姓名標籤優先

- 當次已有 MRZ 未驗證姓名／性別信任順序修正 PR #21，CI #800 成功並合併 main；正式辨識率待本機確認。
- 檢查 `createPermitNameGroupCrop()` 發現：OCR 同時辨識出英文與「姓名」標籤時，舊程式無條件先選最高分 Latin anchor，可能裁到無關英文欄位，讓姓名重辨識徒勞。現改為**優先裁切明確姓名標籤**，找不到才選 Latin anchor，保持原裁切邊界、縮放與 OCR 模型不變。
- 配合前一批 MRZ cross-check 一起驗收，OCR version `2026.10.11.5`。此為程式碼靜態發現，**未證實這是 7 張姓名錯誤根因、也未驗證新照片準確率**。不改 fixed Test／歷史資料／保存政策；只改人工審核前姓名局部重辨識來源。

## 2026-10-11 05:22 — 對話交接封存；確認 main .5 與最後實測 .3 差異

- **狀態：** 交接文件整理；未在本輪新增 OCR 程式邏輯；GitHub main 驗證成功，但最新 OCR 準確率仍有待使用者實測。
- GitHub `main` 核對：`78251c2d2e32317018e5069126e0fde54d789c69`，最新正式 OCR 程式版本 `2026.10.11.5`。PR #21（MRZ GBK 姓名／性別信任與正面 OCR 交叉核對）已合併，CI #801 Success；PR #22（姓名重試 crop 優先「姓名」標籤）已合併，CI #803 Success。這是編譯及自動測試成功，**不是本機照片準確率改善的證明**。
- **最後一輪使用者實測：`2026.10.11.3`，2026-10-11 05:02**，正式 auto/WebGPU；32/32 完成、失敗 0。護照中文姓名與整張全對 13/19（68%），其餘必要欄位 100%；台胞證整張 5/13（38%）、中文姓名 6/13（46%）、性別 10/13（77%），出生日期／證號／有效期限 100%。姓名簡繁字形等價但 exact 不同 0 張。身分證 0 張。
- 歷史決策：護照 `2026.10.09.1` 7/19 → `2026.10.11.1` 13/19 已證實；`2026.10.11.2` 和 `.3` 的台胞證均無可量測淨改善。避免重複做同一種微調；`2026.10.11.4`／`.5` 尚未有 Validation 數字。
- **限制：** 32/32 無當時真正 OCR 工作輸入圖；為 Legacy Validation，不是新照片端到端準確率；可能同一位旅客多照片。固定 Test baseline `2026.10.09.1` 不改不重複調參；不提交個資及影像。
- **下一步：** 新對話先讀 `docs/HANDOFF.md` 頂端，查 `main` 與 CI；只請使用者測**一次** `.5` 正式 auto Validation 32 張，確認新結果。若台胞證仍 38%／46%／77%，直接批次研究影像前處理、姓名 ROI、OCR 候選原始品質與 MRZ，而非再逐項加入小診斷；使用者偏好快速向前推進。

## 2026-10-11 13:56 — 新對話可直接承接的完整交接整理

- 狀態：**文件整理，無 OCR 程式變更，不宣稱辨識率提升。**
- 起點：`main` = `745280ab3f67c9aa4a5ea355a03f1c3c7e83be90`、CI #805 Success；PR #23 先前已將 `.5` 未實測、`.3` 最後實測清楚分開。這輪為 `docs/HANDOFF.md` 最上方新增可複製的新聊天啟動指令並同步最新 SHA。
- 最後使用者 Validation：`2026.10.11.3` 正式 auto/WebGPU，護照 13/19 全對（68%）、台胞證 5/13（38%）、台胞證中文姓名 6/13（46%）、性別 10/13（77%）；32/32 成功，0 失敗，簡繁字形可能等價但 exact 不符 0 張。這批 32 張全部缺少當次真實 OCR 工作圖，僅可當 legacy regression。
- 已合併但**尚未**實測：`2026.10.11.5` 含 PR #21（MRZ 姓名／性別證據交叉比對）和 PR #22（姓名標籤裁切優先），相關 CI 綠燈並非準確率提升。
- 待新對話執行：首先請使用者一次執行 `.5` Validation，核對護照保持 68%、台胞證是否超過 38%／46%／77%、延遲及回歸。若無改善，集中研究台胞證真實 OCR 工作影像、ROI／Detection／Recognition，並改善資料集，而非重複小幅 selector threshold 試錯。
- 續作規範：只從 GitHub 最新檔案與程式驗證現況；遵守 fixed Test `2026.10.09.1`、人工覆核、歷史證件獨立與無 fallback、個資不上 GitHub。每輪更新 HANDOFF / WORKLOG / OCR 研究及必要的決策文件，且區別已實作、CI 通過和本機驗證。

## 2026-10-11 — 正式 auto/WebGPU OCR .5 實測：PR #21 / #22 在 Legacy Validation 沒有淨增益

- 狀態：**使用者本機實測**，OCR pipeline `2026.10.11.5`；來源：2026-10-11 使用者提供的 OCR 品質頁截圖（頁面顯示上次完成 2026/10/11 15:03；本段紀錄時間以畫面為準），並非 CI 或推測。
- 32/32 完成、0 失敗、預熱約 0.8 秒；實際 runtime: detection WebGPU、recognition WebGPU，SDK backend auto。
- 護照 Validation n=19：整張全對 13/19 = 68%、中文姓名 13/19 = 68%，英文姓名、生日、性別、國籍、證號、簽發國、效期皆 100%。OCR median 2.1 秒、P90 4.5 秒；呼叫總耗時 median 2.1 秒、P90 9.4 秒。
- 台胞證 Validation n=13：整張全對 5/13 = 38%、中文姓名 6/13 = 46%、性別 10/13 = 77%，生日、證號、效期皆 100%；簡繁字形可能相當但 exact 不同的中文姓名 0 張。OCR median 3.4 秒、P90 6.8 秒；呼叫總耗時 median 4.9 秒、P90 7.5 秒。影像擷取 median 0.0 秒；方向重試 15%。
- 與 `2026.10.11.3` 的同批 legacy Validation 相比：護照與台胞證整張及各欄位 exact 比率全部持平。**PR #21（未受 checksum 驗證的 MRZ 欄位交叉證據）與 PR #22（姓名標籤優先 crop）在此 cohort 未帶來可測淨改善**；並不代表程式修正沒有安全意義，也不能推斷單張案例沒有互相抵消。
- 統計限制：護照 19/19、台胞證 13/13 均無當次真實 OCR 工作輸入影像，使用保存的審核影像做 legacy regression；可能同 Traveler 多張；台灣身分證 Validation n=0。不可外推到新照片端到端辨識率或人群泛化。
- 下一步：**停止反覆小幅調 selector / MRZ threshold**；先針對台胞證未正確的 7/13 姓名與 3/13 性別，在合法且本機保存的真正工作輸入、影像變換、OCR boxes、來源 ROI 上作錯誤歸因，集中改良 orientation、detection、recognition 或 crop 並以合成正反案例 CI＋一次 Validation 比對。固定 Test `2026.10.09.1` 不動，production 原圖仍回國日 +7 天，私有影像與個資不上 GitHub。追蹤：Issue #25。

## 2026-10-11 — 選中台胞證 OCR 影像與覆核旋轉不一致：修正候選來源（候選 .6）

- 狀態：已實作於 `fix/permit-selected-image-consistency`；CI 待確認，本機照片精準率未驗證。
- 原因：台胞證 deskew 的新 `reviewImage` 即使品質比較不通過，仍直接作覆核圖與 `rotationDegrees`，而姓名重讀及欄位內容保留來自舊 `best.image` / `best.prediction`。這是程式靜態可確定的「輸出與覆核影像來源不一致」；不應藉此宣稱已修好中文姓名錯誤。
- 修改：僅在 deskew 品質分數不低於舊候選時替換 `best`，所有情況在候選選定後才從 `best.image` / `best.rotation` 給覆核圖與角度；維持既有矯正、重辨識、MRZ/姓名候選及人工覆核政策。版本預計 `2026.10.11.6`。
- 自動防退步：`frontend/scripts/test-permit-image-consistency.mjs` 監控 production function 的選中來源與資料流（結構性測試，非實際影像準確率測試）；新增 `npm run test:permit-image` 到 CI。
- 下一步：CI 成功後核對選中影像與結果一致；繼續做真實 OCR 工作圖 / ROI 歸因，整批完成後才一次 Validation，勿再逐小修請使用者重跑 32 張。固定 Test 不動、私人資料不上 GitHub。

## 2026-10-11 — 台胞證匿名 OCR 原始文字列分類（候選，未實測）

在 Validation 內針對台胞證姓名錯誤，比對選中 OCR 的 rawRows 後只保存三種分類計數：`exact-raw-row`、`embedded-in-raw-row`、`not-in-selected-raw-rows`。僅瞬間在本機記憶體處理姓名，報告不含真值、OCR 文字、ID、逐張結果與影像。合成測試檢查分類及匿名輸出並接入 CI。這只能指出最終 OCR 文字列是否包含姓名，**不能確定 Detection/Recognition/ROI 的根因**，也無法補回缺失的 OCR 工作輸入圖。尚無本機 Validation 或精準率提升證據。保留固定 Test、人工覆核與影像政策；下一步做真實工作圖來源／ROI 分析並整批驗收。

## 2026-10-11 — 使用者本機 OCR .6 Legacy Validation 回歸（截圖）

- 狀態：**已本機實測**，正式 auto，偵測／文字辨識 WebGPU；OCR pipeline `2026.10.11.6`。32/32 完成、0 失敗，預熱約 1.2 秒。這並非尚在 PR #29 的 `.7`。
- 護照 Validation 19 張，整張及中文姓名 68%（13/19），其餘已比較必要欄位 100%；OCR median 1.1 秒 / P90 2.2 秒。
- 台胞證 Validation 13 張，整張 38%（5/13）、中文姓名 46%（6/13）、性別 77%（10/13）；生日、證件號及效期 100%；OCR median 1.1 秒 / P90 2.7 秒。
- PR #28 的匿名原始文字列分類首次觀察：7 張中文姓名錯誤之中，完整原始列吻合 0、嵌於較長文字列 0、選中 OCR 文字列未出現完整姓名 7。這不能證明 detection / recognition 的根因，因為分類只讀取最終選中的 `rawRows`，可能存在其他未選中的候選。
- 32/32 缺當次真正 OCR 工作圖，這是保留審核圖片的 legacy regression，不代表新上傳端到端品質；可能存在同一 Traveler 多圖；身分證 n=0。
- `.6` 與 `.5` 的評估準確率持平，計時差異不能歸因於修正；`.7` ROI 座標來源修正仍在 PR #29、尚無實測。使用者本機 PowerShell `npm.ps1` 被 ExecutionPolicy 阻擋，且已處於 `frontend` 無需重複 `cd frontend`；採 `npm.cmd` 執行本機檢查，GitHub Actions 維持關閉。

## 2026-10-11 — OCR .7 ROI 修正本機測試

使用者於 PR #29 分支本機執行 `npm.cmd run test:permit-roi` 與 `npm.cmd run build` 均成功。PR #29 文件與 main 產生合併衝突，已由最新 main 建立本整合分支保留測試過的程式修改。修正台胞證 OCR crop prediction 座標與姓名 retry 所用影像來源不一致；`predictionImage` 維持相同座標系，人工覆核仍用完整圖。**僅代表測試守衛及建置成功，未有 .7 照片 Validation，不能宣稱精準率提升。** Actions 停用，固定 Test 不動。

## 2026-10-11 — 候選 .8：台胞證姓名二次裁切標籤信任順序（未實測）

程式檢查發現：目前 `createPermitNameGroupCrop()` 同時將「姓名」及 `Name` 放在同一組 label anchors，以 confidence 排序，會讓較高分的英文 Name 標籤擠掉真實中文字樣。候選版 `.8` 只改 **name retry ROI anchor**：先找中文「姓名」，缺失才用英文 Name，仍找不到才以拉丁姓名為錨點。保留 .7 的 `predictionImage` 同座標來源、既有姓名共識檢查與人工審核；不改固定 Test、照片保留或旅客正式資料。加入 `npm.cmd run test:permit-name-roi` 的結構性來源防退步測試，但 GitHub Actions 額度保護仍有效且不會觸發。**這是推定具風險的選錨行為修正，沒有真實影像驗證，不能宣稱準確率提升或新版本成功。** 待本機 test + build 後才合併，之後與其他有效批次一次 Validation。仍優先取得真正工作影像與 Detection/Recognition 的可用證據。

## 2026-10-11 — PR #31 品質加固：姓名 ROI 錨點純函式與實際合成測試

將台胞證 ROI 錨點選擇抽出成 `frontend/src/services/permitNameCropAnchor.ts`，讓 `createPermitNameGroupCrop` 使用同一實作，不再僅以程式原始文字比對作測試。`test-permit-name-roi-priority.mjs` 使用 TypeScript transpile 後直接測試：中文標籤優先英文標籤、中文標籤信心排序、英文 fallback、Latin fallback、非姓名欄位拒絕、無欄位時 null。只影響姓名重辨識裁切錨點，不觸及正式欄位審核。**尚未完成使用者本機測試／真實照片 Validation；準確率不作提升宣稱。** Actions 維持手動觸發且不執行；合併前請本機一次跑 `npm.cmd run test:permit-name-roi`、`npm.cmd run test:permit-roi`、`npm.cmd run test:permit-evidence`、`npm.cmd run build`。如全部通過才合併 PR #31。

## 2026-10-11 — 台胞證 OCR 匿名來源統計（待本機驗證）

延續 `.8` 主線，只增加 Validation 的可觀察性，不更改 OCR 判斷／模型／輸出或版本號。利用現有 `distanceCropUsed`、`chineseNamePasses`、`chineseNameConsensus`、`mrzUsed`，在每張 Evaluation 的記憶體內做匿名彙總，僅報告「選用放大距離裁切」「姓名重讀候選已採用」「雙區域一致候選」「MRZ 提供過欄位」四項件數。程式抽出 `permitSourceEvidence.ts`，新增 synthetic `test:permit-source` 驗證計數與無個資輸出。與既有「7 張姓名錯誤未在選中 rawRows 中出現」分類搭配，僅可縮小研究範圍；**不能確定 Detection/Recognition 因果，也沒有修正 OCR 精準率**。沒有個人名字、原始 OCR 文字、sample ID、工作影像或逐張資料保存到結果或 GitHub。

GitHub Actions 因額度限制維持 `workflow_dispatch` 且不得執行。此批在 GitHub Connector 完成原始碼和文檔更新，尚無本機 Build／照片 Validation 證據；等本批整理完成再讓使用者一次執行。正式 `.8` 與最後實際 `.6` 精準度請區分；fixed Test 不變。

## 2026-10-11 — main 直接開發：台胞證姓名重讀影像清晰度（OCR 2026.10.11.9；待驗證）

依單人 main-first 決策，不再為每個小改動開 PR。將 `retryPermitChineseName` 中原使用 `createRelativeCrop(image, .08, .06, .84, .72)` 的廣域姓名二次 OCR，改為相同來源範圍、`createPixelCrop(..., 1500)`：較小影像不再因通用裁切縮至原寬，而能有限度提升漢字 OCR 輸入寬度；沿用共用裁切 1800px 上限。原照片及主要 OCR 管線均未改；無網路 OCR、無影像持久化。新增 `npm.cmd run test:permit-broad-crop` 原始碼守衛；需要搭配本機 Build 與後續 Validation 實測，**尚不能宣稱準確率提升**，也不保證放大一定有效，可能使運算時間增加。

這個 main 修改目前未含 PR #33 的診斷功能，PR #33 仍在獨立舊分支上且尚未本機測試；不能直接假設 PR 已併入或在未檢查衝突前合併。後續應先驗證 main .9，統一收束 PR #33，避免重複小 PR。GitHub Actions 僅 workflow_dispatch，禁用雲端執行。最後實際照片準確率仍 .6，凍結 fixed Test 不變。

## 2026-10-11 main OCR .9 第二批：限制小圖片不合理放大（未本機驗證）

延續 main 的姓名重讀 ROI 改動，`createPixelCrop` 由一律填補到至少 1200/1500px 改成最多放大 2.5 倍、整體 1800px 上限：例如 300px 裁切最多 750px，600px 可到 1500px，避免低解析裁切被過度插值、大型 Canvas 占用瀏覽器資源。新增 `test:permit-broad-crop` 的邊界案例。此函式也用於其他姓名 crop，故須整批執行既有測試及 Build，並在正式照片 Validation 檢查準確率和時間是否退步。**沒有實測證據，不宣稱提升**。GitHub Actions 禁止執行，PR #33 仍獨立待本機測試與合併。後續盡量維持 main，勿再為每個小修改建立 PR。

## 2026-10-11 main OCR .9 裁切防退步修正（待一次集中本機驗證）

在 `createPixelCrop` 讀取 bitmap 後先將 x/y 限制於有效畫素起點 `0..width-1` / `0..height-1`，防止來源 OCR anchor 略為超出影像邊界，導致無效 Canvas 來源裁切。修正 `test:permit-broad-crop` 新腳本最初不正確的雙重 regex escape，現在以來源守衛檢查邊界、2.5x 上限、1800px 上限與廣域重讀流程；**測試尚未在用戶 Windows 本機真正執行**。這是健全性修正，非實測辨識準確率提升。沿用 main-first，不新增 PR，不跑 GitHub Actions。舊 PR #33 尚未合併，須後續成批處理且不能直接覆蓋 main .9。


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
- `npm.cmd run test:ocr-regression` 可一次執行全部 OCR regression scripts；另需 `npm.cmd run build`。
- 已用 GitHub 端靜態檢查確認 `.10` 版本、bounded upscale、ROI clamp、enhancement、time budget、independent consensus、Validation wrong-name wiring 均存在；**GitHub Connector 不能代替本機 Node/Vite 執行**。
- GitHub Actions 仍僅 `workflow_dispatch`，本批沒有啟動 Actions。

### 驗證標準

最後有照片實測證據的仍是 `.6`：護照全欄 13/19、台胞證全欄 5/13；台胞證中文姓名 6/13。`.10` 尚未照片驗證，絕不可先宣稱提升。下一次應只做一次集中驗證：本機 regression + build 通過後，再跑既有 32 張 auto Validation，比較 `.10` 對 `.6` 的淨改善、退步及耗時。固定 Test 不變，不把 Test 圖加入 Train。


### `.10` 單一驗證入口

新增 `npm.cmd run verify:ocr`，一次串接完整 OCR regression 與 `npm run build`，避免使用者逐條重複執行。此命令尚待使用者 Windows 本機執行；GitHub Actions 不啟動。


## 2026-10-11 — `.10` 本機程式驗證已通過；Docker 舊前端造成 Validation 仍顯示 `.6`

使用者於 Windows `main` 執行 `npm.cmd run verify:ocr`，畫面確認完整 OCR regression 全部通過，包含 8 個 romanization cases、6 個 review suggestion checks、35 個 permit field/MRZ/retry guards、selected-image/rotation、raw-row bucket、ROI coordinate source、Chinese label anchor、anonymous source evidence、broad-name crop、name enhancement、retry detection、independent-region evidence；其後 `vue-tsc --noEmit && vite build` 成功，Vite 共轉換 106 modules。黃色 externalized module/chunk size 訊息為 warning，不是 build failure。

同一輪瀏覽器 Validation 畫面底部仍顯示 `版本 2026.10.11.6`，且結果與舊基準完全相同（護照全欄 68%、台胞證全欄 38%、台胞證中文姓名 46%）。這**不是 `.10` 的照片實測結果**。專案的日常整合環境由 Docker `frontend` Nginx 提供；直接在 host 執行 `npm run build` 只更新 host `frontend/dist`，不會把既有 container 中 `/usr/share/nginx/html` 的舊 bundle 換掉。要驗證新 main，需在 repo 根目錄重建並 recreate frontend container，例如：`docker compose up -d --no-deps --build frontend`，再瀏覽器強制重新整理。不要執行 `docker compose down -v`。

因此最後有效照片準確率仍是 `.6`，`.10` 目前只有程式 regression/build 證據；待 Docker frontend 更新後才跑一次固定 32 張 auto Validation。

### Validation 舊版本防誤判

Validation 歷史結果若 `pipelineVersion !== OCR_PIPELINE_VERSION`，頁面現在會直接警告「這是舊 OCR 版本結果」，並顯示目前頁面 pipeline 版本。目的在避免 host 已更新、Docker frontend 仍舊 bundle 時，把 `.6` 歷史結果誤認為 `.10` 新實測。此 UI 改動將由下一次 `docker compose up -d --no-deps --build frontend` 內的 Docker `npm run build` 一併驗證。


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


## 2026-10-11 — `.11` 實測無準確率改善；main 已進入 `.12` Latin-name anchor 修正

使用者在 Docker frontend 顯示 `目前頁面 OCR pipeline: 2026.10.11.11` 後完成正式 auto Validation。32/32 成功；護照維持全欄 68%（13/19）、中文姓名 68%、其餘欄位 100%。台胞證仍為全欄 31%（4/13）、中文姓名 38%（5/13）、性別 77%、出生日期／證件號碼／有效期限 100%。因此 `.11` 的 all-raw-row selector 在現有樣本上沒有帶來正確率提升。

`.11` 診斷進一步確認：8 張錯誤姓名仍有 8/8 完整 ground-truth 姓名存在 raw row；retry 由 `.10` 的 24 次降至 16 次，16/16 有文字框、只有 1 次有合格候選，且「姓名重讀實際覆寫」為 0。故 `.10`/`.11` 的姓名錯誤不是 retry 覆寫造成；問題仍是 raw-row candidate 沒有取得足夠 anchor evidence。

### `.12` 直接根因修正

程式檢查發現 `extractPermitLatinName()` 把 `NAME` 列為 stop word。台胞證 OCR 若把印刷標籤與英文姓名合併成 `Name LIN YI CHEN`，舊 parser 會整列拒絕，導致 `.11` 的 raw-row selector 沒有 Romanization anchor；即使正確中文姓名已在 raw row，仍可能只得到 `unknown` 並因離姓名 label 太遠而被排除。

`.12` 將英文姓名 parser 抽成 `permitLatinName.ts`：只移除**開頭**的 `Name` 標籤，再套原有 stop-word 與格式檢查；`NAME` 出現在其他位置仍會拒絕。新增功能測試涵蓋 `Name LIN YI CHEN`、`NAME CHEN, YI-CHEN`、無標籤姓名與 SEX/TAIWAN/單 token 負例。

同批加入匿名 raw-row selector 診斷：Latin row 件數、姓名 label row 件數、是否存在 romanization-compatible candidate、最後選到 compatible/unknown/none 的件數。只保存彙總，不保存姓名、raw row、sample ID 或圖片。新增 `test:permit-raw-name-diagnostics` 並納入 `verify:ocr`。

pipeline metadata 已更新為 `2026.10.11.12`。`.12` 尚未本機 regression/build 與照片 Validation，不能宣稱提升。下一個唯一驗證點：`npm.cmd run verify:ocr` → rebuild frontend container → 確認頁面 `.12` → 同一組 32 張 auto Validation。GitHub Actions 仍禁止執行。


## 2026-10-11 — `.12` 本機驗證被 Latin-name regex 語法錯誤阻擋，已直接修復

使用者執行 `npm.cmd run verify:ocr` 時 Node/TypeScript 在 `src/services/permitLatinName.ts(33,20)` 報 `TS1517: Range out of order in character class`，同時 Node 顯示 `SyntaxError: Invalid regular expression: /[^A-Z,- ]/g`；Docker frontend rebuild 也在 `npm run build` 同樣失敗。這代表 `.12` 尚未進入 OCR Validation，不能把任何舊頁面結果當成 `.12`。

根因是從 GitHub 端新增 parser 時正則跳脫遺失：`/[^A-Z,\- ]/g` 被寫成非法的 `/[^A-Z,- ]/g`，且 whitespace normalization 的 `/\s+/g` 也被誤寫成 `/s+/g`。已在 main 修正兩處並重新核對 `permitLatinName.ts` 實際內容：字元類別中的 hyphen 已 escape、whitespace regex 已恢復。GitHub Actions 未執行。

下一步只需重新 `git pull origin main` 後跑既有 `npm.cmd run verify:ocr`；若通過，再 rebuild frontend container 並進行 `.12` Validation。不要重複修改 OCR 邏輯，先確認此語法修復。


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


## 2026-10-12 — `.15` 首次取得明確實質提升；BOCA 官方拼音路徑有效

使用者完成 `2026.10.11.15` 正式 auto Validation，32/32 成功。護照維持：全欄 68%（13/19）、中文姓名 68%、其餘評估欄位 100%。台胞證明顯提升：全欄 **54%（7/13）**，中文姓名 **69%（9/13）**，出生日期 100%、性別 77%、證件號碼 100%、有效期限 100%。相較 `.14` / `.6`：台胞證全欄由 4/13 / 5/13 提升到 7/13；中文姓名由 5/13 / 6/13 提升到 9/13。

`.15` raw-row selector 診斷顯示 BOCA 官方／舊式拼音 promotion 是有效來源：有 official-variant promotion candidate 4 張，最終實際選到 official-variant candidate 4 張；最終 compatible 共 9 張，unknown 0 張，raw-row none 4 張。這與中文姓名 9/13 正確率一致，說明此次增益直接來自 Romanization gating 修正，而不是影像 retry 或 row-distance fallback。

剩餘 conflict subtype 匿名樣本數：token-count mismatch 6、one-syllable mismatch 2、other 0、unclassified 0。這些是樣本是否出現該類 conflict candidate 的匿名計數，可重疊，不等於 8 張唯一錯誤樣本。下一步應針對剩餘 4 張姓名錯誤，先處理 **token-count mismatch** 與 **one-syllable mismatch** 的可安全自動判斷，不再回到 row-index distance fallback。

`.15` 已證明：標準 romanization + BOCA 官方拼音別名 + all-raw-row selector 是目前有效方向。任何後續修改都必須維持護照 13/19、不降低台胞證現有 9/13 中文姓名，並保留固定 Validation 比較。
