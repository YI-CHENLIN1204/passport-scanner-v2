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
