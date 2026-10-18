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


## 2026-10-12 — `.16` 再次實質提升；main 下一步聚焦唯一 one-syllable mismatch

使用者完成 `2026.10.11.16` 正式 auto Validation，32/32 成功。護照維持：全欄 68%（13/19）、中文姓名 68%、其餘評估欄位 100%。台胞證再提升：全欄 **69%（9/13）**，中文姓名 **85%（11/13）**；出生日期 100%、性別 77%、證件號碼 100%、有效期限 100%。相較 `.15`，台胞證全欄 7/13→9/13，中文姓名 9/13→11/13；護照無退步。

`.16` joined-token Romanization 路徑已被實測證明有效：有 exact joined-token promotion candidate 2 張，最終實際選中 2 張；BOCA official promotion 仍維持 4 張、實際選中 4 張。最終 compatible 共 11 張，unknown 0，raw-row none 2。這與中文姓名 11/13 正確率一致。

剩餘 conflict subtype 匿名樣本數：token-count mismatch 5、one-syllable mismatch 2、other 0、unclassified 0。這些計數可重疊；但只剩 2 張最終沒有 raw-row 姓名，而既有 ground-truth 對照顯示這 2 張中文姓名錯誤樣本的正確姓名 **2/2 仍完整存在 raw row**。下一步應只針對最保守的 one-syllable 唯一候選條件，不再放寬 token segmentation、row distance 或任意 fuzzy spelling。

`.16` 已成為目前最佳基準：護照全欄 13/19；台胞證全欄 9/13、中文姓名 11/13。任何後續版本必須至少維持此基準。


## 2026-10-12 — `.17` 候選完成：只處理唯一 short/exact one-syllable mismatch

在 `.16` 已達到台胞證中文姓名 11/13、整張 9/13、護照 13/19 的目前最佳基準後，main 已完成 `.17` 候選。`.17` 不改 BOCA official promotion、不改 exact joined-token promotion、不恢復 row-distance fallback，也不做任意 fuzzy Romanization。

`.17` 唯一新增 production selector 規則：只有在沒有任何 compatible 或可接受 unknown candidate 時，收集所有 `compatibility=conflict` 且為 **2–4 個中文字、完整獨立 raw row** 的候選；若這類 short/exact conflict **恰好只有一個**，而且 subtype 正好是 `one-syllable-mismatch`，才回傳該候選並標記 `oneSyllableFallbackPromotion=true`。只要有第二個 short/exact conflict，或候選不是完整列、不是 2–4 字、不是 one-syllable mismatch，就不自動選。

此 fallback 保留 candidate 的 `compatibility='conflict'`，不假裝成 phonetic-compatible；因此 downstream confidence 仍是較保守的 row/conflict 路徑，人工審核語意不會被抬高。Validation 新增匿名指標：符合 one-syllable fallback 條件的樣本數、實際採用件數。

synthetic regression 已覆蓋：唯一 one-syllable 成功、非 exact 拒絕、5 字以上拒絕、存在第二個 short conflict 拒絕、compatible 優先、anchored unknown 優先、token-count conflict 不得誤採。版本 metadata 已更新為 `2026.10.11.17`。

`.17` 尚未在使用者 Windows 本機執行 `npm.cmd run verify:ocr`、Docker frontend rebuild 或 32 張 Validation，不能宣稱達到 13/13。GitHub Actions 仍 workflow_dispatch only，未執行。


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

## 2026-10-12 — `.20` focused sex retry 已完成 main 候選（待本機驗證）

main 已完成 `2026.10.11.20` 候選，但**目前最佳真實照片 Validation 仍是 `.19`**，尚不能宣稱台胞證已達 13/13。

`.20` 僅在最佳方向／deskew 選定後且 `best.result.sex === ''` 時執行一次 focused ROI OCR；已經有 sex 的 12 張不會增加額外 OCR。若原 OCR geometry 有 `Sex`／`性別` label，使用 label 周圍窄 ROI；只有完全沒有 label geometry 時才使用正面版面 center-right 的保守 fixed-layout ROI。每張 empty permit 最多只做 **1 次** sex retry，不會先 label retry 再 fixed retry。

retry parser 只接受 ROI 內 detection box 完整等於 `男`／`女`／`M`／`F`，或同列 `Sex M/F`、`性別男/女`。所有候選會合併做 distinct-value 檢查；若同一 ROI 同時出現 M/F（或男/女）衝突，保持 empty，不猜。

新增匿名 diagnostics：retry 啟動件數、label/fixed ROI 件數、有文字框件數、有候選件數、衝突件數、實際補值件數、retry 後仍 empty 件數。沒有保存姓名、證號、raw OCR 文字、sample id 或影像。

新增 `permitSexRetry.ts` 與 `test-permit-sex-retry.mjs`，並納入 `npm.cmd run verify:ocr`；既有 sex diagnostics regression 同步擴充。台胞證姓名 selector、BOCA official、joined-token、unique one-syllable 路徑完全未改；row-distance fallback、MRZ sex override 假設亦未恢復。

下一個驗證點只有一次：使用者本機 `npm.cmd run verify:ocr` → Docker frontend rebuild → 確認頁面 pipeline `2026.10.11.20` → 同一組 32 張正式 auto Validation。若台胞證達 13/13 全欄，下一主要工作再轉回護照中文姓名 13/19。

## 2026-10-12 — .20 正式 Validation：台胞證全欄 13/13

2026.10.11.20 固定 auto Validation 32/32 完成、失敗 0。護照全欄和中文姓名 13/19，其餘七欄 19/19；台胞證全欄、中文姓名、出生日期、性別、證件號碼、有效期限全部 13/13。相較 .19，台胞證性別與全欄各新增 1 張正確，護照未退步。Focused sex retry 匿名診斷：started 1、label ROI 1、fixed ROI 0、detected text 1、candidate 1、conflict 0、applied 1、still empty 0。standalone-token 仍補回 2 張，姓名 selector 維持 13/13。此為 legacy 固定照片 Validation，32 張皆缺當時 OCR 工作輸入圖，不代表對新照片泛化達 100%。正式最佳實測為 .20；下一主要目標護照中文姓名 13/19。禁止 GitHub Actions，保留成功台胞證路徑。

## 2026-10-12 — `.21` 護照中文姓名 broad VIZ 受限放大候選（待 Validation）

接續 `.20` 已實測護照中文姓名 13/19、台胞證 13/13；六張護照錯誤中五張的 OCR 候選內容不符，故聚焦 recognition 輸入解析度，不照搬台胞證 selector。

護照 `predictOne()` 原本在第一個 `name-field` anchored crop 無法選出姓名時，使用固定 (x=.24, y=.12, width=.74, height=.58) 的 broad VIZ `createRelativeCrop`。此路徑對低解析圖不做有限放大。候選 `2026.10.11.21` 僅將此 broad VIZ 改為相同範圍的 `createPixelCrop(...,1500)`，用既有 2.5x 放大及 1800px 最大寬度保護。保持原本兩次裁切 OCR 順序，不增加 inference 次數；`chooseTaiwanChineseName` 的標籤、拼音及信心規則完全未修改；護照 MRZ 與台胞證 BOCA / joined-token / unique one-syllable / standalone token / focused sex retry 均未改。

新增 `frontend/scripts/test-passport-viz-crop.mjs` 靜態防退步測試，加入 `verify:ocr`；既有來源版本守衛同步調整為 `.21`。**候選尚未完成本機測試和 32 張 Validation，不能宣稱準確率提升。** 最佳已實測仍為 `2026.10.11.20`（護照 13/19、台胞證 13/13）。下一步集中跑 Windows `npm.cmd run verify:ocr` + Docker frontend rebuild + 32 張固定 Validation，比對護照中文姓名與台胞證是否回歸。不得上傳個資或執行 GitHub Actions。

## 2026-10-12 — .21 正式 Validation：護照中文姓名 14/19（74%）

使用者已在 Windows 本機完成 pipeline 2026.10.11.21 固定 32 張 auto Validation，32/32 完成、失敗 0。護照全欄正確 14/19（74%），中文姓名 14/19（74%），英文姓名、出生日期、性別、國籍、證件號碼、簽發國、有效期限皆 19/19。相較 .20 的 13/19，護照全欄與中文姓名各新增 1 張正確；護照 OCR 中位數約 1.3 秒、P90 約 2.4 秒。剩 5 張護照中文姓名錯誤，候選文字完整吻合 1 張、其他候選內容不符 4 張、原始 OCR 行完整吻合 0 張、較長文字內出現姓名 0 張。外交通行的拼音 shadow 改善 0 張；one-syllable shadow 潛在改善 1 張，尚未採用為正式 selector。

台胞證整張全欄、中文姓名、出生日期、性別、證件號碼、有效期限仍全數 13/13（100%）；focused sex retry 啟動 1、label ROI 1、候選 1、實際補值 1、仍空白 0。台胞證 OCR 中位數約 0.5 秒、P90 約 2.8 秒。

結論：.21 broad VIZ bounded-upscale 有固定 legacy Validation 淨改善，列為目前最佳已實測 pipeline。繼續護照中文姓名 recognition / ROI 方向，但不能推定對新照片泛化改善，也不可直接依 shadow 提示自動放寬姓名 selector。全部 32 張仍缺原始 OCR 工作輸入影像。保留台胞證 BOCA、joined-token、unique one-syllable、standalone sex、focused retry 已成功路徑。禁止 GitHub Actions，不上傳個資。

## 2026-10-12 — .22 護照姓名兩個 ROI 的匿名失敗歸因（候選待驗證）

.21 真實固定 Validation 已證明護照中文姓名 14/19（74%）、台胞證 13/13（100%），剩下 5 張護照姓名錯誤，其中 4 張 OCR 產生其他候選但非正確姓名、1 張雖有完整候選卻未被選中。不能直接推定需要放寬 selector。

.22 只改善已有 OCR 輸出的診斷：Validation 對錯誤護照樣本分開計算 name-field 與 broad VIZ 各自是否有完整正確候選、錯誤候選、無候選或該 crop 未執行，另彙總兩區都只有錯誤候選和正確候選僅在 VIZ 出現的件數。此分類是匿名 aggregate，使用過程中可短暫比較本機 ground truth，結果物件只留分類，UI 不顯示姓名、樣本 ID、影像或 OCR raw text。加入 regression/source wiring test，納入 verify:ocr。

**.22 不變更護照或台胞證辨識算法，也不增加任何 OCR inference。最佳已證明準確率仍是 .21（護照 14/19、台胞證 13/13）。** .22 的目的在固定 Validation 上一次分辨 remaining 5 張的 crop 缺口，再選擇下一批能有實質提升假設的辨識改善。執行 Windows verify:ocr、Docker frontend rebuild、32 張固定 Validation 後回填匿名結果；不可將診斷數字說成 accuracy 改善。禁止 GitHub Actions。

## 2026-10-12 — .22 正式 Validation：護照 14/19、台胞證 13/13；裁切分區診斷

使用者本機完成 2026.10.11.22 固定 auto Validation，32/32 完成、0 失敗。護照中文姓名與整張全欄均 14/19（74%），其他七欄 19/19；台胞證全部五個必要欄位及整張 13/13（100%）。.22 沒修改辨識算法，準確率與 .21 持平。

**護照 5 張失敗的匿名分區診斷**：name-field 正確候選 1、其他候選 2、無候選 0、未執行 2；broad VIZ 正確候選 0、其他候選 2、無候選 0、未執行 3；兩區都只有錯誤候選 0、正確候選僅在 VIZ 出現 0。全局失敗分類：完整候選吻合 1、其他候選內容不符 4、完整 raw row 0、raw substring 0、無可用候選 0。這些是原有 crop 輸出的匿名診斷，尚不足以確定個別字元錯誤根因。

觀察：不能再盲目加寬 broad VIZ；其在剩餘錯誤樣本中沒有完整正確候選，而 name-field 至少有 1 個正確候選但 selector 未採用。下一步先檢查未執行 crop 為何缺席（包含其他旋轉嘗試與合併結果的診斷），以及現有正確候選為何被拒絕；仍須避免直接放寬拼音衝突條件。最佳已實測 pipeline 為 .22（辨識準確率與 .21 相同）。所有 32 張 legacy Validation 缺少真正 OCR 工作輸入，不代表真實新照片泛化準確率。禁止 GitHub Actions，不得提交證件影像、真實姓名或 OCR raw 個資。

## 2026-10-12 — .23 護照 unknown-name VIZ 確認候選（待本機 Validation）

正式已實測基準 .22：護照中文姓名 14/19、台胞證全欄 13/13。分區診斷指出剩餘 5 張錯誤：name-field 完整正確候選 1、錯誤候選 2、未執行 2；broad VIZ 正確候選 0、錯誤候選 2、未執行 3。.22 完整輸出未執行不一定是 detection failure：程式 `predictOne()` 在 name-field 找到任一合格姓名時即 break，即使 romanizationStatus=unknown 也阻止 broad VIZ 嘗試。

.23 最小保守修正：若 name-field 選到明確 compatible 姓名，維持既有立即採用且不增加 OCR；若只選到 unknown，先保留其內容及來源作為人工審核候選，繼續執行原本已存在的 broad VIZ OCR；只有第二次 VIZ 選到 **明確 compatible** 姓名才覆寫 provisional 值，若仍 unknown／無候選則維持第一個姓名，不猜、不放寬 romanization selector。如此僅可能增加原本因 unknown 提前停止的護照 VIZ OCR，不更動台胞證任何已驗證路徑。新增 `test-passport-unknown-viz.mjs` 靜態守衛並加入 `verify:ocr`，pipeline 候選更新為 2026.10.11.23。

**.23 尚未跑 Windows verify/build 或 32 張固定 auto Validation，不得宣稱精準率提升；正式最佳實測仍是 .22 的 14/19 與 13/13。** 待集中本機驗證後，將匿名結果寫回文件。所有 legacy 32 張缺少真正 OCR 工作輸入圖像，不代表對新照片的泛化準確率。GitHub Actions 禁止執行，真實證件照片、姓名、號碼、raw OCR 個資不可上傳 GitHub。

## 2026-10-12 — .23 正式 Validation：護照 14/19 持平，VIZ 出現新正確候選

使用者本機完成 pipeline 2026.10.11.23 固定 auto Validation：32/32 完成、失敗 0。護照全欄與中文姓名仍 14/19（74%），其餘七欄 19/19；台胞證所有必要欄位及整張 13/13（100%），無回歸。護照 OCR 中位數約 1.2 秒、P90 2.3 秒。

護照剩餘 5 張錯誤的匿名裁切分區診斷：name-field 正確候選 1、其他候選 2、無候選 0、未執行 2；broad VIZ 正確候選 1、其他候選 2、無候選 0、未執行 2。兩區都只有錯誤候選 0；「正確候選僅在 VIZ 出現」0。全局失敗分類完整正確候選 1、其他候選內容不符 4、raw 完整吻合 0、raw 子字串 0、無可用候選 0。比 .22，VIZ 正確候選 0→1、未執行 3→2，但護照整張仍 14/19，故 .23 只能視為證據覆蓋增加，不能宣稱準確率提高。

下一步應針對正確候選與最終選擇之落差補充匿名決策歸因，特別是不同 ROI 的 decisionTrace、當次候選是否被拼音衝突或 rank/confidence gate 擋住，以及選定 orientation/attempt 與來源不一致的可能性；不直接把 shadow one-syllable suggestion 自動採用。台胞證已成功 BOCA / joined-token / one-syllable / standalone / focused-sex 路徑凍結。32 張 legacy Validation 均缺當年 OCR 工作輸入，不能推論新照片 production 100%。不啟動 GitHub Actions、不提交個資。

## 2026-10-12 — .24 護照正確候選的來源／拒絕原因歸因（待本機驗證）

正式已實測基準 .23：護照全欄／中文姓名 14/19（74%）、台胞證全欄 13/13（100%），32/32 固定 auto Validation 成功。.23 的 ROI 診斷顯示剩餘五張護照中文姓名錯誤中，name-field 與 broad VIZ 各出現一張正確候選，但最終仍未正確；分區 overlap 不代表兩張獨立樣本。

.24 只對既有「完整正確候選」decisionTrace 附加來源 `name-field`／`viz-crop` 與匿名原因彙總，判別 `selected-other-attempt`、拼音衝突 subtype、無錨點、信心門檻、unknown threshold 或其他 reject；UI 僅顯示 aggregate 件數。不儲存姓名、證件號碼、raw OCR、檔名或逐張資料。新測試 `test-passport-exact-source.mjs` 已接入 `verify:ocr`，pipeline 版本候選 `2026.10.11.24`。護照 selector、裁切、OCR 次數、台胞證已達 13/13 的路徑全部未改。

**本版本只有匿名診斷，不能宣稱超越 14/19；尚須本機 npm.cmd run verify:ocr、Docker frontend rebuild、固定 32 張 Validation。** 待觀察確切來源與拒絕分類後，才考慮保守修正。legacy 32 張沒有真正 OCR 工作輸入，不能推論新照片泛化準確率；禁止 GitHub Actions、branch/PR 微改與個資上傳。

## 2026-10-12 — .24 正式 Validation：護照 14/19，唯一正確候選被 one-syllable mismatch 擋住

使用者在 Windows 本機完成 pipeline 2026.10.11.24 固定 auto Validation：32/32 完成、0 失敗；護照全欄及中文姓名 14/19（74%），其餘七欄 19/19；台胞證全部五欄及全欄 13/13（100%）。與 .23 持平，無回歸。

護照剩餘 5 張姓名錯誤的匿名診斷：完整正確候選 1、錯誤候選內容不符 4、沒有可用候選 0；name-field 正確候選 1、其他候選 2、未執行 2；broad VIZ 正確候選 1、其他候選 2、未執行 2。新來源／拒絕原因診斷確定：**name-field / romanization:one-syllable-mismatch = 1 張**。其他來源／拒絕原因沒有出現。這解釋一張正確姓名已在 OCR 候選但未採用；不能由此推論所有 one-syllable mismatch 都安全，因拼音同音或多套拼法可能把不同人名混淆。

下一步檢查一個可逆、嚴格受限的候選接納政策：只限同一 name-field 中唯一完整獨立漢字候選、存在明確姓名 label/英文錨點、無其他 conflicting 合格候選、且 subtype 僅是 one-syllable-mismatch；必須用 synthetic tests 防止模糊採用與既有正確結果被改寫。先用匿名 shadow 對照驗證淨改善及退步風險，不可直接依 ground truth 作選擇或上傳真實姓名／OCR 文字。最佳實測 pipeline .24 準確率仍為護照 14/19、台胞證 13/13；32 張均缺真實工作輸入影像，不能宣稱新照片泛化。禁止 GitHub Actions。

## 2026-10-12 — .25 護照 one-syllable mismatch 嚴格 shadow（待本機驗證）

基線：.24 32/32 固定 Validation 已完成，護照中文姓名 14/19、台胞證全欄 13/13。唯一「已 OCR 到正確姓名但未採用」的護照診斷是 `name-field / romanization:one-syllable-mismatch` 1 張；不能將所有一個音節差異視作可信。

候選 `2026.10.11.25` 實作獨立 `passportOneSyllableShadow.ts` 嚴格政策：不得覆蓋既有 accepted name，要求唯一不同姓名候選、所有候選 subtype 僅 one-syllable-mismatch、完整獨立漢字 OCR box、存在姓名 label 或 MRZ 英文姓名錨點、至少一個候選 score >= 0.78 且 rank >= 1.35。拒絕 ambiguous、wrong-subtype、not-standalone、unanchored、weak-evidence 與 existing-accepted。候選從現有護照姓名 selector 產生的決策資料進入 **read-only shadow**；Validation UI 只統計匿名 eligible/reject 原因及 shadow 相較正式輸出的 rescued/regressed/unchanged 件數，不存姓名、raw OCR、影像、sample id，也不修改正式姓名輸出。新增 synthetic `test-passport-one-syllable-shadow.mjs` 並納入 `verify:ocr`，同批版本 source guard 更新。

**尚未驗證 .25 真實照片或 Windows build；準確率不可宣稱提升，最佳已實測 .24：護照 14/19、台胞證 13/13。** 下一步集中本機 `npm.cmd run verify:ocr`、Docker frontend rebuild 及同一組 32 張 auto Validation；根據匿名 strict shadow 的 rescued/regressed/decision 件數決定是否值得下一輪受限正式採用。凍結台胞證 BOCA、joined-token、unique one-syllable、standalone sex、focused retry。禁止 GitHub Actions、不得上傳任何個資，legacy Validation 缺原始工作輸入影像。

## 2026-10-12 — .25 正式 Validation：嚴格 one-syllable shadow 未證實改善

使用者本機完成 pipeline 2026.10.11.25 的固定 32 張 auto Validation，32/32 完成、失敗 0。護照中文姓名及全欄 14/19（74%），其餘七欄 19/19；台胞證全欄及五個必要欄位 13/13（100%），與 .24 持平。護照 OCR 中位數約 1.2 秒、P90 約 2.3 秒。

新的嚴格 one-syllable shadow：潛在改善 0、潛在退步 0、維持正確 14、維持錯誤 5。匿名 eligibility 理由統計：existing-accepted 9、eligible 6、ambiguous 3、wrong-subtype 1。這些分類不等同於樣本正確率，eligible 6 並不代表六張能救回。原有單音節放寬 shadow（不同的較寬鬆反事實規則）仍顯示潛在改善 1、退步 0，但不能據此認定適合正式採用。

重要決策：.25 嚴格政策沒有展現淨改善，**不得直接採用為正式護照姓名 selector**；保留為只讀研究診斷。特別要先查證 shadow 對多裁切區域的合併順序、既有 accepted-name gate 與實際覆寫策略是否一致，不能再只憑 eligible 計數前進。唯一已完整辨識到的正確姓名候選仍是 name-field / romanization:one-syllable-mismatch，未改正式欄位。正式最佳實測準確率仍護照 14/19、台胞證 13/13。32 張 legacy Validation 均缺原始 OCR 工作輸入照片，不代表正式上傳新照片的準確率。禁止 GitHub Actions，不上傳敏感個資。

## 2026-10-12 — .26 護照 Shadow 最終決策模擬修正（待本機驗證）

.25 固定 Validation：護照全欄／中文姓名 14/19，台胞證全欄 13/13；嚴格單音節 shadow rescued 0、regressed 0、unchanged-correct 14、unchanged-wrong 5；eligible 6、existing-accepted 9、ambiguous 3、wrong-subtype 1。**eligible 非準確率，.25 不可直接提升成正式 selector。**

.26 將 read-only shadow 的不同 ROI 候選合併規則獨立為 `passportShadowMerge.ts`：只要正式姓名已存在，shadow 不能覆寫；無正式姓名且多 ROI 提出不同名字，視為 ambiguous 並拒絕；若所有 ROI 都一致且沒有正式姓名，才產生模擬候選；完全無候選則保留空值。這項修正用於避免舊的「拿第一個 shadow 名稱」模擬與實際策略不一致；**仍不將 shadow 寫進 production OCR 結果**，也不增加任何 OCR 呼叫。新增 `test-passport-shadow-merge.mjs`：synthetic 測試覆蓋已接受姓名保護、多 ROI 相同／不同、無候選及 null input，接入 `verify:ocr`，版本更新為 `2026.10.11.26`。

.26 尚未跑 Windows verify/build 或 32 張固定 Validation。正式最佳已實測準確率仍是護照 14/19、台胞證 13/13；Validation 只核對匿名最終 shadow 統計是否更可信，不能宣稱準確率提高。禁止 GitHub Actions、不新開 branch/PR、不提交真實證件照片或 OCR 個資。固定 legacy Validation 缺少 OCR 原始工作輸入影像。

## 2026-10-12 — .26 固定 Validation 實測

使用者完成 pipeline 2026.10.11.26 的固定 32 張 auto Validation，32/32 成功、失敗 0。護照中文姓名及整張全欄 14/19（74%），其他七欄 19/19；台胞證五項必要欄位與整張全欄 13/13（100%）。相較 .25 無改善亦無回歸。嚴格 one-syllable shadow：潛在改善 0、潛在退步 0、維持正確 14、維持錯誤 5；existing-accepted 9、eligible 6、ambiguous 3、wrong-subtype 1。這些 eligible 不是實際正確率，不得將 shadow 政策直接用於正式 selector。剩餘五張護照姓名錯誤：一張具有完整正確候選，被 name-field / romanization:one-syllable-mismatch 擋住；其餘四張沒有完整正確候選。下一步優先改善原有 OCR 文字辨識品質，不再只放寬 selector。此為缺原始 OCR 工作圖的 legacy Validation，不能代表新照片泛化。禁止 GitHub Actions，不上傳證件個資。

## 2026-10-12 — .27 護照 focused VIZ 候選（待本機驗證）

.26 正式固定 Validation 32/32 成功，護照姓名與全欄 14/19，台胞證全欄 13/13。剩下五張護照姓名錯誤中四張沒有完整正確 OCR 候選；.25/.26 嚴格 one-syllable shadow rescued 0，故不再放寬正式 selector。

候選 `2026.10.11.27` 新增護照 `focused-viz` 裁切，範圍沿用現有 broad VIZ 左上邊界 (x=24%、y=12%)、縮至寬 60%、高 34%，使用已有的 bounded `createPixelCrop(...,1500)`。僅在既有 `name-field`、`viz-crop` 都未得到明確 romanization compatible 姓名時，才額外做一次 focused ROI OCR；已有 compatible 的護照不增加 OCR 次數。新候選仍經過既有嚴格 `chooseTaiwanChineseName`，只允許明確 compatible 候選取代保留的 provisional 值；沒有 compatible 時維持原有姓名、不猜。台胞證所有 selector/sex retry 完全不動。Validation 增加 focused VIZ 的匿名 exact/other/none/not-run 數量；新增 synthetic source regression `test-passport-focused-viz.mjs` 並納入 `verify:ocr`。

**尚未跑本機 verify/build 或固定 32 張 Validation，不能宣稱任何改善**。正式最佳已實測仍是 .26 護照 14/19、台胞證 13/13；集中本機驗證後對照新增 focused ROI 命中與總準確率，不成功就不繼續盲目疊加 crop。全部 32 張為缺原始 OCR 工作圖的 legacy Validation，不代表新上傳照片泛化準確率。禁止 GitHub Actions、branch/PR 微改與任何真實證件／個資上傳。

## 2026-10-12 — .27 TypeScript build blocker 修復（等待本機驗證）

使用者 Docker frontend rebuild 在 `RUN npm run build` 因 TS2322 / TS2345 停止，原因是新增 `focused-viz` 後未同步擴充 `PaddleBaselineResult.chineseNameSource` 聯集，以及 Validation `aggregatePassportCropDiagnostics().count` 的 `focusedViz` key 聯集。已在 main 直接修復這兩處型別，並在 `test-passport-focused-viz.mjs` 加上 source guard。未改 OCR selector、裁切參數、任何台胞證路徑或 pipeline 版本（仍為 `2026.10.11.27`）。此為編譯 blocker 修復，尚未本機跑完整 `verify:ocr`／Docker rebuild／32 張 Validation；不得聲稱 build 已通過或精準率改善。上次 Docker build 失敗，未產生新的 frontend image。下一步集中本機驗證。禁止 GitHub Actions；不得提交證件個資。

## 2026-10-12 — .27 第二個 TypeScript build blocker

Windows Docker rebuild 仍因 TS2322 停在 `src/components/PaddleBaseline.vue(512,7)`；其實際型別來源是 `frontend/src/models/passportReview.ts` 中的 `PassportReviewOcrMetadata.chineseNameSource`，先前只允許 `name-field | viz-crop | null`，未包含 `focused-viz`。已擴充此共享 model 聯集，並將驗證守衛加到 `test-passport-focused-viz.mjs`。不需修改 Vue 元件、OCR 演算法或 pipeline 版號（維持 2026.10.11.27）。本次只是 TS 型別編譯修復，尚未在使用者 Windows 本機確認 build 成功，需先 `npm.cmd run verify:ocr`，成功後才 Docker rebuild 與固定 32 張 Validation。不得執行 GitHub Actions 或上傳證件個資。

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

## 2026-10-12 — .29 驗證持平；已啟動模型級 A/B 前置研究

使用者完成 `2026.10.11.29` 固定 32 張 auto Validation：護照中文姓名及整張全欄 **14/19（74%）**，台胞證全欄及必要欄位 **13/13（100%）**，完成 32 張、失敗 0。與 `.28` 持平，`.29` Canvas 高品質插值**沒有可見淨改善**，不得再以調 interpolation 設定作下一輪推進。

停止無效的 ROI/拼音規則/縮放小參數迴圈。新的主要技術方向為「保持現有 PP-OCRv5 mobile detection 與 parser/selector，另以 PP-OCRv5 server recognition 作 read-only A/B」，詳見 [OCR_MODEL_AB_PLAN.md](./OCR_MODEL_AB_PLAN.md)。官方 benchmark server-rec 繁體中文指標較高，但不證明台灣護照會更準；SDK 自訂模型須合法、相容的 uncompressed tar + inference.onnx + inference.yml。新增 `frontend/scripts/inspect-ocr-model-tar.mjs` 和合成 `test-ocr-model-tar-preflight.mjs`，後者接入 `verify:ocr`。

**尚未取得並驗證 browser-compatible server-rec ONNX tar，也尚未實作可執行的新模型推論 A/B；正式 pipeline 仍是 `.29`，不可現在要求使用者跑固定 32 張。** 模型資料與證件照片不得上傳 GitHub；GitHub Actions 禁止執行。固定 legacy Validation 缺當初真實 OCR 工作圖像，不可宣稱 production 泛化準確率。

## 2026-10-12 — 模型 A/B 準備重大更新：官方 server-rec ONNX 已找到

已在 PaddlePaddle 官方 Hugging Face 頁面找到 PP-OCRv5_server_rec_onnx，含 inference.onnx (約 84.5MB) 與 inference.yml，Apache-2.0。來源：https://huggingface.co/PaddlePaddle/PP-OCRv5_server_rec_onnx/tree/main。原先所稱「需要自行轉 ONNX」已不再成立。新增本地打包工具 frontend/scripts/package-ocr-server-model.mjs、synthetic regression test 與 verify:ocr 入口，能將本機下載的官方檔案串流封裝為 SDK 所需 uncompressed tar，並透過既有 inspector 驗證結構與 model_name。詳見 docs/OCR_MODEL_AB_PLAN.md。

正式 PP-OCRv5 mobile OCR pipeline 仍為 2026.10.11.29，已實測護照 14/19、台胞證 13/13。尚未真的下載、實際封裝或瀏覽器初始化 server-rec ONNX，也未做模型 A/B。接下來應完成候選模型相容性及隔離測試，再要求一次有意義的本機驗證。不得上傳模型二進位、任何真實證件影像或個資，不得執行 GitHub Actions。

## 2026-10-12 — 官方 Server Recognition 隔離合成圖啟動測試已建置

在官方 PaddlePaddle 發布的 PP-OCRv5_server_rec_onnx（約 84.5MB ONNX + inference.yml）基礎上，已新增一次性可選下載與 SHA256 校驗腳本、streaming tar 封裝工具及本機 manifest。執行 `cd frontend && npm.cmd run prepare:ocr-server-model` 可在本機下載及產生同源 /paddle-models/experiments/ 資產，二進位檔由 .gitignore 排除、不上傳 GitHub。候選模型來源、限制及精確步驟見 docs/OCR_MODEL_AB_PLAN.md。

OCR 品質頁面已新增完全隔離的「執行合成圖模型啟動測試」，呼叫獨立 PaddleOCR SDK instance、以 Canvas 自製假中文字測試圖驗證瀏覽器模型是否可初始化推論、結束後 dispose。此實驗僅操作者主動執行，不讀真實證件，不呼叫 production getPaddle，也不代表真實姓名準確率會改善。已新增 static/synthetic regression guard 並接入 verify:ocr。

目前候選尚未於使用者 Windows 實際下載或完成合成 smoke；原 production pipeline 2026.10.11.29 完全不變，正式最佳已實測護照 14/19、台胞證 13/13。下一驗收先看 npm.cmd run verify:ocr、Docker frontend rebuild、合成 smoke 是否成功，**不要求立即跑固定 32 張 Validation**。只有獨立模型可確定載入且比較設計完成，才進入真正 A/B。禁止 GitHub Actions；不得上傳模型二進位或護照個資。

## 2026-10-12 — Server Recognition 合成 smoke：WebGPU MaxPool ceil_mode 不支援，已加 WASM fallback

使用者在瀏覽器按「執行合成圖模型啟動測試」，顯示 `ceil_mode output-shape is computed, but ceil_mode kernel execution (padding) is not yet implemented in the WebGPU MaxPool kernel`。這表示隔離模型初始化／執行遇到 WebGPU ONNX Runtime kernel 不支援；**不是模型 A/B 準確率結果**。main 已在 `experimentalServerRecognition.ts` 增加限定此錯誤的 fallback：auto 失敗且吻合 WebGPU MaxPool ceil_mode 時，重新用獨立 WASM backend、單執行緒、`/ort-wasm/` 初始化並用同一張 Canvas 合成文字執行；每個成功建立的 instance 都在 finally dispose。其他錯誤不隱藏、不盲目 retry。UI 顯示實際 backend、fallback 與耗時，並新增 static regression guard。正式 production PP-OCRv5 mobile pipeline 2026.10.11.29 未改，尚未在使用者本機測試 WASM 成功。下一次只需 pull、verify、frontend Docker rebuild、按合成圖測試；**不要跑 32 張 Validation**。禁止 GitHub Actions、個資和模型二進位上傳。

## 2026-10-12 — Server-rec WASM fallback 未觸發的根因修復

使用者再次回報合成圖 smoke 仍顯示原始 `ceil_mode ... WebGPU MaxPool kernel` 錯誤。追查原始 `experimentalServerRecognition.ts` 發現上次 regex literal 寫成 `[\\s\\S]`（雙重反斜線），無法比對跨字元錯誤訊息，於是 auto/WebGPU 直接 throw，從未進入 WASM retry。現已改用 `message.includes('ceil_mode') && message.includes('WebGPU MaxPool')`，並在 regression 測試用使用者截圖的實際錯誤字串檢查；若 WASM 亦失敗，UI 現在會看到 `Auto/WebGPU ...；WASM fallback 亦失敗：...`，可辨別實際第二階段錯誤。正式 production OCR `.29` 完全不動，沒有讀證件、沒有更動 32 張 Validation。此修復尚待使用者本機編譯／合成圖 smoke 驗證；不得預先宣稱 WASM 已成功。

## 2026-10-12 — Server-rec 合成 WASM 執行成功，但原本 0 框統計讀錯 SDK 欄位

使用者最新合成圖 smoke 截圖顯示：WebGPU MaxPool ceil_mode 不支援後，WASM fallback **成功執行**，總耗時約 2963ms，但 UI 顯示辨識框數 0。檢查發現實驗程式原先讀 `rec_texts/texts`，而現行 PaddleOCR.js 在正式 `paddleOcr.ts` 中的實際使用方式是 `prediction.items`，故該 0 不可靠，不代表 Detection 失敗。已將隔離實驗改用 `prediction.items` 計算框數與擷取合成文字，UI 顯示實際 synthetic 文字（不含真實旅客資料），並補 regression guard。正式 production `.29` 不改；尚未確定合成字辨識正確，也沒有執行真實模型 A/B；下一步只需 pull、verify:ocr、frontend Docker rebuild、重新按合成圖測試，不要再跑 32 張 Validation。禁止 GitHub Actions 與個資上傳。

## 2026-10-12 — 官方 Server Recognition 合成圖實測成功

使用者本機 OCR 品質頁的隔離合成圖測試顯示：PP-OCRv5 server-rec ONNX 使用 WASM fallback 執行成功，辨識框 1，輸入合成文字「中文姓名 測試甲乙」與 OCR 輸出完全相符，總耗時 3552ms。WebGPU 仍因 MaxPool ceil_mode 不相容，使用 WASM。這證實候選模型在目前 SDK／瀏覽器至少能辨識合成中文文字，**不代表真實護照 A/B 的精準率改善**。

下一階段應在 Validation-only、匿名且 read-only 條件下建立 Mobile 與 Server 模型對照，隔離新模型 SDK instance、保持正式護照與台胞證 OCR 不變；記錄 exact-name、rescue/regression、P50/P90 及失敗原因。正式 pipeline 仍 2026.10.11.29，最佳已實測護照 14/19、台胞證 13/13；不得因合成測試成功就宣稱護照突破 74%。禁止 GitHub Actions，不上傳真實資料。

## 2026-10-12 — Server Recognition WASM 合成測試成功，隔離 Validation A/B 候選已建置

使用者瀏覽器已確認：官方 PP-OCRv5 Server Recognition ONNX 在 WebGPU MaxPool ceil_mode 不支援後切換 WASM，成功辨識 1 個合成文字框；輸入「中文姓名 測試甲乙」、輸出完全相同，總耗時 3552ms。此為 SDK / 合成圖相容性成功，不代表護照準確率已改善。

main 接續新增 `createServerRecognitionValidationInstance()`，由 `frontend/src/services/experimentalServerRecognition.ts` 建立獨立 WASM recognition candidate；OCR 品質頁新增「執行護照 Validation 模型 A/B」手動按鈕。只讀取 Validation 分組中的 PASSPORT，對同張影像分別透過現行 `recognizePassportWithPaddle` 及注入候選 instance 的同一護照解析函式運作，匿名統計 Mobile/Server 中文姓名正確、救回、退步、失敗及雙次推論 P50/P90。未進行個別結果持久化，未讀 Test 分組，不更改正式 Mobile pipeline；候選 instance 結束時 dispose，允許安全停止後續樣本。增加 `test-server-recognition-ab.mjs` 靜態守衛並納入 `verify:ocr`。

**本次 A/B 程式碼已提交，但未在使用者 Windows 完整 build 或實際 Validation 跑過**。先執行 `npm.cmd run verify:ocr`、Docker frontend rebuild，再由 OCR 品質頁手動啟動護照 Validation A/B，截圖匿名結果。此比較會多佔記憶體且總耗時較久；數據是同一流程不同 recognition 模型的 end-to-end 比較，而不是完全孤立的 recognition token 比較。若沒有淨改善或明顯回歸，禁止切換正式 OCR。正式 pipeline 仍 .29，基準護照 14/19、台胞證 13/13。禁止 GitHub Actions，不上傳個資及模型二進位。

## 2026-10-12 — 護照模型 A/B 主執行緒卡死，先改 Worker＋單張安全驗證

使用者在本機執行 Validation Mobile vs Server Recognition 的19張 A/B，跑到約 2/19 時瀏覽器顯示「網頁無回應」，即使等候也無法恢復。**這次 A/B 不算有效完成，無任何可靠準確率數字**。原因尚未用 profiler 定位；現有 Server WASM 大模型及 Mobile OCR 都在原本瀏覽器執行，可能阻塞主執行緒且造成記憶體壓力。

已直接修正 main：隔離 Server Validation instance 的 PaddleOCR.create 加上 SDK 已支援的 `worker: true`，WASM 繼續單執行緒，保持正式 OCR 不變；實驗 UI 暫時限每次手動只跑 **1 張 Validation 護照**，不允許再一次跑19張。新增 Worker 與樣本上限的 regression guard，仍只顯示匿名總和。不代表整段 pipeline 已搬離主執行緒（Mobile baseline 與 parser 仍在主執行緒）；若單張繼續卡住，立即停止這條 UI 路線，需進一步將整段比較移至 Worker 或服務端隔離環境。這次修改尚未本機 build / runtime 驗證成功；**不得聲稱已解決網頁無回應**。先 pull、verify/build，再點單張安全測試，不需要下載模型或跑32張正式 Validation。禁止 GitHub Actions、真實證件資料上傳 GitHub。

## 2026-10-12 — 單張 A/B 仍卡在 1/1：修正 Mobile 主執行緒遺漏

使用者已更新先前 Worker／單張安全模式，但畫面仍停在「護照 Validation 1/1」，沒有完成比較。進一步查碼確認上一版只有 Server instance 使用 `worker: true`；Mobile 比較基準仍是 `recognizePassportWithPaddle(file)`，依賴 production 主執行緒 SDK。這是單張仍可能卡住的重要架構缺口，尚不能斷定唯一成因。

本批已修正 OCR 品質頁的 Validation-only A/B：Mobile 改由 `createValidationPaddleInstance(true)` 獨立 WASM Worker 執行，取得結果後先 dispose、釋放資源，再初始化 Server 的 WASM Worker、執行同一張照片，最後 dispose。避免兩組大型模型同時佔用記憶體；正式 production OCR 完全不變。新增啟動 Mobile、推論 Mobile、釋放 Mobile、啟動 Server、推論 Server、釋放 Server 逐階段提示，更新 regression guard。單張限制仍保留，不執行 19 張或 Test cohort，不持久化姓名與 OCR 原文。

**修正尚未經 Windows build 或瀏覽器 runtime 證實。** 若再次無回應，應停止同種主頁推論測試，改設計完全可中止的隔離工作流程；目前停止按鈕只能停止後續樣本，不能強制終止目前同步卡住的 OCR。基線仍 `.29` 護照 14/19、台胞證 13/13；GitHub Actions 禁止執行。

## 2026-10-12 — Mobile / Server Worker 單張 A/B 首次完整成功；下一張游標

使用者本機完整跑完安全單張的 Validation 護照 Mobile / Server Recognition：比較 1 張，Mobile 中文姓名正確 1、Server 正確 1、救回 0、退步 0、錯誤 0；兩模型合計執行時間 57,455 ms（單張 P50/P90 均此值，不能視為各模型獨立 latency 或完整 Validation 指標）。此前網頁無回應問題此次未再發生。仍無證據表明 Server 比 Mobile 準確。合成字測試仍為 WASM 1 框正確。

在 main 新增 session-only 單張 Validation 護照游標：每次人工按一次才跑一張，完成或計入錯誤後移到下一張，不再永遠重測第一張；重新整理頁面時游標會重置。保留雙 Worker 先後運行、匿名合計、只讀 Validation、不動 Test 與正式 OCR；測試守衛更新。尚未在 Windows build 驗證這項游標變更。下一步先由操作者驗證游標與單張運行穩定性，不要求一次跑 19 張。若要針對剩餘姓名錯誤樣本精準評估，應建立更有效率的基線／候選關聯與隔離測試設計，不能聲稱單張已驗證改善。正式 pipeline `.29`，護照 14/19、台胞證 13/13。禁止 GitHub Actions，不上傳證件個資。

## 2026-10-12 — 單張模型 A/B 優先取歷史姓名錯誤樣本（待本機驗證）

上一輪 Worker 隔離的實際 Validation 單張比較成功：Mobile 正確 1/1、Server 正確 1/1、救回 0、退步 0、錯誤 0，兩模型累計耗時約 57,455ms。這張本來就已正確，不能用以證明 Server 較好。正式 production OCR 仍 .29（固定 Validation 護照 14/19，台胞證 13/13）。

main 現將單張 A/B 的選樣改成：只讀 Validation PASSPORT，依既有 `evaluationBaselineJson.fields.nameZh` 與人工 ground truth 進行 **匿名優先排序**；先選歷史 baseline 中文姓名不正確的護照，之後才是其他樣本。這只是排序 proxy：歷史 baseline 可能不同於現在的 .29，因此沒有直接假設這五張就是 .29 的五張錯誤，也不以 baseline 代替真正比較結果。選中的同一張仍依序在隔離 WASM Worker 跑 Mobile 及 Server，並以當次結果判斷 rescue/regression；每次最多一張、完成後 session 游標前進、不觸及 Test、不儲存個資、不中途改寫正式 OCR。UI 標示「歷史 baseline 疑似錯誤」或「一般／無歷史錯誤證據」。新增 static regression guard，尚未完成 Windows build 或實際執行。

**效能瓶頸仍存在**：單張兩模型約 57.5 秒，排序只能提高測試資訊價值，不會降低單張模型推論成本。不要直接回到連續 19 張模式；未來需另行改善模型初始化／耗時隔離與 Worker 強制中止能力。GitHub Actions 禁止執行，真實證件圖片、姓名、證件號不提交 GitHub。

## 2026-10-12 — 分開記錄 Mobile / Server Worker 耗時（待本機驗證）

單張模型 A/B 現在額外顯示 Mobile 與 Server 各自包含 Worker 初始化、推論及 dispose 的總時間；保留原本兩模型合計 P50/P90。該數據可判斷 57 秒主要來自哪個模型，但**不等同純 Recognition latency**。已新增 regression guard；正式 pipeline `.29` 不變、只使用 Validation 的單張護照、不新增 OCR inference。本批程式尚需 Windows `verify:ocr`、Docker frontend build 與手動單張 A/B 確認。禁止 GitHub Actions 或任何證件資料上傳。

## 2026-10-12 — Server-rec 單張 A/B 實測與歷史 baseline 覆蓋稽核

使用者完成一張 Validation 護照的雙 Worker 對照：Mobile 正確 1/1、Server 正確 1/1、救回 0、退步 0、錯誤 0。Mobile 含初始化與釋放 8,589ms，Server 含初始化與釋放 47,208ms，兩模型合計 55,796ms；這不是純辨識延遲。UI 顯示樣本 1/19「一般／無歷史錯誤證據」，因此目前的歷史 baseline 優先排序沒有證明能選中最新版 .29 的錯誤護照；不得聲稱 Server 準確率提升。

為避免再次昂貴盲測，已在 OCR 品質頁新增可手動執行的「先檢查匿名歷史基準覆蓋率（不執行 OCR）」：只檢查 Validation 護照人工答案與已存 evaluationBaselineJson，匿名統計有 baseline、歷史姓名錯誤、歷史姓名正確、無 baseline、無人工姓名答案的件數，不載入圖片、不跑任何 OCR、不存個資；並更新回歸守衛。需在本機 verify/build 後先執行此稽核，據結果決定下一步，不要直接重跑 19 張或盲測 Server。Production pipeline `.29` 不變，GitHub Actions 禁止執行。

## 2026-10-12 — 19/19 baseline 缺失，改用本頁即時 Validation 暫存錯誤集合

使用者的匿名稽核顯示：19 張 Validation 護照中，可解析歷史 baseline 0、缺少 baseline 19、缺少人工姓名答案 0。故先前「歷史錯誤優先」沒有證據可用。上一張 Worker A/B Mobile 與 Server 都正確，沒有救回與退步，兩模型耗時超過 56 秒，不能代表 Server 提升辨識率。

已在 main 新增 session-only 記憶體集合：當本頁正式 production Validation 完整完成且沒有 OCR 失敗時，從該次逐張比對結果留下中文姓名判錯之樣本 key（非姓名、證號或 OCR 原文）；A/B 優先選該次失敗，再考慮歷史 baseline。若 Validation 中止、失敗或不是 production 模式便不用此集合。重新整理即清空，不寫資料庫、GitHub 或本機持久儲存；仍每次只跑一張、使用雙 WASM Worker。

注意：既有 .29 的 14/19 聚合結果無法反推五張失敗樣本；本次改碼不能自動還原舊索引。只有同一頁再完成一次正式 Validation 才能形成精確錯誤排序。已加入靜態回歸守衛，尚待本機 verify/build。正式 production OCR .29 不變，台胞證基準 13/13。不啟動 GitHub Actions、不上傳真實證件與個資。

## 2026-10-12 — 限定已驗證錯誤護照的單張 Server A/B

歷史 Validation 護照 19 張可解析 baseline 為 0，故不能用歷史錯誤排序。更新 main：未在同一頁完整完成 production Validation 時，模型 A/B 按鈕停用；成功且沒有 OCR 失敗時，僅用本頁記憶體中的姓名判錯樣本 key 集合輪流進行單張 A/B。索引不持久化，刷新頁面即失效。不再盲測原本正確的護照。沿用獨立 Mobile/Server WASM Worker，正式 OCR pipeline .29 不變。已更新靜態守衛，尚待本機 verify/build。禁止 GitHub Actions 與真實個資上傳。

## 2026-10-12 — .29 Validation 錯誤索引成功，Server A/B 第一張無救回

使用者本機正式 auto Validation 完成 32/32：護照中文姓名及整張 14/19（74%），台胞證整張 13/13（100%），失敗 0；當頁建立 5 張護照姓名錯誤的 session-only 索引。隔離 Worker A/B 正確選中第一張錯誤護照（1/5）；Mobile 中文姓名 0/1、Server 0/1、救回 0、退步 0、錯誤 0。Mobile 含初始化／釋放 11,402ms，Server 63,145ms，總 P50/P90 74,547ms；每個時間是全流程開銷，不是純 recognition latency。此一筆不能推論其餘四張是否可救回，也不能升級正式模型。候選模型目前 WASM 耗時偏高；應保留安全單張模式並研究更有效率的 recognition-only 對照，不再做盲目全樣本連續運算。當頁索引刷新會消失，不保存姓名或證件資訊。正式 .29 未修改。禁止 GitHub Actions 和上傳個資。

## 2026-10-12 — 已驗證錯誤護照改用 Server-only 救援實驗（待本機測試）

先前本頁正式 `.29` auto Validation 完成 32/32，護照 14/19、台胞證 13/13，建立 5 張護照姓名錯誤的暫存索引；第一張雙模型 A/B Mobile 和 Server 均錯，救回 0。Mobile 含啟動釋放 11,402ms、Server 63,145ms，雙模型 74,547ms。

本批只改研究實驗：由於同頁正式 Validation 已驗證所挑選的護照姓名錯誤，因此不再在昂貴的救援試驗中重複初始化 Mobile Worker；只執行 Server WASM Worker 並與同頁 `.29` 判錯及人工 ground truth 比對。每次仍只跑一張已驗證失敗的 Validation 護照，若 Server 正確則計候選救回。UI 明確標示此為「正式 auto 已判錯 vs Server WASM」的跨 backend 對照，不能等同兩模型在同一 backend 同時重跑的嚴格 A/B。安全索引同頁暫存、刷新消失；模型和文件照片不提交 GitHub。正式 OCR pipeline `.29`、台胞證、固定 Test 完全不變。已更新 synthetic/static regression guard，尚未 Windows verify/build 或實測；Server 耗時瓶頸仍需另行研究。禁止 GitHub Actions。

### 2026-10-12 — 相同 broad VIZ ROI Recognition A/B 已建置（待 Windows verify / runtime）

已確認目前使用的 `@paddleocr/paddleocr-js 0.4.2` 公開 browser API 沒有獨立 recognition-only 入口：公開 `PaddleOCR.predict()` 會先跑 TextDetection，再把 detected boxes 裁切後交給 TextRecognition；package exports 也沒有公開可直接建立 rec-only model 的 runtime。若為了這次 A/B 強行繞過，必須 fork / vendor SDK internal preprocessing，風險與維護成本過高，暫不採用。

main 新增更低成本、read-only 的 **same-ROI recognition probe**：完全重用 production `.29` 既有 broad VIZ crop，不新增 ROI、不改座標、不改 selector。每次最多先用 Mobile WASM Worker 掃 5 張 Validation 護照，只找一張同一 broad VIZ ROI 沒有 exact 中文姓名候選的樣本；找到後才啟動 Server WASM Worker，並把**同一個記憶體 ROI Blob**交給 Server。兩者使用同一 PP-OCRv5 mobile detector，只有 recognition model 不同。

probe 僅顯示匿名 Mobile / Server exact candidate、detected boxes、recognized count，以及 init / detection / recognition / SDK total / wall / dispose 時間；不顯示姓名、OCR 原文、證號，不保存逐張結果，不讀 fixed Test，不寫 benchmark。Mobile 掃描窗口若全都有 exact candidate，Server 完全不初始化。此 probe 不跑完整護照旋轉、MRZ、Tesseract 或 parser，因此**不是新的 .29 end-to-end 準確率**；用途是先確認 Server Recognition 本身是否能在相同姓名輸入上產生 Mobile 缺少的正確中文字候選。

新增 `frontend/scripts/test-server-recognition-roi-probe.mjs` 並接入 `verify:ocr`。提交前已對修改後 source 執行 connector-side 靜態 guard assertions（同 ROI、Validation-only、最多 Mobile 5 張、Server 僅在 Mobile miss 後啟動、無 persistence、stage metrics）並通過；但本環境無法取得 npm/GitHub 網路資源執行完整 `npm.cmd run verify:ocr`，故**尚未宣稱編譯或瀏覽器 runtime 驗證完成**。production pipeline 仍 `2026.10.11.29`，已實測基準仍護照 14/19、台胞證 13/13；GitHub Actions 禁止執行。


### 2026-10-12 — ROI A/B first runtime observation and improved sample routing
- Windows screenshot: first ROI screening scanned 5 Validation passports; all 5 contained exact Mobile broad VIZ name candidates, with 0 missing truth; Server correctly never started. Mobile worker init 1407 ms, dispose 7 ms (ROI predict timings were not included on this no-miss branch). This says nothing about which five passports fail final production .29 selection and does not improve the proven 14/19.
- Follow-up code: when a same-page complete production Validation error index is present, prioritize **only** its known failed passports; otherwise run one bounded Mobile ROI sweep over at most 19 Validation passports (early exit on first Mobile exact miss) and at most one Server Worker invocation. No historical-baseline inference and no automatic full Validation re-run.
- Existing separate Worker initialization/disposal remains; production .29, permit paths and Test cohort unchanged. No names, images, or IDs persisted. The new experiment can still produce candidate-level false negatives when the ROI differs from the orientation/crop used by end-to-end .29; never claim end-to-end rescue from it.
- This follow-up was checked with source-level connector guards only; npm verify/build and browser runtime for this follow-up remain unverified. Do not trigger GitHub Actions.

### 2026-10-12 — Same-ROI A/B 第二次 Windows 真實觀測：Server 0 rescue，Recognition 7.9x 成本

- 使用者 Windows OCR 品質頁截圖：最新 same-ROI probe 在 Validation 中掃描 12 張，Mobile broad VIZ ROI 已有 exact 中文姓名候選 11 張，第一張 Mobile miss 觸發 Server 比較（不是同頁完整 .29 error index 的已確認錯誤樣本）。缺人工姓名答案 0。
- 該 ROI Mobile exact 0、Server exact 0、Recognition 候選救回 0；兩者 detected boxes 29、recognized 29。Mobile init 1036ms，ROI wall 3162ms（det 863ms、rec 2269ms、SDK total 3136ms），dispose 6ms。Server init 1025ms，ROI wall 18933ms（det 907ms、rec 17989ms、SDK total 18905ms），dispose 10ms。
- 推論：Recognition Server/Mobile 17989/2269 ≈ 7.93x，Detection 接近，初始化不是主要耗時瓶頸。這一張沒有證實 Server 品質收益，但不能外推五張 .29 最終錯誤樣本全部沒有收益；11/12 ROI mobile exact 也不能視為正式姓名正確率或新 Validation。
- 決策：正式 production `2026.10.11.29` 維持 PP-OCRv5 Mobile，台胞證原路徑不動。暫停無選樣根據、無預期收益的完整 Server A/B 或盲目 ROI 掃描，不再要求重跑 32 張 Validation。若未來評估 Server，需以確定的 .29 錯誤索引或等效完整錯誤歸因為前提，並維持相同輸入、選擇條件及端到端淨改善門檻。
- 下一個有收益的方向：先分析四張缺少完整正確候選的實際影像失敗模式，以及一張已有完整候選但被 one-syllable mismatch 阻擋的 selector 證據；不放寬拼音、不盲加裁切。優先設計匿名、可驗證的判斷與有意義的替代模型 gate；不要因多出版本號或額外測試自稱提高準確率。
- 這輪僅記錄使用者實際觀測並更新文件；沒有新程式碼、npm verify、fixed Test 或正式 Validation 執行。禁止 GitHub Actions／個資上傳。

### 2026-10-12 — Separate confirmed recognition misses from selector blocks before future A/B
- After same-ROI Server took 17,989ms recognition vs Mobile 2,269ms and rescued 0/1, the unaudited ROI scan is a poor signal: it found a miss after screening 12 passports without knowing whether it was among five .29 end-to-end failures.
- Change the existing session-only complete production Validation index to capture two disjoint anonymous sample-key sets: `exact-candidate` (selector issue) and the remaining errors (no exact candidate in eligible OCR diagnostics). Do not persist keys, names or images; discard on incomplete Validation/page refresh.
- Gate ROI Mobile/Server experiments behind completed in-page .29 production Validation. Pass only confirmed missing-candidate passport samples to model experiments. Never run Server for already-correct OCR candidates merely blocked by strict MRZ name selection.
- ROI probe is still exploratory and not an end-to-end rescue. Keep same ROI/Worker and at-most-one Server call, Mobile scans at most five confirmed missing-candidate passports; production `.29` and permit 13/13 code unchanged. Never use historical baseline to infer sample failures.
- No model accuracy improvement claimed; new code requires npm verify/build and browser validation. No Actions executed.

### 2026-10-12 — 收斂完整 Server A/B 與匿名 selector 原因（待本機 verify）
- 程式檢查發現：ROI A/B 已限制為當頁正式 Validation 的缺正確候選護照，但舊完整版 Server A/B 按鈕仍依全體姓名錯誤啟用，會浪費 Server 對已存在正確候選卻遭 selector 阻擋的護照做完整 OCR。
- 現已將完整版 Server A/B 的啟用條件、session 選樣及執行前索引再確認，統一改為 `currentPageRecognitionMissPassportSamples`，維持一次最多一張、獨立 WASM Worker、使用原始 Validator 真實答案、無個資持久化。
- 同次完整 production Validation 的錯誤樣本，對 `exact-candidate` 另以既有 `passportExactDecision` 統計匿名阻擋原因（例如 one-syllable-mismatch、no-anchor、unknown-threshold）；只在完整無失敗 production Validation 後顯示 aggregate counts，重新整理消失，不保存原因對樣本的對應。
- 正式 pipeline 仍 `2026.10.11.29`、護照最新實測 14/19、台胞證 13/13；此批為診斷決策收斂，未宣稱辨識提升。新 source 回歸守衛已補，尚未跑 Windows `npm.cmd run verify:ocr` / browser Validation；未執行 GitHub Actions。

## 2026-10-12 — 保守相鄰漢字框候選恢復（待真實 Validation）
- 假設：部分護照中文姓名可能已被 PP-OCRv5 Mobile 辨為相鄰獨立漢字框，但正式姓名 selector 僅處理單個文字框；原有同行 raw-row 診斷不會成為 selector 候選。這是新候選產生路徑，不是重試先前失敗的 VIZ 裁切、放寬拼音或更換插值。
- 在 `chooseTaiwanChineseName()` 新增只限原本 `best` 不存在或低於原門檻的受限兩框拼接 fallback：每框 1–2 個漢字、score >= .82、水平接近且同行、鄰近「姓名」或 MRZ 對應拉丁姓名錨點，整個合併姓名必須使用原本嚴格 `compareChineseNameToMrzRomanization` 得到 `compatible`；多個不同合格合併結果則不使用。原既有成功候選不被覆蓋。
- 不變更台胞證、身分證或任何背景 OCR 模型；正式版本號維持 `2026.10.11.29` 以避免聲稱已提高準確率。新增 `test-passport-joined-han-name.mjs` 並接入 `verify:ocr` 靜態防回歸。
- 注意：此假設**尚無證據證實**四張失敗護照有相鄰完整漢字框。沒有新一輪 32 張 Windows 真實 Validation，也未完成本地 npm build / regression，不得把這批視為已驗證改善；先測編譯，再評估是否真實救回且沒有其他欄位退步。禁止 GitHub Actions 與個資提交。

### 2026-10-12 — Joined-Han candidate must be visible to Validation (source consistency fix)
- Review of previous main `b459f08a` identified a measurement defect: `chooseTaiwanChineseName()` may return a unique strict-MRZ-compatible name formed by two adjacent Han OCR boxes, but `predictOne()` only collected candidateTexts from individual OCR items and assembled raw rows before selection. The correct joined fallback could therefore be absent from the Validation candidate set and incorrectly classified as a recognition miss.
- Fix: after `vizName` is returned, add its exact normalized name to the **transient** diagnostic candidateTexts if missing. The actual selector result, confidence, rank, production output and strict romanization remain unchanged by this diagnostic bookkeeping. No names/IDs persist or leave browser. Add regression guard in `test-passport-joined-han-name.mjs`.
- This is an accuracy-evaluation correctness fix, **not** evidence of new correct scans. No new 32-sample Windows Validation, npm compilation or browser runtime result. Keep formal best observed passport 14/19 and permit 13/13 until retested; never run GitHub Actions.

### 2026-10-12 — Joined-Han selector executable synthetic test (unverified locally)
- Follow-up to `b459f08a` and `83068160`: existing `test-passport-joined-han-name.mjs` only regex-scanned code. New `frontend/scripts/test-passport-joined-han-functional.mjs` reads the actual `chooseTaiwanChineseName()` function source, transpiles that TypeScript function with the existing `typescript` dependency, injects synthetic geometry and controlled phonetic matcher, and asserts output behavior instead of merely checking text patterns.
- Synthetic scenarios include an adjacent Han split, weak second box, horizontally distant box, wrong row, strict MRZ mismatch, missing name anchor and already-accepted full box. No real names/documents are read; any synthetic Chinese names are fictitious.
- Wired this test into `test:ocr-regression`, hence `verify:ocr`. No production selector/model/version change, no GitHub Actions. **Important:** these tests were authored but not executed in a checked-out npm environment here; full `npm.cmd run verify:ocr`, typecheck and true Validation are still pending. Do not treat synthetic tests as evidence of improved real-passport accuracy. Previously observed passport 14/19 and permit 13/13 remain the only validated aggregate figures.

### 2026-10-12 — Windows 實測：32/32 完成，joined-Han 無淨改善；兩種 Server A/B 均 0 rescue
- 使用者提供兩張本機截圖（不含證件圖片／姓名）：正式 auto 模式 `2026.10.11.29`；Validation 32 張，失敗 0。護照 19 張：整張與中文姓名 14/19（74%），其餘必要欄位各 19/19；台胞證 13 張：整張與中文姓名及必要欄位皆 13/13。這與前版相同；新增相鄰漢字框合併沒有觀察到淨提升。
- 5 張護照姓名失敗細分：4 張缺完整正確候選（即受診斷覆蓋限制的 recognition-candidate miss），1 張完整正確候選存在但 selector 的 `romanization:one-syllable-mismatch` 阻擋。候選源摘要：姓名欄位正確候選 1、broad VIZ 正確候選 1、focused VIZ 正確候選 0；屬不同 crop 的證據，勿把加總當成不同樣本數。
- 同頁有已確認錯誤索引：5 張錯誤，4 張缺候選、1 張 selector 阻擋。same-ROI A/B 選中一張真正缺候選的樣本：Mobile exact 0，Server exact 0，rec rescue 0；Mobile ROI 3,791ms（det 1,094ms、rec 2,660ms），Server ROI 19,689ms（det 929ms、rec 19,665ms），各辨識 29 框。完整單張 Server WASM Worker A/B：Server correct 0、rescue 0、error 0；含模型啟動／釋放約 63,210ms（P50/P90 約 63,210ms）。
- Server smoke 合成圖像在 WASM 成功（約 2,207ms）只表示模型可運作，非真實準確率。歷史 baseline 19/19 無可解析記錄，勿使用歷史錯誤優先選樣。
- 決策：不再重跑相同的 joined-Han 規則、舊 ROI／裁切、PP-OCRv5 Server WASM 或放寬 strict MRZ，一律不宣稱準確率進步。下一階段要分析四張缺候選的影像辨識失敗根因與不同技術的獨立候選能力；另一張 one-syllable selector 問題保持隔離、不可盲改。
- 此輪僅記錄用戶的真正 Windows 實測結果；尚未更動 production、未啟動 GitHub Actions，也未上傳證件圖片或個資。

### 2026-10-13 — 新增不同中文 OCR 引擎的 4 張缺候選護照隔離實驗（待 Windows 實測）
- 先前真實 32/32 Validation 再次確認護照 14/19、台胞證 13/13；已實驗的 PP-OCRv5 Server Recognition 在一張真實缺候選樣本上救回 0，耗時高，不再投入相同模型。
- 這輪使用現有 `tesseract.js@^7` 新增**不同於 PaddleOCR**的繁體中文 `chi_tra` LSTM Worker。獨立服務 `alternativeChineseRecognition.ts` 重用既有 broad VIZ ROI（不是正式姓名選取），只在同頁完成 production Validation 後讀取其 session-only `currentPageRecognitionMissPassportSamples`，最多四張護照，使用同一 Worker 依序運行；不讀 Test、不更新正式旅客與 OCR、不上傳證件照片、不保留 OCR 全文、不顯示姓名。
- 品質頁新增 `INDEPENDENT CHINESE OCR` 比較按鈕，匿名顯示比較張數、完整獨立姓名候選命中張數、錯誤數、模型 init / ROI 推論耗時。每次用完 terminate Worker、撤銷 Blob URL。中文語言包由 Tesseract.js 在首次執行時取得，可能需要網路；不得將這種本地運算誤稱無外部下載。
- 此實驗只衡量 Tesseract 是否能產出 Paddle 缺少的獨立完整姓名文字；它不是 production .29 的新準確率，更不是確認 MRZ selector 能接受。只有觀測到額外正確候選，後續才考慮嚴格錨點、拼音、效能及真實安全整合。
- 加入 `test-alternative-chinese-recognition.mjs` 靜態 isolation/privacy guard 與 `verify:ocr`。尚未執行 Windows npm verify / docker / browser 測試；沒有 GitHub Actions，沒有個資進版控。

### 2026-10-13 — Windows independent chi_tra OCR first true 4-sample result
- User screenshot: after completed same-page production Validation, independent Tesseract `chi_tra` on 4 verified missing-name-candidate passports completed successfully: compared 4, standalone exact Chinese name 0, errors 0; Worker init 989 ms, combined broad VIZ ROI recognition 42,950 ms (~10.7 s each). No end-to-end rescue demonstrated; do not promote to production or ask to repeat same run.
- Independently, same screenshot shows same-ROI PP-OCRv5 Server test on one verified miss: Mobile exact 0, Server exact 0, rescue 0, two pipelines detect/recognize 29 boxes; Server total ~20,060 ms. Thus neither existing server experiment nor this independent Tesseract exact-standalone match has demonstrated benefit.
- Crucial interpretation: `containsStandaloneChineseName` accepts only exact standalone row (or 姓名 prefix) and may miss true characters spread across multiple OCR lines/with noisy labels. **0 exact is not proof of 0 useful individual characters**. Before another model or crop effort, compute anonymous partial-evidence categories on existing chi_tra results (do not log candidate/ground truth), or examine safe aggregate patterns. Keep current production passport 14/19 and permit 13/13 until real improvement.
- No GitHub Actions, image/PII upload, Test cohort usage or new production behavior.

### 2026-10-13 — Validation 樣本品質匿名稽核（尚待本機驗證）
- 使用者懷疑持續 14/19 的問題包含早期隨意保留的測試樣本，且過去不清楚如何取消。已確認後端 `SetSelection(false)` 會移除一般 `TrainingSamples` 複本，但保護固定 Test baseline；操作入口在原團別證件審核視窗「保留此樣本供 OCR 改善」勾選框，不能把排除訓練樣本誤當成刪正式旅客／已審核證件。
- 在 OCR 品質頁新增只讀 Validation 人工標準答案匿名稽核（不執行 OCR、不下載照片、不讀 fixed Test）：中文姓名缺漏、出生日期格式與明顯可疑年份（1900 年以前或未來）、已填但驗證失敗的台灣身分證字號、簡單占位文字訊號。只輸出整體數字，不輸出任何姓名／字號／樣本 ID；每一異常是待人工確認而非自動剔除。沒有填身分證號的護照不視為錯誤。
- 正式 OCR 與 dataset selection API 不變。新增 source static guard 並接入 `verify:ocr`。未進行 Windows 編譯或真實盤點，不能宣稱 19 張中有任何一張真的是假資料，也不得藉由刪掉失敗樣本冒稱模型改善；保留既有 14/19、13/13 基準與歷史結果。
- 禁止 GitHub Actions、真實證件影像或個資提交至版本庫。

### 2026-10-13 — PP-OCRv6 Small local RapidOCR pilot (new candidate architecture, untested on personal data)

Literature gate: RapidOCR v3.9+ officially supports PP-OCRv6 small/medium ONNX multilingual recognition with Traditional Chinese. RapidOCR project reported recognition standalone exact accuracy 0.8419 for PP-OCRv6 small vs 0.7355 for PP-OCRv5 mobile on their public recognition dataset; **these are not our passport measurements** and model/version/config comparisons need caution. Sources: https://rapidai.github.io/RapidOCRDocs/latest/model_list/ and https://rapidai.github.io/RapidOCRDocs/latest/blog/2026/06/18/rapidocr-%E9%9B%86%E6%88%90-pp-ocrv6-rec-%E6%A8%A1%E5%9E%8B%E8%AE%B0%E5%BD%95/

New experiment `training/experiments/bench_ppocrv6.py` runs RapidOCR's **correct v6 preprocessing and dictionary** locally rather than silently substituting a v6 ONNX into `@paddleocr/paddleocr-js@0.4.2` configured for v5. Requires Python 3.10+, `py -m pip install "rapidocr>=3.9,<4"`; export PRIVATE ZIP from OCR 品質 page to a local private directory, then `py training/experiments/bench_ppocrv6.py C:\\private\\ocr-training-dataset.zip` at repository root. The runner reads **only** `splits/validation.jsonl`, **only** `PASSPORT` images and ground-truth, at most 19, never Test/Train image bytes. It uses broad approximate VIZ ROI 24–98% width, 12–70% height with no production rotation/upscaling; results are anonymous aggregate standalone candidate matches and inference times, **not** a production end-to-end benchmark. It never prints/saves recognized strings, personal names, IDs or images. Model weights may download from RapidOCR public model repositories; private input images stay on the local machine. Keep zip OUTSIDE Git and never paste full OCR text.

Scope: only an optional pilot, not a replacement of browser-based production; no backend deployment or cloud image transmission. Need to establish 1) model initialization locally, 2) whether it rescues any of the four actual .29 misses (this 19-image aggregate alone does NOT establish same-sample rescue), 3) on-device browser Worker compatibility+dictionary and strict security gates before integration. Python pilot is not tested here with real ZIP or installed RapidOCR; do not claim accuracy gains. Formal baseline remains passport 14/19 and permit 13/13. No Actions.

### 2026-10-13 — v6 paired same-sample verification
- Windows v6 Small pilot verified: 19 Validation PASSPORT, standalone exact 14, substring-only 2, failures 0, median ROI 610ms. This is not 16/19 production accuracy. Historical export original OCR proxy is mostly unknown and cannot prove .29 rescues.
- Add one-time local-only export of the current-page complete production .29 missing-candidate and selector-blocked sample IDs. Export is available only when the current production Validation finished without failure; it contains opaque sample IDs, not names, ground truth or photos. Do not share/upload index to GitHub. Refresh clears page index.
- Python PP-OCRv6 pilot accepts `--production-index <local-json>` and joins with private ZIP manifest IDs locally; reports aggregate number of confirmed .29 missing-candidate passports rescued as standalone or substring-only, plus whether index membership matched. Both inputs stay local; no identifying strings displayed. Do not treat substring-only as selected name.
- Requires redoing one formal .29 Validation in browser to re-create the session-only index (unless that completed page is still open), but does not require rerunning Python v5. Production OCR and Test are unchanged. No GitHub Actions. Windows build pending.

### 2026-10-13 — Confirmed same-sample PP-OCRv6 Small complementarity on Windows
- User ran local PRIVATE ZIP + local current-production .29 missing-candidate/selector-blocked index against RapidOCR PP-OCRv6 Small. Observed `processed=19`, `standalone_exact=14`, `substring_only=2`, `failures=0`, `median_roi_ms=671` and `production_29_overlap={confirmed_missing_candidates:4, v6_standalone_rescue:1, v6_substring_potential:0, v6_absent:3, confirmed_selector_blocked:1, index_complete:true}`.
- This is the first actual **same-sample** additional complete name recognition candidate among the four genuine .29 candidate misses. It is NOT yet a confirmed end-to-end rescue: ROI model was run in local Python RapidOCR, not the browser; final name geometry/strict MRZ acceptability and regression on original correct 14 must be tested. Do not claim 15/19 as observed production accuracy.
- Model uses PP-OCRv6 Small via RapidOCR with its own pre/postprocessing. Prior PP-OCRv5 Server / chi_tra produced zero standalone rescues. Prioritize an isolated, browser-compatible v6 candidate integration gated by strict MRZ, use on true failure cases only. No private labels/photos/IDs in repo; never activate GitHub Actions.


2026-10-13: v6 Small offline experiment now reports aggregate bounding-box availability, recognition score >=0.75, and upper-ROI evidence for standalone exact candidates, especially within the four verified .29 candidate-miss passports. These checks are exploratory and do not change production OCR or establish end-to-end recovery. Historical 1/4 confirmed candidate rescue remains the latest result. No private data committed; no Actions.

### 2026-10-15 — PP-OCRv6 truth-blind spatial name proposal (experimental)
- Recent new Windows validation again confirmed production v5 .29 = passport 14/19, permit 13/13 after isolated database restore. Existing v6 local RapidOCR same-sample pilot found one independently exact full name among four v5 candidate misses, with box, score and upper-ROI evidence; **not** a proven production rescue.
- Added `training/experiments/v6_name_gate.py`, a standalone conservative *truth-blind* proposal stage: scan v6 recognized boxes without consulting ground truth; require 2–4 Han characters, recognition score >=.75, upper portion of ROI, and close same-row label '姓名' / '中文姓名'. No MRZ acceptance, no automatic traveler mutation. Missing geometry/score => no proposal.
- Existing private `bench_ppocrv6.py` now reports `truth_blind_spatial_gate`: unique correct/wrong, ambiguous, none, and unique correct/wrong among the four actual .29 candidate-misses (ground truth used **only after** proposal selection for evaluation). A true proposal can be wrong; check false positives before any deployment. A real passport with no '姓名' OCR anchor may fail this strict trial; do not interpret 0 as model regression.
- Added no-private-data synthetic tests; neither Python local full pilot nor browser production run was executed here. No changes to production .29, permit, database, Docker, or Test; never run Actions. Code authored on main, not yet empirically validated.

### 2026-10-15 — PP-OCRv6 truth-blind inline-label rescue candidate
- The prior truth-blind v6 gate only accepted detached `姓名` label + separate Chinese-name box. It could miss a correctly recognized single box such as `姓名:林奕辰`. Added conservative extraction of a full **2–4 Han** name from `姓名` / `中文姓名` prefix in the same OCR box, requiring recognition score >=0.75, finite valid geometry and upper VIZ region. No truth-label access or fuzzy matching; original detached-label branch remains.
- Added exact text de-duplication: repeated OCR boxes with the same proposed name are not counted as contradictory candidates. Distinct names remain ambiguous and must not be auto-applied.
- Expanded synthetic tests for inline variants, repeated candidates, conflicting distinct candidates, missing anchors, bottom-of-ROI, low-confidence and non-Han text. All v6 work remains **offline experimental**, not yet a browser integration nor evidence of improved production 14/19. The tests require running on the local Python environment; do not claim actual validation improvement without Windows private ZIP + .29 index evidence. Never run Actions, never submit private data.

### 2026-10-15 — PP-OCRv6 blind-name gate ablation
- Real Windows private Validation showed 19/19 no candidates from the strict label+upper-ROI gate, despite the v6 recognition model producing 14 exact full-name strings and one exact extra candidate among four confirmed .29 misses. This is a gate problem, not a model degradation.
- Added three offline-only truth-blind gate variants: no-label full ROI; no-label upper ROI; label-required full ROI. After candidate selection, compare against ground truth and count unique-correct/unique-wrong/ambiguous/none overall and in the verified four .29 missing-candidate samples. No private OCR text, images or IDs printed; no Test samples. This determines whether missing labels or the incorrect upper-ROI assumption causes all 19 to be rejected.
- Keep production .29 and permit untouched; a no-anchor experiment is diagnostic only and must NEVER be deployed without MRZ and geometry safety checks. Local private pilot not yet rerun; no Actions.

### 2026-10-15 — OCR-derived English romanization gate (offline diagnostic only)
- True-blind v6 ROI ablation from user's Windows run: 19 PASSPORT records; without label/full ROI candidate selection 12 correct, 3 wrong, 2 ambiguous, 2 none. In four confirmed .29 missing-candidate records: 1 correct, 3 wrong. Upper-only loses sole rescue; label-required produces none. **Do not deploy loose selection**.
- Added `v6_romanization_gate.py` plus synthetic test and optional `bench_ppocrv6.py` aggregate: candidates from full-ROI no-label gate can be corroborated with English string from `originalOcr.originalFields.nameEn` or `originalOcr.fields.nameEn` **only**. No annotation/ground-truth English used for selection; Chinese ground truth is used only after selection for post-hoc accuracy. Missing OCR-derived English is abstain; exact normalized transliteration only. `pypinyin` defaults to Mainland readings and Taiwan variants may differ, so false rejection is expected; historical OCR English may not match current .29 MRZ, hence these counts cannot prove a safe production rescue.
- New counts include English available, one exact corroboration correct/wrong overall and for four verified missing-candidate passports, no-English and no-match. Never print names, recognized strings, or IDs. Need local pip install pypinyin and synthetic test/ZIP replay; no actual data inference yet. Preserve production .29, 14/19, permit 13/13, no Actions.

### 2026-10-15 — Offline v6 candidate A/B using the actual production romanization comparator (pending Windows run)
- The 19-sample v6 no-label full ROI proposed 12 correct, 3 wrong, 2 ambiguous, 2 none; among 4 real .29 recognition misses, 1 correct and 3 wrong. Experimental pypinyin joined-English filtering on historical OCR gave 0 correct and 2 wrong among those four. Do not integrate either method into production.
- Added frontend/scripts/eval-v6-mrz-candidates.mjs. It bundles the **existing** frontend/src/services/nameRomanization.ts using local esbuild (provided by frontend dev dependencies), thus reuses the same pinyin-pro, Taiwan aliases, token counts and compatibility gate rather than re-implementing them in Python. It reads local candidate plus historical OCR English data from **stdin only**; prints aggregate counts, no personal names or IDs.
- Python private ZIP pilot adds optional `--production-comparator` switch, piping at most 19 private records in memory to the Node process. The bridge uses historic `originalOcr` English, **NOT** the current .29 MRZ, so this is a parity/evaluation diagnostic ONLY and not a proven production rescue. Output labeled `production_comparator_on_historical_english`; true selector still needs MRZ-specific input and candidate geometry, and production .29/permit code is completely unchanged.
- On Windows: from project root run `cd frontend; npm.cmd ci; cd ..`, then existing private ZIP pilot with `--production-comparator`. No GitHub Actions, no PII uploads, no real photo stored beyond original private ZIP.

### 2026-10-15 — Current production .29 MRZ paired with v6 candidate (privacy-sensitive local-only export)
- Latest 19-PASSPORT local v6 test using historical OCR English + actual frontend comparator produced 7 compatible, 5 correct, 2 wrong; among 4 confirmed .29 candidate misses 0 correct and 2 wrong. Historic English is not current MRZ and must NOT be a production gate.
- Frontend OcrQualityPage now keeps only in-memory full auto production Validation parsed passport MRZ English by sampleId, and adds ONLY the 4 recognition-misses + 1 selector-blocked sample's current MRZ English into the local error-index download as `productionMrzEnglishBySampleId`. This JSON now CONTAINS SENSITIVE PERSONAL NAMES and opaque sample IDs: save only to secured local private backup, no Github, no sharing and no raw logging; page refresh clears memory.
- Local `bench_ppocrv6.py --production-comparator --production-index` requires the newly exported index map, refuses prior index without MRZ map, and feeds precisely per-sample *current production* MRZ English to the existing frontend comparator. All metrics are aggregate, no private strings in stdout. The other 15 passport records do not have MRZ English in this minimal index so `compared` applies only to indexed failures; do not interpret as 19-sample comparator performance.
- This is STILL offline Python v6 model + historical dataset ZIP, not browser v6 deployment, and not a proof of end-to-end rescue. Requires one fresh full 32-image .29 Production Validation AFTER frontend rebuild to collect current MRZ index; formal production 14/19 and permit 13/13 unchanged. No Actions.


### 2026-10-15 — Stop failed v6 MRZ selector and declutter OCR quality UI
- User re-ran full production auto Validation: PASSPORT 14/19 (74%), TAIWAN_COMPATRIOT_PERMIT 13/13 (100%), 32/32 done, .29 unchanged.
- Offline PP-OCRv6 Small against current .29 sample-linked MRZ: 5 failure-sample MRZ rows compared; 2 compatible candidates, **0 correct and 2 wrong**, 3 without a unique compatible candidate. Among four verified .29 candidate-misses: 0 rescued, 2 wrong. STOP any automated use of these relaxed candidates. Note model produced one standalone exact candidate but it is not safely selected.
- On OcrQualityPage, old browser-only PP-OCRv5 Server smoke, Tesseract chi_tra, ROI A/B, single-image Server rescue experiments are no longer rendered (disabled legacy template blocks); keep official Validation and local .29 error-index export in an explicit, simpler section. Retired script logic remains for a later safe deletion, not an active UI. Local index contains current MRZ person names: private only, never commit to GitHub. No production OCR algorithms changed, no Actions.
- Before claiming better accuracy, use a genuinely independent alternative model with validation on held-out documents, or improve source-image quality/annotation problems; do not blindly relax candidate accept rules to reach 100% on this fixed cohort.

### 2026-10-16 — 集中整理模型與技術決定
- 建立 docs/OCR_CURRENT_STRATEGY.md：明確分辨正式基準、模型候選命中率、錯選、淘汰理由及下一步驗收條件。
- 新增 DECISIONS D-089（停止不安全 v6 自動救援）與 D-090（技術決策記錄契約），同步 OCR_MODEL_AB_PLAN、NEXT_CHAT_HANDOFF。
- 本批為文件及技術治理改進，不變更正式 OCR 演算法、不修改資料庫，無新的本機 Validation；正式 14/19 與 13/13 保持上一次實測基準。沒有觸發 GitHub Actions。

### 2026-10-16 — 護照五張失敗樣本根因證據第一階段
- OCR 品質頁正式 Validation 錯誤索引卡片新增匿名的 name-field / broad viz / focused viz 證據彙整：失敗張數、任何區域有正確文字、存在其他候選、各區域沒有候選、selector 擋住完整候選。既有詳細 source 計數仍保留。
- 此次只修改前端診斷和文件，不修改辨識結果或照片、固定 Test。提交後尚待 Windows Build + 32 張正式 Validation，請勿宣稱正確率提高。

### 2026-10-16 — 加入護照空白中文姓名提示
- BatchScanPage 的單檔完成提示新增「已加入待審核 · 中文姓名未辨出，請人工核對」，僅護照且辨識結果 nameZh 空白時出現；避免操作者將掃描完成錯認為姓名也辨對。
- 不更動 OCR 決策、存檔內容及台胞證 13/13 基準。此改動不代表護照由 14/19 提升；實際 Windows Build 與端到端流程尚待驗證。模型選擇理由延續 OCR_CURRENT_STRATEGY。

### 2026-10-16 — 護照三字拆框候選保守恢復
- 於 paddleOcr.ts 既有姓名選取器新增三個單漢字框的嚴格空白結果 fallback，只在無有效既有候選時使用；每字高信心、同行近距離、明確標籤或拉丁錨點、整個姓名 MRZ 全字相容且唯一才返回。沒有降低既有兩字框 fallback 的任何門檻。
- 擴充 test-passport-joined-han-name.mjs 源碼防回歸守衛。這不是證明實際會提升四張錯誤護照的有效率；尚待 Windows npm verify/build 與固定 Validation。更新 D-093，無 Actions，無個資。

### 2026-10-16 — 新增 Passport OCR 字元覆蓋率匿名診斷
- 在既有正式 Validation 失敗護照統計中，從 raw OCR 文字和匿名標準答案計算姓名漢字「全部、部分、零」出現件數；不用 OCR 次數增加、沒有新模型、沒有修改 .29 或台胞證。目的是證據導向判斷跨框組字 vs recognition 漏字，避免繼續不確定的三框拼接盲測。
- 僅暫存分類且在頁面呈現匿名件數；無個人姓名或 raw OCR 匯出。待本機 build / Validation，尚無正確率增益。決策 D-094。

### 2026-10-16 — 三框護照姓名混合長度恢復（待驗證）
- paddleOcr.ts 三框合成由只允許 1+1+1 改為每段 1–2 字，整體僅允許 3–4 字；MRZ exact compatible、位置錨點、信心 >=0.88、唯一候選及原有 direct 優先邏輯保持。新增靜態回歸守衛。未在私人 Validation 實測，不得宣稱改善。決策 D-095。

### 2026-10-16 — D-095 三框混合長度試驗實測無增益
- 使用者新電腦執行正式 32 張 Validation 截圖：護照整張 14/19、台胞證 13/13，OCR 失敗 0；中文姓名仍失敗 5 張，4 張缺完整候選、1 張正確候選被 one-syllable-mismatch 阻擋。
- 三框混合 3–4 漢字補救 D-095 無收益。依 D-096 停止擴張組框與拼音 fallback，下一個研發批次改比較新繁體中文辨識模型與拍攝品質。此次只記錄實測，沒有新的 OCR 準確率改善。

### 2026-10-16 — PP-OCRv4 繁體中文 recognizer 離線候選 A/B 入口
- 查 RapidOCR 官方模型列表確認 v4 中文繁體 Mobile ONNX recognition 支援（v6 Small detector 繼續固定）。在原有匿名本機 private ZIP bench 新增 --rec-model v4-traditional，預設 v6-small 不變；避免新裁切和危險名稱 selector。既有輸出可比較全部 19 張 exact、同樣本 .29 missing candidate、位置候選錯選與 ROI 耗時。
- 這是新的辨識來源而非 .29 改版；模型檔首次可需下載、效能未驗證。尚待 Windows 本機執行，不推送私人資料，也不啟動 GitHub Actions。決策 D-097。

## 2026-10-16 — 繁體辨識模型實測更正
本機 19 張護照 benchmark：獨立模型完整正確姓名 6 張，原本正式 .29 四張缺完整候選中有 2 張新增正確候選，但盲選仍有錯選，不能自動採用。實際載入模型為 chinese_cht_PP-OCRv3_rec_mobile.onnx；參數 v4-traditional 不代表 v4 模型權重。暫限人工覆核候選研究，正式基準 14/19、13/13 不變。參照 D-098。

### 2026-10-16 — Production batch passport missing-name source-detail retry
- BatchScanPage 在護照第一次 OCR 姓名空白且原圖被縮小時，限定原圖 <=12MP/<=4200px 嘗試一次較高解析度 OCR；採納需第二次非空且 MRZ 姓、名、生日、證號與第一次全部一致。保留既有選取規則、已正確姓名不重跑；失敗不阻止原本審核流程。
- 儲存採用的真實 OCR input image 並在 payload 記錄 sourceDetailRetry attempted/accepted；新增 frontend/scripts/test-passport-source-detail-retry.mjs 作源碼守衛。這是未驗證的新生產補救實驗，並非離線 CHT v3 模型已能安全上線。待 Windows build 和人工重試樣本測試；正式 14/19、13/13 未改。

### 2026-10-16 — 原圖姓名重試安全與 OCR 輸入記錄一致性
- 使用者已完成 D-099 前端 Docker image Built / container Started。針對新補救流程，要求二次 MRZ 的所有重要欄位（證號、生日、英文姓／名、性別、國籍、簽發國、有效期限）均與第一次一致才採用。
- 修正採用原圖時的 ocrInput.resized/workingWidth/workingHeight 元資料；擴充 test-passport-source-detail-retry.mjs 守衛。待本機執行 verify:ocr；原本 Validation 14/19 與台胞證 13/13 未變。

### 2026-10-16 — 原圖補救結果在批次檔案列可見
- BatchScanPage 的每張檔案狀態增加 none/attempted/accepted，從本地 OCR payload 取用補救狀態；補救取得姓名時提示仍須人工核對，嘗試未採用時也提示人工核對。辨識結果未更改；台胞證與身分證不受影響。
- 更新 test-passport-source-detail-retry.mjs 守衛；需在 Windows 進行完整 npm verify:ocr 和一張真實高解析度護照的實際補救測試。這不是準確率增益。決策 D-101。

### 2026-10-16 — 修正 permit-evidence 舊測試阻塞完整 verify:ocr
- 使用者 Windows 執行 verify:ocr 在 test-permit-evidence.mjs:50 失敗：F !== M。根因是兩個過時性別期望值，與既有 semantic-row override 不一致；只改測試，增加 label 單獨弱證據不應覆蓋 MRZ 的保護例。
- 之前 frontend Docker Build 成功但 npm verify:ocr 未完成，兩件事不得混為一談。尚待完整 Windows 回歸重跑；沒有辨識率提升。D-102。

### 2026-10-16 — 修正台胞證裁切浮點誤差回歸失敗
- Windows 最新 npm verify:ocr 回報 test-permit-sex-retry 對 1000x600 固定 ROI 的 height 期待 204、實際 205。根因是 IEEE754 600×0.34 產生略大於 204 的小數並被 Math.ceil 多進位。採 epsilon-tolerant ceil 修正，增加非整數大小測試以保障原比例。
- 同系列紀錄曾見 test-permit-evidence M/F 期望不符，此問題尚未獲得可重現根因，不把新的性別 ROI 取整修正誤認為解決全部問題。使用者 Docker Build 已成功；npm 全回歸仍待驗證。

### 2026-10-16 — Fix stale regression wiring assertion
- Windows verify:ocr failed after earlier permit tests passed: `test-passport-crop-diagnostics.mjs` expected adjacent `passportCropDiagnosis, passportExactDecision`; additional `passportCharacterCoverage` in Validation outcomes makes this source guard obsolete. Adjusted assertion to require all three wired fields and coverage classifier. No OCR behavior changes; awaiting full local verify:ocr rerun.

### 2026-10-16 — 修正 npm verify:ocr 過時斷言（handoff blocker）
- Windows 完整回歸於 test-server-recognition-smoke.mjs 失敗；實際來源使用 `return await execute('wasm', true)`，舊測試只接受無 `await` 的寫法。改為同時接受 `return execute(...)` 與 `return await execute(...)`，不更動 OCR 執行邏輯。
- 前次測試亦曾於 permit-sex-retry 固定 ROI 高度 204 vs 205、passport-crop-diagnostics 匯出欄位插入、joined-han 判斷失敗。最新回歸輸出表示這些前段守衛已通過。尚待使用者重新跑完整 `npm.cmd run verify:ocr`；未通過前不能宣稱修復完成或交接完成。


## 2026-10-16 — D-103：PP-OCRv3 繁中第二模型人工覆核候選（待 Windows runtime / Validation）
- 這批不再擴張姓名組框、ROI 或拼音 fallback。正式 PP-OCRv5 Mobile 與 pipeline 2026.10.11.29 保持不變；第二模型只補充人工覆核候選。
- 模型名稱固定更正為 chinese_cht_PP-OCRv3_rec_mobile.onnx。RapidOCR 的 v4-traditional 路由名稱不代表 PP-OCRv4 recognition 權重；本次 Docker 固定 RapidOCR 實驗同一 ONNX SHA-256：779656d044ce388045e02ea9244724616194e63928606436cdfc6dc3c9528cc6。
- Browser 橋接：Docker 下載上述固定 ONNX，搭配官方 PaddlePaddle chinese_cht_PP-OCRv3_mobile_rec 在固定 commit 083f1a89e8efdedbd748514157e12f5a05b33bc3 的 inference.yml，封裝為 PaddleOCR.js 所需未壓縮 ustar。這只是相容候選，仍需 Windows Docker build / browser runtime 證明；不得因程式已接線就宣稱模型可用。
- 啟動門檻：只限護照，且正式結果 chineseNameRomanizationStatus 不是 compatible、MRZ 已有 surname / givenNames 時執行。台胞證與身分證完全不呼叫第二模型。
- 安全門檻：第二模型所有候選仍使用 production compareChineseNameToMrzRomanization；只有 strict compatible 且 compatible 候選唯一時才形成 suggestion。零個或多個 compatible 候選都 abstain。
- 絕不自動覆寫：suggestion 只寫入既有私人 ocrPayloadJson.secondaryChineseNameReview；result.chineseName、scan item nameZh、originalFields.nameZh 仍保持正式主模型輸出。Review queue API 只抽出 suggestion 給待審核畫面，操作員必須點「人工套用候選」並對照照片後才會進入表單。
- 第二模型初始化、模型下載或推論失敗只標記 unavailable，不能阻止 PP-OCRv5 結果加入待審核。
- 私人 19 張離線實驗證明此 recognizer 有互補性，但瀏覽器橋接使用 PP-OCRv5 Mobile detector + 現有 broad VIZ crop，不等同原 RapidOCR detector/runtime，故不能直接把離線 2 張 rescue 換算成 production 16/19。
- 正式基準仍是護照 14/19、台胞證 13/13。只有完成本機 verify:ocr、Docker build/browser runtime，再跑固定 Validation，才能更新準確率。

### 2026-10-16 — D-103 post-commit wiring correction
- 提交後人工 diff 審查發現兩個接線錯位：Docker model_name grep 行被組檔截斷、ChineseNameReviewCandidate 一度誤插入 ReviewedDocumentInput constructor，而非 ScanItemResponse mapper。
- 已重建 Dockerfile 的候選模型區塊，確保只有一個 final stage；backend 只在 ToItemResponse 抽取 review candidate，不污染正式 ReviewedDocumentInput。
- 強化 test-passport-secondary-review-candidate.mjs：鎖定 Docker final stage 數量與完整 model_name guard，並明確要求 candidate 只存在 ScanItemResponse mapping、不得進 ReviewedDocumentInput。
- 此修正仍未代表 Windows build/runtime 通過；正式 OCR 成績維持護照 14/19、台胞證 13/13。

### 2026-10-16 — D-103 official metadata indentation guard
- 官方 PaddlePaddle inference.yml 顯示 model_name 位於 Global 區塊且有前導縮排；Docker preflight 已改為允許前導空白後仍精確比對 chinese_cht_PP-OCRv3_mobile_rec。
- 這是 build compatibility guard 修正，不是 OCR 準確率變更；正式基準仍為護照 14/19、台胞證 13/13。

## 2026-10-17 — D-104：護照局部反光與防偽底紋離線診斷（尚未執行）
- 使用者提供四個護照中文姓名區域截圖。觀察到密集水平防偽紋、局部反光、紅色底圖交疊文字；影像問題只是合理假說，不可從截圖直接確定 Detector 或 Recognizer 責任。
- 新增 `training/experiments/diagnose_passport_name_texture.py`，只讀本機私人 ZIP 的 `splits/validation.jsonl` 及當次 `.29` 的 `missingCandidateSampleIds`（四張），比較 original、local_luminance、reduced_chroma、grayscale；均用同一個 RapidOCR model 與既有 broad VIZ 座標。只輸出匯總計數，不列姓名、OCR 文字、樣本 ID 或照片。
- 影像變體只用來診斷可能的反光／防偽色彩干擾，不修改圖片或訓練資料、不修改 PP-OCRv5 正式流程、D-103、台胞證或身分證。模型預設 `v3-cht` 使用 RapidOCR v4-traditional 路由（實為 PP-OCRv3 繁體字權重），也可切換 `v6-small`。
- OCR boxes 是模型自己預測的幾何，非人工真值標註框；不能據此證明 Detection 漏掉正確姓名。固定 Validation 失敗四張只用於診斷，任何產生的增益不可視為獨立泛化或正式 pipeline 準確率提高。正式基準仍護照 14/19、台胞證 13/13。
- Windows 原本有私人 RapidOCR 虛擬環境即可於 repo 根目錄執行：
  `python training/experiments/diagnose_passport_name_texture.py "<private-export.zip>" --production-index "<private-29-index.json>"`
- 尚未在使用者原主機執行，沒有任何真實辨識數字。禁止 GitHub Actions；私人資料不可上傳 GitHub／聊天。


## 2026-10-17 — D-105 人工覆核候選狀態接線
- 由既有 ocrPayloadJson 只抽取合法狀態 enum 到 ScanItemResponse.ChineseNameReviewStatus，待審核護照無候選時顯示簡短原因；suggested 沿用人工套用按鈕。沒有額外模型推論／個資輸出，也未更動正式 OCR。
- 此提交僅為端到端可觀測性改進，尚待 Windows verify:ocr、Docker build 與四張授權護照測試。不宣稱準確率上升。


## 2026-10-17 — D-106 護照簡體 OCR 自動轉繁體顯示
- 正式護照 nameZh 採既有單義簡→繁轉換（含臺灣姓名常見 温→溫 的顯示正規化），nameZhOnDocument 與原始 OCR payload 保留原樣。PP-OCRv3 第二模型建議也先安全轉繁再進既有 MRZ strict comparator；一對多映射不自行猜。沒有修改模型、影像、固定 Validation 或台胞證流程。
- 待 Windows npm verify:ocr / Docker build 與真實證件人工確認，不能宣稱識別準確率改善。


## 2026-10-17 — D-107 既有護照審核欄位繁體轉換入口修正
- 使用者反饋 D-106 後待審核護照仍顯示 温、砚。根因：TourDetailPage watch(currentDocument.scanItemId) 初始化表單僅針對台胞證做繁轉；護照直接使用資料庫先前持久化的 nameZh。補上 PENDING 護照表單入口的唯一對應簡轉繁，保留已審核記錄及原始 OCR 證據，不改其他證件與第二模型門檻。
- 尚待使用者 Windows npm verify:ocr / build 與待審核 UI 實測；不能宣稱自動 OCR 準確率上升。


## 2026-10-17 — D-108 第二模型匿名候選流失計數
- 候選源 service 輸出 candidateCount、ambiguousScriptCount、scriptConvertedCount、compatibleCandidateCount。批次掃描只寫有限數量到私人 OCR payload；後端 ScanItemResponse 只提供匿名中文計數字串；待審核護照姓名區下方一行顯示，不新增測試按鈕、不暴露實際 OCR candidate。已審核不顯示。
- 重要限制：candidateCount 是通過 plausible 過濾後的候選數，不是 OCR 原始框數或可證明 Detection/Recognition 根因的數據。真實照片掃描與 Windows 編譯仍待跑，禁止宣稱準確率提升。


## 2026-10-17 — D-109 第二模型狀態缺席的根因可見化
- 已確認 D-108 的匿名候選計數只在 secondaryChineseNameReview.attempted=true 時出現；舊資料或未執行完全沒提示，容易誤判。後端 ScanItemResponse 已把缺少紀錄標記 legacy-no-record，attempted=false 標記 not-attempted；審核頁僅對待審核護照顯示短句，不輸出任何 OCR 候選、個資或原文。
- 這是舊資料可觀測性修正，不是 OCR 模型救回。使用者提供的完整資料頁不可再誤判成簽名頁；潘姵君仍需另查辨識候選。保持 PP-OCRv5 正式 selector 與台胞證 13/13，不宣稱準確率提升。


## 2026-10-17 — D-110：第二模型四張候選缺失的本機 comparator 稽核工具
- 新增 training/experiments/audit_passport_secondary_candidates.py。僅讀私人 Validation ZIP 和 .29 本機錯誤索引，RapidOCR v3-CHT 對四張樣本執行 broad VIZ，將姓名候選送進既有 frontend/scripts/eval-v6-mrz-candidates.mjs 正式 comparator，輸出匿名 Validation 序號、正確姓名是否曾出現在 raw row，以及 comparator 匯總；不印出姓名、樣本 ID、影像或原始候選。
- 明確限制：Python 使用 v6 detector，瀏覽器 D-103 使用 v5 detector；此工具只能區分離線候選與 MRZ comparator 假設，不會重建 browser 的 6 個候選，也不能稱已救回潘姵君。D-103 selector 與 .29 正式基準完全不變。不執行 GitHub Actions。


## 2026-10-17 — D-111：用私人 Train 分組做 v6 Small vs v3-CHT 配對辨識 A/B（待本機執行）
- 先前離線 Validation 四張補救證據顯示 v3 有 2 張 exact OCR row，但 strict MRZ 唯一候選曾錯選 1 張、救回 0 張。停止在固定 Validation 反覆調 selector，也不放寬拼音門檻。
- 新增 training/experiments/compare_passport_recognition_train.py，**只讀 splits/train.jsonl（record.split=train 且 documentType=PASSPORT）**，同一張 broad VIZ ROI 分別用 RapidOCR PP-OCRv6 Small 和 PP-OCRv3 Traditional Chinese Mobile recognition 比較 raw exact、原有 truth-blind spatial gate 唯一正確／錯誤／棄權、paired v6-only / v3-only / both / neither、median runtime。僅輸出匿名統計，不輸出圖片、OCR 原文、姓名或任何識別碼。
- 嚴守：這不是可證明瀏覽器 D-103 的 PP-OCRv5 detector 行為，也不作正式 14/19、13/13 成績宣稱。只有 train 組表現有穩定互補、且錯選風險可控，才另提出隔離 browser-compatible recognition 候選驗證；固定 Validation/Test 最終獨立留用。不能以這份結果直接改正式 PP-OCRv5 或增加 fallback。
- Windows (private ZIP only): `python training/experiments/compare_passport_recognition_train.py "$HOME\\Downloads\\ocr-training-dataset-20261017-051947.zip"`。若 train 組沒有護照，直接記錄不能實測，不拿 Validation 冒充。禁止 Actions。


## 2026-10-17 — D-112：Train A/B 選取器全棄權的評估歸因（待本機驗證）
- D-111 86 張 Train 護照：v6 Small raw exact 77/86、v3 CHT 42/86、v6-only 35、v3-only 0，兩模型 spatial gate 均 86/86 棄權；不能把棄權直接當模型失敗。
- 在 train-only 比較工具增加匿名 metadata_missing、metadata_count_mismatch、no_ocr_rows、standalone Han row count，以及三個**唯讀** gate ablation（無 label 錨點、無 upper ROI、兩者皆無）的 unique_correct / unique_wrong / ambiguous。保留原正式 gate 指標，對所有模型使用相同評估。這僅用來找出棄權原因，不允許將 ablation 接入正式姓名選取器。
- 重新跑 Train 86 張即可，不重跑固定 Validation，也不加 UI、影像規則或拼音 fallback。PP-OCRv5 正式 14/19、台胞證 13/13 均不變。Windows runtime 待執行；不啟動 GitHub Actions。


## 2026-10-17 — D-113：護照雙語姓名標籤與姓名下一行的純離線定位對照
- D-112 Train 86 張表明 v6 raw exact 77、v3 42，metadata 缺失 0；現有 label-only anchor 0/86，但去除錨點仍會產生錯選，故**禁止直接取消定位門檻**。
- 新增 train A/B 中獨立 `bilingual_label_*` 診斷分支：識別護照常見 `姓名 / Name (Surname, Given names)` 的 OCR 文字形式，容許姓名位於標籤下方相鄰行；既有預設 `propose_names` 未修改行為，新增 `passport_label=False` 僅在 D-111 train-only A/B 明確啟用。
- 分別輸出唯一正確、唯一錯誤、歧義與無候選次數；若新定位增加錯選或無收益即停止，不上線。這不是 v6 browser runtime，仍未驗證 v6 model 的 JS SDK metadata / preprocessing / decoder 相容性；不應把 v6 ONNX 當 v5 權重直接替換。正式 .29 護照 14/19、台胞證 13/13 不變；無 Actions、無證件內容上傳。


## 2026-10-17 — D-113 語法錯誤修復
- 使用者於原本 Windows .venv 執行 train A/B 回報 TRAIN_AB_FAILED: SyntaxError。確認 D-113 的 training/experiments/v6_name_gate.py 被字串替換操作破壞（未終止 regex、重複函式及多餘括號），不是虛擬環境問題。
- 改從 D-112 的乾淨版本重建檔案，保留唯一 propose_names；雙語標籤支援僅在 passport_label=True 啟用。已於隔離 Python 驗證相同 regex / bilingual geometry 基本測試及語法，但未在使用者私有 ZIP 執行 86 張 Train，不能宣稱 A/B 結果或正式準確率改善。
- 後續使用 python -m py_compile 做單檔語法 gate；不需 npm 或 Docker，不啟動 GitHub Actions。


## 2026-10-17 — D-114：PP-OCRv6 Small browser review-only 方案（未經 Windows runtime 驗證）
- 經查 @paddleocr/paddleocr-js@0.4.2 已內建 ocrVersion=PP-OCRv6 及 small detector/recognizer，無須自己改 v5 字典；參考 https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md。
- 在 frontend/src/services/passportV6ChineseNameReviewCandidate.ts 建立獨立 v6 Worker（PP-OCRv6_small_det + PP-OCRv6_small_rec），只取代原 D-103 的護照 review-only 第二來源，PP-OCRv5 正式掃描流程未改。原 v3 service 和模型仍保留可回退。
- Docker 使用固定鏡像修訂 e6fe11f 的 v6 det/rec ONNX tar，重新封裝成本機模型資產，檢查模型名稱及 tar 結構。只有在實際 Windows Docker build、browser Worker runtime 成功後可認定可用。固定上游 revision 不等於已取得本地 SHA 校驗證據，後續應記錄實際哈希。
- 與既有 D-103 完全同一安全政策：僅 PP-OCRv5 未有 reliable Chinese name + MRZ 存在時執行；只有唯一 strict-compatible 才提出人工審核 suggestion，不能改 result.chineseName 或 traveler.nameZh。錯誤時 unavailable，台胞證／身分證不受影響。
- Train 86 張的 v6 raw exact 77/86 不是正式準確率；bilingual A/B 22 correct、1 wrong，故不允許無人覆核自動採用。正式 .29 保持護照 14/19、台胞證 13/13。必須驗證已知困難姓名及已正確樣本無回歸，再談 19/19。


## 2026-10-17 — D-115：雙頁縱向護照 v6 下半頁姓名候選補救（待 Windows 實測）
- 使用者提供的真實拍照是上下兩頁同框；D-114 固定 broad VIZ ROI x=.24..98 / y=.12..70，中文姓名位在 ROI 下緣，實際 v6 僅有 1 候選、MRZ 相容 0。
- 僅對長高比 >=1.2 的護照照片，且第一次 v6 沒有 strict-compatible 姓名時，再在 x=.16..96 / y=.43..81 做一次有界高品質 crop 的 v6 OCR；只有重試得到**唯一 strict-compatible** 才回傳人工 suggestion，否則保留第一次的無候選結果。不增加正式 PP-OCRv5 推論次數，不修改正式姓名欄、台胞證或身分證，也不加入自動採用。
- 本次只是一項有真實畫面依據的可逆補救，不能聲稱能辨出潘姵君或提升固定 14/19。仍需 Windows npm verify:ocr 與 4 張原本失敗護照端到端實測，統計實際 suggestion 正確與否；錯選即停止此策略。不啟動 GitHub Actions。


## 2026-10-17 — D-116：人工審核儲存後人物分組跳動修復
- 使用者實測：填入完整護照中文姓名，按「儲存審核」後彈窗於 5 筆與 2 筆護照分頁群組跳動，已審核勾選數增加。根因是 saveReview(false) 執行 reviewScanItem + reloadQueue 後，依新姓名合併結果重新綁定 updatedParent；此時人物分組可能變化。
- 修正「儲存審核／儲存修改」成功後刷新 queue 並關閉彈窗，不再默默跳到另一人物分組；「儲存並審核下一位」仍走明確 next 流程，失敗時保留錯誤訊息，不改 DB 合併政策、OCR、照片或個資。
- 加入 source regression guard，仍待 Windows verify:ocr 與前端實際操作驗收；未聲稱 OCR 精準度提升。GitHub Actions 禁止啟動。


## 2026-10-17 — D-117：同一旅客多份證件審核頁籤版本顯示
- 原審核視窗六個護照頁籤只標「護照」，使用者無法分辨資料來源的新舊。根據現有 ScanItemResponse.createdAt 與 scanItemId 穩定排序同證件類型掃描紀錄，顯示第 N 版、最新掃描；對當前頁加一行 版本 N/總數說明。
- 僅前端顯示，不更改資料庫主檔、document_versions、人工審核與去重政策。不把「最新上傳」當「最新核發／有效」；核發時間並非目前欄位。待 Windows build 與瀏覽器操作驗收。


## 2026-10-18 — D-118：相同實體護照的精確分組補救（待本機驗證）
- 發現 ReassignReviewedItem 在 nameZh 已填時，FindDraftMatches 只用中文姓名，不再比較相同護照上的英文姓名，造成先掃空白後人工補正時同一本護照的掃描被拆成不同 draft person。
- 新增審核時強證據補救：同團別、護照類型、非空且完全相同護照號碼、英文姓名、生日、性別，且只有唯一其他 draft ID、有效身分證號無衝突時，才將目前 scan item 指回該 draft。任一條件不滿足維持原行為，不使用模糊字形或單純姓名合併。
- 此項是後續人工審核／重新儲存時的 draft 分組修正，**不會偷偷合併過去已審核的正式 traveler 主檔，也不會自動修改舊掃描**；既有重複的正式旅客需另外安全更正流程。正式 OCR、台胞證不變；Windows dotnet build / 端到端覆核待驗證。


## 2026-10-18 — D-119：既有手動旅客合併加入姓名衝突保護
- 發現既有 TravelersPage 與 PostgresTravelerStore.MergeTravelers 已有正式人工合併流程，會保留並搬移證件版本、團別關聯、掃描草稿。因此不再新增重複 Merge API。
- 現有阻擋僅依出生日期、性別、身分證號衝突，可能誤把同生日同性別但英文／中文姓名不同的兩人合併。新增**前端及後端一致的保守檢查**：兩筆都有非空英文姓名但不同（忽略 ASCII 大小寫）、或都有非空中文姓名但不同，阻擋合併並要求先人工核實修正。任一方缺中文姓名仍可沿用原明確人工確認流程（例如 OCR 當初空白者）。
- 不自動更動既有旅客／資料庫，也不為已審核資料執行自動合併。正式主檔合併必須使用既有旅客頁手動操作；仍待 dotnet build、npm build 與完整端到端測試。未碰 OCR，也不宣稱 19/19。


## 2026-10-18 — D-120：PP-OCRv6 標籤黏連姓名候選補救（僅人工覆核）
- 發現目前 shared extractPassportChineseNameCandidatesForProbe 遇到同列 `姓名XXX` 時直接由 isPlausibleTaiwanChineseName 的標籤排除規則拒絕，可能在進 MRZ 比對之前丟失正確姓名。
- 新增 v6-only `extractPassportV6ReviewCandidates`：只接受 OCR 原始列或現有文字列明確以 `姓名`／`中文姓名` 開頭且**其後恰好 2–4 個漢字**的格式；保持原候選管線，合併去重、既有簡繁與 strict MRZ 過濾。不加入人名答案、寬鬆拼音或新影像 ROI。
- v6 一律只產生人工建議，PP-OCRv5 正式 selector 與台胞證不變；不能聲稱正式 14/19 已提高。提交後須本機 verify:ocr、Docker 與新一批有授權護照真實驗收。Actions 不執行。
