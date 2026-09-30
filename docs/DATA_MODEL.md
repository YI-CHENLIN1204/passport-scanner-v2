# Data Model

本文件描述目前已確認的概念模型；實際 SQL schema 尚未完全凍結。

## traveler_master

用途：保存「旅客本人」的穩定主檔，避免每次出團都建立重複的人。

候選核心欄位：

- traveler_id
- name_zh
- name_en
- birth_date
- gender（若保留）
- nationality
- personal_id_type
- personal_id_number
- phone / contact 資料（若由其他流程取得）
- created_at
- updated_at

### personal_id_type / personal_id_number

用來表示旅客主要個人識別證件，不把系統寫死成只有台灣身分證。

例如：

- TW_ID
- PASSPORT
- 其他未來必要類型

外國旅客若沒有台灣身分證相關欄位，應允許 NULL，不可硬填台灣格式。

## document_versions

用途：同一旅客可能換發新護照／新台胞證，因此不能只覆蓋舊資料。

候選核心欄位：

- document_version_id
- traveler_id
- document_type
- document_number
- issuing_country
- nationality
- issue_date
- expiry_date
- birth_place（若最終確認保留）
- version_status / is_current
- verified_at
- created_at

原則：

- 新證件可以建立新版本。
- 不應因新證件上傳就無條件覆蓋歷史版本。
- 是否把 OCR 原始輸出長期保存，另行決定。

## 團別 / 訂單旅客關聯

團別資料與 traveler_master 分開。

概念關係：

```text
Tour / Product
   │
   └── TourTraveler / BookingTraveler
           │
           └── traveler_master
                    │
                    └── document_versions
```

團別／訂單旅客記錄「這一次出團的人」，traveler_master 記錄「這個人」，document_versions 記錄「這個人曾經使用過哪些版本的證件」。

## 訂購人

既有業務構想：

- 同名 + 手機末四碼可作為人工分組／尋找訂購人的輔助條件。
- 「是否為訂購人」可作為訂單關係欄位，而不是證件 OCR 欄位。

這部分屬訂單／金流管理，不應混入 OCR 模型本身。


## V2 護照持久化規則（資料庫前可逆實作）

目前已先透過 `ITravelerStore` 建立資料層邊界。正式資料庫尚未選定時，開發環境使用 `InMemoryTravelerStore` 驗證完整版本邏輯；後端重啟後資料會清空，因此不能視為正式保存。

### 旅客辨識／版本判斷

護照人工覆核完成後：

1. 先以「護照號碼 + 簽發國」找 document version。
   - 找到：更新該版本的覆核／有效資訊，不建立重複版本。
   - 若該版本原本已不是 current，重新掃描不會把舊護照偷偷切回 current。
2. 若沒有同一本護照，再以「英文姓名 + 出生日期 + 國籍」找 traveler。
   - 找到唯一一位：視為同一旅客的新護照，建立新的 document_version；舊護照版本改為非 current。
   - 找不到：建立 traveler_master + 第一個 document_version。
   - 找到多位：回傳 conflict，不自動合併，未來由人工選擇旅客。

此比對故意採保守 exact match，不做模糊姓名自動合併。

### 第一版概念約束

未來 SQL schema 應至少能表達：

- `document_type + issuing_country + document_number` 不應重複建立相同證件版本。
- 同一旅客同一證件類型只能有一個 current version。
- document_versions 必須保留歷史版本。
- traveler_master 與 document_versions 的建立／切換 current 應在同一 transaction 中完成。
- 重複旅客合併不可只靠模糊姓名自動執行。

正式資料庫選定後，以這些業務規則替換 `InMemoryTravelerStore`，不改前端 `PassportReviewDraft` contract。
