# OCR PoC

最後更新：2026-09-29

## 目的

先證明「證件影像可以在瀏覽器內完成 OCR 推論」，並量測第一輪可用性，不急著把某一個 OCR 引擎定為正式方案。

## Baseline A：Tesseract.js 7

目前第一個 PoC 使用 Tesseract.js 7。

用途：

- 驗證瀏覽器端 Web Worker / WebAssembly OCR 流程。
- 測第一次模型載入時間。
- 測第二次以後的辨識時間。
- 觀察護照英文文字與 MRZ 的原始辨識效果。
- 建立可比較的 baseline。

限制：

- 此方案不是目前正式 OCR engine。
- Tesseract.js 本身不提供在瀏覽器內訓練／微調辨識模型的能力。
- 第一次執行時會下載 OCR runtime / language data；證件影像本身不會因此上傳到後端 API。
- 現階段只測護照，不同時加入身分證與台胞證。

## 目前 UI 輸出

每次測試會顯示：

- OCR 進度。
- 本次耗時。
- Raw OCR text。
- 從 raw text 中抓出的 MRZ candidate lines。

第一版 baseline 的 MRZ candidate 只是簡單字串篩選。第二版已加入：

- 自動裁切護照底部 MRZ 區域。
- 灰階與對比前處理。
- MRZ 專用 OCR pass。
- 字元白名單：A-Z、0-9、<。
- TD3 2 × 44 格式檢查。
- 護照號碼、出生日期、有效期限、個人號碼與 composite check digit 驗證。

只有在 MRZ 形成完整 2 × 44 時才進入正式欄位解析，不會為了湊格式任意補字。

## 下一個比較方向

若 baseline 不足，下一階段優先比較：

- ONNX Runtime Web。
- 可轉 ONNX / 可自行訓練的 PaddleOCR 類模型。
- WebGPU 與 WASM 執行差異。
- 是否值得針對護照、台灣身分證、台胞證建立各自模型／前處理流程。

## 評估時要記錄

至少記錄：

1. 使用的證件類型。
2. 圖片尺寸／檔案大小。
3. 第一次辨識時間。
4. 第二次辨識時間。
5. 姓名是否正確。
6. 護照號碼是否正確。
7. 出生日期是否正確。
8. 有效期限是否正確。
9. 國籍是否正確。
10. MRZ 是否完整。
11. 明顯錯字與錯誤類型。

正式方案不是只比較「哪個 OCR 看起來辨識字比較多」，而是比較真正需要的欄位準確率、速度、模型大小與可訓練性。


## Baseline A 實測紀錄

### 測試 1：整頁 OCR（同一張護照）

- 第一次辨識：約 3.81 秒。
- 第二次辨識：約 0.56 秒。
- 兩次都抓到 2 行 MRZ candidate。
- 第二次結果與第一次大致一致。
- 判斷：第一次時間主要受 OCR worker / model 初始化影響；同一頁面重用 worker 後，連續辨識速度明顯提升。

### 下一個實驗

同一張測試護照改跑「整頁 OCR + MRZ 專用 OCR」。

要觀察：

1. MRZ 專用 pass 是否能穩定產生兩行各 44 字元。
2. 護照號碼 check digit 是否通過。
3. 出生日期 check digit 是否通過。
4. 有效期限 check digit 是否通過。
5. composite check digit 是否通過。
6. 新增 MRZ pass 後的總耗時。

若格式與 check digit 仍不穩定，再比較更進一步的影像前處理或第二個 OCR engine。


### 測試 2：MRZ 第二行驗證成功

同一張測試護照在「整頁 OCR + MRZ 專用 OCR」流程中：

- 總耗時：約 1.25 秒。
- 整頁 OCR：約 0.69 秒。
- MRZ 專用 OCR：約 0.22 秒。
- 第二行 MRZ 已形成 44 字元。
- 護照號碼 check digit：通過。
- 出生日期 check digit：通過。
- 有效期限 check digit：通過。
- composite check digit：通過。

判斷：

- 護照號碼、出生日期、有效期限與第二行中的其他核心欄位，已具備可由 MRZ check digit 驗證的高可信度路線。
- 目前主要剩餘問題集中在第一行姓名區。
- 第一行若 MRZ 專用 OCR 漏掉，允許從整頁 OCR 的 P<... 候選 fallback，再只針對尾端 filler 做 TD3 規則正規化。
- 第一行姓名沒有與第二行相同層級的完整 check digit 保護，因此即使結構補成 44 字元，姓名仍需人工覆核。


### 測試 3：Line 2 已穩定，Line 1 僅剩結構正規化

同一張測試護照後續結果：

- 總耗時：約 1.02 秒。
- 整頁 OCR：約 0.65 秒。
- MRZ 專用 OCR：約 0.20 秒。
- Line 2：44 字元。
- 護照號碼、出生日期、有效期限、composite check digit：全部通過。
- Line 1：OCR 輸出約 50 字元，主要是尾端 filler / artifact 導致超長。

決策：

- Line 2 視為目前護照核心數字欄位的主要可信來源。
- Line 1 只做 TD3 結構正規化：確認從 P< 起始後，超過 44 字元就截至 44；若不足 44，只有在已偵測到 filler tail 時才補 <。
- Line 1 結構完成不代表姓名驗證成功；英文姓名仍需人工覆核。
- 修正一個 UI / result bug：mrzLine1Source 原本有計算但未回傳，且 parseTd3Mrz 呼叫參數曾多傳一個值。


### 測試 4：單張護照 TD3 結構完成

同一張測試護照最終結果：

- TD3 2 × 44：結構完成。
- Line 1 / Line 2：44 / 44。
- Line 1 來源：MRZ 專用 OCR。
- 護照號碼 check digit：通過。
- 出生日期 check digit：通過。
- 有效期限 check digit：通過。
- composite check digit：通過。
- 英文姓名：仍需人工覆核。
- 一次實測總耗時：約 1.70 秒；其中整頁 OCR 約 0.64 秒、MRZ 專用 OCR 約 0.20 秒。初始化時間會依頁面是否已載入 worker 而變動。

判斷：

- 目前這張護照已不再作為調參數依據，避免針對單一圖片過度最佳化。
- 下一階段改做 3～5 張不同拍攝條件的泛化測試。
- 泛化測試只記錄測試編號、速度、2 × 44 結構、Line 2 check digit 與 Line 1 OCR 來源，不在摘要顯示姓名、護照號碼等個資。


### 泛化問題：常見 OCR 字元混淆

不同護照測試中已觀察到：即使 MRZ 影像肉眼清楚，OCR 仍可能把形狀相近字元互相混淆，例如 O/0、I/1、L/1、Z/2、S/5、G/6、B/8。這可能造成護照號碼、出生日期或 composite check digit 失敗。

新增保守修正規則：

- 只在 MRZ 固定欄位型別允許的範圍內建立候選。
- 日期欄位只允許數字型修正。
- 護照號碼等英數欄位只處理已知形近字元。
- 只有「唯一一個候選」能通過該欄位 check digit 時，才自動採用。
- 無唯一解、候選過多或仍無法通過時，不自動修改，交由人工覆核。
- 修正完成後仍須重新計算 composite check digit。
- UI 只顯示修正字元數，不在摘要暴露完整證件值。

Line 1 若只缺少尾端 filler，且已辨識出 TD3 的姓名分隔符 <<，允許補足至 44 字元；這只補 filler，不更動姓名字元，因此姓名仍標示人工覆核。


### 泛化測試結果：固定底部 24% 不足

在不同護照／不同拍攝條件測試中觀察到：

- 單張既有測試可達 44 / 44 且 Line 2 關鍵 check digit 全部通過。
- 另一張護照即使 MRZ 裁切肉眼清楚，OCR 仍可能讀錯部分字元。
- 一次批次測 5 張時，固定底部 24% 的策略曾出現 0 / 5，且 Line 1 / Line 2 皆無候選。

因此不再把 MRZ 位置固定寫死為單一比例。新增 adaptive MRZ recognition：

1. 先從整頁 OCR 蒐集 MRZ 候選。
2. 依序嘗試底部 24%、32%、40% 的裁切範圍。
3. 在 24% 裁切另試 Otsu threshold ±18 的二值化變體。
4. 每個變體同時嘗試單行 OCR 與整塊 MRZ OCR。
5. 所有 Line 2 候選以 TD3 check digit 通過數量評分，而不是只用「接近 44 字元」選擇。
6. 一旦 Line 2 四個關鍵檢查碼全部通過且 Line 1 為 44 字元，就立即停止後續嘗試。
7. UI 顯示實際 MRZ 嘗試次數與最終裁切比例，方便泛化測試。
8. 受限字元修正仍只是輔助；優先改善 OCR 輸入與候選選擇，不靠猜值湊過檢查碼。


## Baseline B：PaddleOCR.js / PP-OCRv5

啟動原因：

- Baseline A（Tesseract.js）曾在單一測試護照達成 TD3 44 / 44 且 Line 2 四個關鍵 check digit 全部通過。
- 但不同護照／拍攝條件下，即使嘗試多個 MRZ 裁切與二值化版本，仍出現 Line 1 不完整、Line 2 check digit 失敗的情況。
- Adaptive Tesseract 測試在某張不同護照上執行 5 次 MRZ 嘗試後仍未完成 TD3 結構，且 MRZ OCR 耗時上升，因此不再無限堆疊 Tesseract workaround。

Baseline B 採官方 `@paddleocr/paddleocr-js`，使用 PP-OCRv5 英文 OCR，在瀏覽器端完成文字偵測與辨識。

原則：

- Baseline A 保留，不刪除，作為 A/B comparison。
- Baseline B 與 A 使用同一張 Step 2 護照圖片。
- 證件圖片不送到 ASP.NET Core API。
- 第一次使用需要下載 PaddleOCR / ONNX Runtime / 模型資源；模型下載不等於證件圖片上傳。
- Baseline B 的摘要只顯示耗時、辨識區塊數、MRZ 44 / 44、check digit 與 OCR 信心，不顯示完整證件值。
- Tesseract 的 check-digit validation / 保守字元修正函式共用給 PaddleOCR 結果，確保比較的是 OCR engine 差異，而不是不同驗證規則。
- 先做單張 A/B；若 Baseline B 明顯改善第二張困難護照，再擴充 Baseline B 批次泛化測試。


### Baseline A vs Baseline B：同一張困難護照

同一張先前在 Tesseract adaptive MRZ 流程仍失敗的護照，A/B 結果如下：

Baseline A（Tesseract.js）：
- 總耗時：約 6.82 秒（其中初始化約 3.63 秒）。
- 整頁 OCR：約 0.59 秒。
- MRZ 專用 OCR：約 1.97 秒。
- MRZ 嘗試：5 次。
- Line 1 / Line 2：32 / 44。
- 護照號碼：通過。
- 出生日期：失敗。
- 有效期限：通過。
- composite check digit：失敗。
- TD3 2 × 44：未完成。

Baseline B（PaddleOCR.js / PP-OCRv5）：
- 首次初始化：約 2.58 秒。
- 本次推論：約 3.39 秒。
- 辨識文字區塊：36。
- Line 1 / Line 2：44 / 44。
- 護照號碼：通過。
- 出生日期：通過。
- 有效期限：通過。
- composite check digit：通過。
- 平均文字信心：約 91.7%。
- runtime：WebGPU available 且 detection / recognition provider 均為 webgpu。

暫時判斷：

- PaddleOCR.js / PP-OCRv5 目前是護照 OCR 的主力候選。
- Tesseract.js 保留作 baseline 與 fallback 研究，不再作為主要優化方向。
- 尚未正式凍結 OCR engine；必須先完成 3～5 張甚至更多不同拍攝條件的 PaddleOCR 泛化測試。
- 若 PaddleOCR 泛化測試仍維持高結構完成率與 check digit 通過率，再把護照人工覆核畫面接到 PaddleOCR pipeline。


### Baseline B 批次測試：Failed to fetch 修正

首次 Baseline B 批次測試出現 5 / 5 全部 `Failed to fetch`，且每張推論時間皆為 0 秒。這代表失敗發生在 PaddleOCR 模型／runtime 資源初始化階段，而不是 OCR 推論本身。

找到兩個應用程式層問題：

1. 共用的 `paddlePromise` 一旦初始化失敗，原本會一直維持 rejected 狀態，使後續每張圖片都立即重複失敗，直到重新整理頁面。
2. PaddleOCR.js 官方 `predict()` 原生支援圖片陣列，但原本批次 UI 卻逐張呼叫單張推論，沒有使用 SDK 的原生 multi-image batch。

修正：

- 初始化失敗時立即清除 rejected promise / instance，使下一次按鈕操作可以重新下載與初始化。
- 對 `Failed to fetch` 類暫時性網路錯誤，自動等待後重試初始化一次。
- Baseline B 批次改成一次呼叫 `predict([file1, file2, ...])`，共享同一個模型 instance 與同一次 batch inference。
- 若整個 batch 初始化失敗，只在批次區顯示一個整體錯誤，不再產生 5 張假的「OCR 失敗」結果。


### Baseline B 泛化測試：3 / 5 完整通過

同一批 5 張護照的 PaddleOCR.js / PP-OCRv5 batch 結果：

- 完整通過：3 / 5。
- 測試 1：TD3 完成、Line 2 check digit 全部通過、平均文字信心約 80.9%。
- 測試 2：TD3 完成、Line 2 check digit 全部通過、平均文字信心約 82.1%。
- 測試 3：未完成，沒有可用平均文字信心。
- 測試 4：未完成，沒有可用平均文字信心。
- 測試 5：TD3 完成、Line 2 check digit 全部通過、平均文字信心約 91.1%。

ONNX Runtime Console 中出現的 unused initializer / execution provider assignment 訊息屬 runtime warning，不視為 OCR failure。

下一個診斷：

- 新增 PaddleOCR 原生 metrics：`detectedBoxes` 與 `recognizedCount`。
- 若失敗圖片 `detectedBoxes = 0`，優先處理文字 detection / 圖像定位。
- 若 `detectedBoxes > 0` 但 `recognizedCount = 0` 或很低，才考慮 recognition threshold / recognition pipeline。
- batch UI 的每張推論時間目前是整批總推論時間除以張數的估算，已明確標示為「平均每張推論（批次估算）」。


### Baseline B 泛化診斷：失敗集中在 Detection

同一批 5 張再次測試後：

- 測試 1：Detection 61、Recognition 61，TD3 完成，Line 2 check digit 全部通過，平均文字信心約 80.9%。
- 測試 2：Detection 61、Recognition 59，TD3 完成，Line 2 check digit 全部通過，平均文字信心約 82.1%。
- 測試 3：Detection 0、Recognition 0，TD3 未完成。
- 測試 4：Detection 0、Recognition 0，TD3 未完成。
- 測試 5：Detection 38、Recognition 33，TD3 完成，Line 2 check digit 全部通過，平均文字信心約 91.1%。

因此測試 3、4 的主要問題已確定在 text detection，而不是 recognition threshold。

下一步：

- 若全頁 Detection=0，只在瀏覽器內自動裁切底部 45% MRZ 區域，再用同一個 PaddleOCR instance 重試一次。
- fallback 僅在 Detection=0 時啟動，避免增加已正常圖片的推論時間。
- UI 顯示是否使用 Detection fallback 與裁切比例。
- 批次推論改為模型只初始化一次、圖片逐張推論；每張之間主動 yield 給瀏覽器重繪。
- 新增動態執行進度條、目前處理張數與 fallback 階段提示，避免 GPU / OCR 推論期間畫面看起來像當機。


### Baseline B fallback 條件擴充：由 Detection=0 擴充到弱偵測

同一批 5 張在加入底部 45% MRZ fallback 後：

- 完整通過由 3 / 5 提升至 4 / 5。
- 測試 4 原本 Detection 0 / Recognition 0，fallback 後變為 Detection 34 / Recognition 33，平均文字信心約 93.4%，TD3 與 Line 2 check digit 全部通過。
- 測試 3 仍失敗，但其全頁結果僅 Detection 4 / Recognition 2，平均文字信心約 15.6%。因為舊 fallback 條件只判斷 Detection=0，所以沒有觸發。

因此 fallback 條件擴充為：

- TD3 尚未完成；
- Line 2 關鍵 check digit 尚未全部通過；
- 且符合任一弱訊號：Detection < 10、Recognition < 5、平均文字信心 < 50%。

符合時才改試底部 45% MRZ 裁切。健康圖片不增加額外推論成本。


### Baseline B 泛化測試達成 5 / 5

在弱偵測 fallback 條件加入後，同一批 5 張不同護照／拍攝條件結果：

- 測試 1：通過。TD3 2 × 44 完成、Line 2 check digit 全部通過、Detection 61 / Recognition 61、平均文字信心約 80.9%、未使用 fallback。
- 測試 2：通過。TD3 2 × 44 完成、Line 2 check digit 全部通過、Detection 61 / Recognition 59、平均文字信心約 82.1%、未使用 fallback。
- 測試 3：通過。原全頁為弱偵測，啟用底部 45% fallback 後 Detection 36 / Recognition 36、平均文字信心約 88.6%、TD3 與 Line 2 check digit 全部通過。
- 測試 4：通過。啟用底部 45% fallback 後 Detection 34 / Recognition 33、平均文字信心約 93.4%、TD3 與 Line 2 check digit 全部通過。
- 測試 5：通過。TD3 2 × 44 完成、Line 2 check digit 全部通過、Detection 38 / Recognition 33、平均文字信心約 91.1%、未使用 fallback。
- 5 張皆沒有使用受限字元自動修正。

結論：

- PaddleOCR.js / PP-OCRv5 + MRZ check digit + weak-detection bottom-45% fallback，已通過目前 5 張護照的第一輪泛化測試。
- V2 護照 OCR 主引擎正式採用 PaddleOCR.js / PP-OCRv5。
- Tesseract.js 保留為 PoC / benchmark，不進正式護照 OCR 主流程。
- 下一階段不再以同一批圖片持續調準確率，避免過度最佳化；轉入正式欄位解析與人工覆核 UI。
- fallback 仍有明顯效能成本：本輪測試 3 約 19.82 秒、測試 4 約 10.70 秒；一般成功圖片約 1.7～2.4 秒。後續需獨立做效能優化，但不阻擋人工覆核流程開發。


### Regression：Line 2 全過但 Line 1 誤選一般頁面文字

實測發現一張護照的 Line 2 可完整通過 check digit，但舊 Line 1 候選規則誤把頁面上的 PASSPORT / 國家文字組合當成 MRZ 姓名行，造成英文姓名出現明顯錯誤。

根因：

- 舊規則只要求候選以 P 開頭並接近 44 字元。
- `normalizeTd3Line1` 對第二字元的 filler 修正過寬，可能把普通 `PASSPORT...` 文字修成假的 `P<...`。
- Line 2 check digit 與 Line 1 姓名沒有直接驗證關係，因此 Line 2 全綠不能證明姓名正確。

修正：

- `P<` 結構修正只有在候選本身已有 TD3 姓名分隔符 `<<` 時才允許。
- Line 1 必須符合：44 字元、`P<`、3 碼簽發國、姓名欄包含 `SURNAME<<GIVEN<NAMES`、姓名欄不得有數字。
- `parseTd3Mrz` 再次防禦性驗證 Line 1；無效 Line 1 不產生 parsed MRZ / 自動姓名。
- PaddleOCR 若 Line 1 不可信，即使 Line 2 已全部通過，也會觸發底部 MRZ crop fallback。
- UI 獨立顯示「MRZ 姓名行」可信狀態。
- 英文姓名增加強制人工目視確認勾選。


### Regression：中文姓名高 confidence 仍可能抓錯欄位

第一輪台灣護照 VIZ 中文姓名測試中，4 張僅 1 張自動姓名正確；其餘曾出現：

- 把護照固定中文字樣誤當姓名。
- OCR confidence 高達 95%～99% 但實際姓名仍錯。

結論：

- OCR confidence 只代表「模型對這串文字的辨識自信」，不能證明「這串文字屬於姓名欄」。
- 中文姓名不能再以整頁候選排名直接 autofill。
- 正式策略改為欄位定位優先、confidence 次要。

修正：

1. 台灣護照不再從整頁 OCR 直接填入中文姓名。
2. 整頁 OCR 只用來找「姓名」標籤座標與 MRZ 英文姓名。
3. 若找到「姓名」標籤，動態裁出姓名欄小區域並放大後重做 OCR。
4. 中文候選必須靠近「姓名」標籤，或位於 MRZ 已確認英文姓名的相鄰 Name group。
5. 動態欄位裁切失敗才退回較寬的 VIZ crop。
6. 沒有欄位錨點時不猜；低於保守信心門檻時不 autofill。
7. 無可靠結果時中文姓名留空，交由人工輸入與確認。

此策略優先降低 CRM 誤寫風險，即使因此提高少量人工輸入比例也可接受。
