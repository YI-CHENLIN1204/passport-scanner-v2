# OCR 現行模型選擇與決策總覽（2026-10-16）

此頁是最新決策入口。歷史實驗保留在 docs/WORKLOG.md 和 docs/OCR_MODEL_AB_PLAN.md。嚴禁將 ROI 命中、shadow 或歷史 OCR 的結果稱為正式準確率。

## 實測基準

- 正式瀏覽器 PP-OCRv5 Mobile / pipeline 2026.10.11.29：護照整張 14/19（74%）；台胞證整張 13/13（100%）。19 張護照的 5 張錯誤均涉及中文姓名：4 張缺完整正確候選、1 張已有候選但遭一音節拼音衝突拒絕。
- 32 張固定 Validation 沒有台灣身分證樣本，因此不能宣稱身分證 100%。固定樣本 100% 也不代表新證件泛化 100%。

## 模型處置矩陣

| 模型／方法 | 實測證據 | 決定 |
| --- | --- | --- |
| PP-OCRv5 Mobile（Browser） + .29 parser | 護照 14/19、台胞證 13/13 | 保留正式主線 |
| PP-OCRv5 Server Recognition WASM | 同樣本救援尚無正收益，單張伺服器 Worker 曾約 63 秒 | 暫停，已從品質頁移除舊按鈕 |
| Tesseract chi_tra | 四張缺候選樣本 0 救回 | 暫停，已移除按鈕 |
| RapidOCR PP-OCRv6 Small（Python ONNX Runtime） | 19 張護照 ROI 有 14 standalone exact、2 substring；四張 .29 缺候選樣本額外辨出 1 張完整正確中文姓名 | 保留離線候選研究，尚非正式整張救援 |
| v6 無錨點全 ROI 姓名選擇 | 19 張中 12 對、3 錯、2 歧義、2 無候選；四張缺候選 1 對、3 錯 | 拒絕自動選取 |
| v6 姓名標籤閘門 | 19/19 無候選 | 停止單純調位置／標籤 |
| v6 + 歷史 OCR 英文整串拼音 | 四張缺候選 0 救回、2 錯 | 淘汰 |
| v6 + 正式 nameRomanization.ts 與當次 .29 MRZ | 五張錯誤護照 2 個 compatible：0 對、2 錯；四張缺候選同樣 0 對、2 錯 | 禁止部署為自動 selector |

## 下一階段：基於根因提高準確率

1. 對五張錯誤護照進行匿名的 detection / recognition / 文字框拼接 / selector 拒絕原因分桶；沒有足夠證據時保留 unknown，不猜錯誤來源。
2. 在本機人工檢查影像品質和 ground truth：模糊、眩光、偏斜、姓名框裁切、身份樣本重複；不得暗中修改答案或移動固定 Test。
3. 只有新辨識器在已確認的四張缺候選樣本實際增加正確候選、又能在不知道標準答案的條件下安全選出，才進入候選人工覆核試行。禁止將錯選的 v6 方案接入正式流程。
4. 評估速度時分開記錄 warmup、detect、recognize、postprocess 及 backend。不能把 native Python 與 browser WASM 的速度直接等同。
5. 整合前重跑正式 19 張護照、13 張台胞證全部欄位回歸，再用獨立 Test 和新拍攝護照評估。不得為達到固定 Validation 100% 而降低保守性。

## 每項模型或規則改動的記錄契約

每個決定必須附上：假設及問題、選用與淘汰方案及原因、實測樣本分組/後端、baseline 與 candidate 正確/錯選/耗時、安全與個資影響、狀態（構想/離線實驗/正式啟用/淘汰）、回滾門檻、相關 commit。更新 docs/DECISIONS.md、docs/WORKLOG.md、docs/OCR_MODEL_AB_PLAN.md、docs/NEXT_CHAT_HANDOFF.md；純文獻另更新 docs/OCR_OPEN_SOURCE_REVIEW.md。沒執行的測試標為待測，不得稱已通過。

維持 main 集中開發，不啟動 GitHub Actions，不提交私人證件照片、標準答案、MRZ 英文姓名或個人識別碼。
