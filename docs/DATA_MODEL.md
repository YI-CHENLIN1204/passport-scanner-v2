# Data Model

本文件描述目前已確認的概念模型；實際 SQL schema 尚未完全凍結。

## traveler_master

用途：保存「旅客本人」的穩定主檔，避免每次出團都建立重複的人。

候選核心欄位：

- traveler_id
- name_zh（內部旅客主檔中文姓名；台灣護照由 VIZ OCR + 人工覆核取得）
- name_en（護照 MRZ 英文姓名）
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
- name_zh_on_document
- name_en_on_document
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

## 團別與旅客／證件關聯

團別資料與 traveler master 分開，而且「旅客擁有某張證件」與「本團實際收到／採用這張證件」必須分開表示。

目前正式關係：

```text
tours
  │
  └── tour_members
          │
          ├── travelers
          │      └── document_versions
          │
          └── tour_member_documents
                 └── document_versions
```

語意：

- `travelers`：跨團共用的旅客本人主檔。
- `document_versions`：該旅客歷史上曾持有／覆核過的證件版本。
- `tour_members`：這位正式 Traveler 目前掛在這一團。
- `tour_member_documents`：這一團實際收到並採用的確切 DocumentVersion。

因此，Traveler 即使全域已有護照與台胞證，也不代表新團已經收到這兩張證件。只有建立 `tour_member_documents` 關聯後，才算本團正式已收件。

同一個 tour member、同一種 document type 只保留一個目前採用的版本；重掃或重新審核後可把 link 更新到新的 DocumentVersion，而全域歷史版本仍保留。

待審核階段尚未成為正式 `tour_member_documents`，而是先存在 `tour_person_drafts` + `scan_items`。人工審核完成後才建立／更新正式 Traveler、DocumentVersion、TourMember 與 TourMemberDocument。

## 訂購人

既有業務構想：

- 同名 + 手機末四碼可作為人工分組／尋找訂購人的輔助條件。
- 「是否為訂購人」可作為訂單關係欄位，而不是證件 OCR 欄位。

這部分屬訂單／金流管理，不應混入 OCR 模型本身。


## V2 正式旅客／證件持久化

資料層仍以 `ITravelerStore` 作為邊界，但正式實作已切換為 `PostgresTravelerStore` + Entity Framework Core + PostgreSQL。Docker Compose 使用 named volume 保存資料，因此 frontend／backend container 重建或重啟不會清空旅客資料。

### 旅客辨識／版本判斷

護照人工覆核完成後：

1. 先以「護照號碼 + 簽發國」找 document version。
   - 找到：更新該版本的覆核／有效資訊，不建立重複版本。
   - 若該版本原本已不是 current，重新掃描不會把舊護照偷偷切回 current。
2. 若沒有同一本護照，再找 traveler。
   - 有中文姓名時（例如台灣護照）：優先以「中文姓名 + 出生日期 + 國籍」exact match。
   - 沒有中文姓名的外國護照：退回「英文姓名 + 出生日期 + 國籍」exact match。
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

這些業務規則已由 `PostgresTravelerStore` 實作；前端 review contract 不因資料庫切換而改變。


## 中文姓名與護照 VIZ

MRZ 不包含中文姓名，因此 `name_zh` 不能由 MRZ parser 產生。

台灣護照採兩路資料來源：

- MRZ：英文姓名、護照號碼、國籍、出生日期、性別、有效期限、簽發國。
- VIZ（Visual Inspection Zone）：中文姓名。

`PP-OCRv5_mobile_rec` 本身支援繁體中文，因此不另外建立第二套 OCR engine。先從整頁 OCR 結果尋找符合中文姓名結構的候選；若找不到，才裁切台灣護照 VIZ 區域重試。

資料保存原則：

- `traveler_master.name_zh`：內部旅客主檔目前採用的中文姓名。
- `traveler_master.name_en`：內部旅客主檔目前採用的英文姓名。
- `document_versions.name_zh_on_document`：該證件版本實際覆核後的中文姓名。
- `document_versions.name_en_on_document`：該證件版本實際覆核後的英文姓名。

換發護照時即使英文羅馬拼音改變，也能保留舊版本當時的姓名。


## 多證件共用後端

後端已將原本護照專用的 `SavePassportReview` 改為共用 `ITravelerStore.SaveDocumentReview`。

目前正式接入：

- `PASSPORT`
- `TAIWAN_COMPATRIOT_PERMIT`
- `TAIWAN_NATIONAL_ID`

三種證件共用 traveler matching / document versioning：

1. 先以同類證件的 document number 尋找既有版本。
2. 同一本證件再次覆核時更新既有版本，不重複新增。
3. 找不到同一本證件時，以姓名 + 出生日期做保守 exact-match 找 traveler。
4. 找到唯一旅客：建立該證件類型的新 document version。
5. 找不到：建立新 traveler + 第一個 document version。
6. 多位候選：回傳 conflict，不自動合併。

護照仍額外使用 issuing country 參與同一本護照判斷；台胞證使用其 8 位證件號碼判斷同一證件。

旅客主檔 nationality 已允許 NULL，避免從台胞證本身推導並沒有必要保存的國籍值。


### PostgreSQL 實體表

#### travelers

核心欄位：

- traveler_id
- name_zh
- name_en
- birth_date
- gender
- nationality
- personal_id_type
- personal_id_number
- created_at
- updated_at

#### document_versions

核心欄位：

- document_version_id
- traveler_id
- document_type
- name_zh_on_document
- name_en_on_document
- document_number
- issuing_country
- nationality
- expiry_date
- is_current
- verified_at
- created_at

同一旅客可同時擁有護照、台胞證與台灣身分證；同一證件種類換發時，舊版本保留並將 `is_current` 設為 false。


#### tour_members

用途：記錄正式 Traveler 與團別的關聯。

核心欄位：

- tour_member_id
- tour_id
- traveler_id
- created_at

同一團同一 Traveler 不重複建立。

#### tour_member_documents

用途：記錄「這一團實際收到／採用哪一個證件版本」。

核心欄位：

- tour_member_document_id
- tour_member_id
- document_version_id
- document_type
- created_at
- updated_at

約束：

- `tour_member_id + document_type` 唯一。
- link 必須指向該 TourMember 所屬 Traveler 的 DocumentVersion。
- 從團別移除已審核證件時，只刪本團 link 與對應 scan staging，不刪全域 Traveler / DocumentVersion。
- 若同團同人同類證件仍有其他 reviewed scan item，link 回退到最近的剩餘版本。
