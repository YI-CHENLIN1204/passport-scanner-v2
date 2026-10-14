# Passport Scanner V2 — Documentation Map

這個目錄同時保存「目前系統設計」與「開發迭代歷史」。如果是第一次閱讀，建議先看前半部的 reviewer-oriented 文件。

## 建議閱讀順序

1. [System Architecture](./SYSTEM_ARCHITECTURE.md) — 系統邊界、前後端與 OCR / persistence 架構
2. [Data Model](./DATA_MODEL.md) — Traveler、Document Version、Tour 等資料模型
3. [OCR Requirements](./OCR_REQUIREMENTS.md) — 各證件實際需要辨識與驗證的欄位
4. [OCR PoC](./OCR_POC.md) — OCR 引擎與瀏覽器端推論驗證
5. [Project Decisions](./DECISIONS.md) — 重要設計決策與取捨
6. [Development Setup](./DEVELOPMENT.md) — 本機啟動與開發環境

## OCR / Validation 研究紀錄

- [Open-source OCR Review](./OCR_OPEN_SOURCE_REVIEW.md)
- [Model A/B Plan](./OCR_MODEL_AB_PLAN.md)
- [Passport Review Contract](./PASSPORT_REVIEW_CONTRACT.md)

這些文件會保留成功、失敗與沒有改善的實驗結果，避免只展示成功案例。

## 開發歷史與交接

- [Worklog](./WORKLOG.md)
- [Handoff](./HANDOFF.md)
- [Next Chat Handoff](./NEXT_CHAT_HANDOFF.md)

這三份文件主要是開發過程的持續交接與實驗紀錄，可能包含已被後續版本取代的 baseline、當時的下一步與歷史 branch / PR 狀態；**不應把其中任一舊段落單獨視為目前正式功能規格。**

目前對外功能與架構請以 repository 根目錄的 [README](../README.md)、最新 [DECISIONS](./DECISIONS.md) 與實際 `main` source code 為準。
