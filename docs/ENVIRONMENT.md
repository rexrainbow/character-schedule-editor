# Environment files and startup

環境層變數葉節點的 `initial_value` 會隨環境檔保存及載入；群組沒有初始值。環境替換採用新環境定義的初始值，並保留應用層初始值。型別不符時拒絕匯入並指出欄位位置。Runtime Program 的 variables 字典包含完整環境定義，由宿主決定是否覆寫環境初值，詳見 [INITIAL_VALUES.md](INITIAL_VALUES.md)。

啟動時顯示起始畫面，不自動開啟專案設定。可匯入完整專案，或建立新專案並選擇是否匯入環境。

新專案面板先填專案名稱，可匯入／更換／移除環境，預覽環境名稱、版本、變數節點數、計算式巨集數及任務數。匯入環境後採用該環境的每日時段數並設為唯讀；移除環境回到預設 3。按下建立才正式提交，取消不替換目前專案。未匯入環境時建立含行程進度變數及環境計算式巨集的預設環境與一次產生的 UUID。

環境檔包含環境層 `expression_macros`，其依賴只允許環境內容；環境替換會重連應用內容的環境巨集引用並檢查型別，詳見 [ENVIRONMENT_EXPRESSIONS.md](./ENVIRONMENT_EXPRESSIONS.md)。

環境模式頂列的「環境操作」選單提供環境設定、匯入環境及匯出環境。環境設定可編輯名稱、內容版本及每日時段數，ID 唯讀。已有任何日行程（含匿名日行程）時禁止直接修改時段數。專案設定仍可改專案名稱，已有環境識別資訊的專案須從環境設定修改時段數。

## 檔案結構

匯出檔名為 `character-schedule-environment.json`。獨立 [environment.schema.json](../src/schemas/environment.schema.json) 可透過 `npm.cmd run schema:environment` 重新產生。

```json
{
  "format_version": 1,
  "environment": {
    "id": "4f9e2781-f0d1-4bd4-a714-9aa4d63f20d6",
    "display_name": "角色行程環境",
    "version": "1.0"
  },
  "settings": { "slots_per_day": 3 },
  "operand_nodes": {},
  "tasks": {},
  "builtin_tasks": {}
}
```

- `format_version` 固定為 `1`；`environment.version` 為作者管理的非空版本字串，不與檔案格式版本混用。
- `operand_nodes` 只包含環境層群組與變數，保留 UUID、parent_id、order、display_name、icon、name、型別及 read_only。未填 scope 視為 environment，禁止 application 節點及計算式巨集。
- `tasks` 包含全部環境單一任務及其參數，保留 UUID、name、display_name 與 icon。
- 選填的 `builtin_tasks` 保存固定參數模板的自訂圖示、name、display_name 與參數名稱。
- 不包含使用者專案名稱、應用變數、計算式巨集、任務巨集、四種行程或 GUI 狀態。

環境匯出只驗證環境定義，不要求正在編輯的應用內容已完成。key 留空或重複仍可保存；runtime 匯出另檢查契約。匯出不重新產生環境 ID，也不重新產生變數、任務或參數 UUID。

完整專案另保存 root `environment` 識別資訊及全部環境定義，檔案可獨立載入，不依賴外部環境檔路徑。既有未包含識別資訊的專案不會在載入時被改寫；第一次儲存環境設定或成功匯出環境才建立並保留識別資訊。環境匯出不把整份專案標為已儲存。

## 替換既有環境

1. 先驗證檔案格式、變數樹與任務介面；格式錯誤不改動專案。
2. 有日行程時，匯入的每日時段數必須相同。
3. 建立隔離候選專案，只替換環境變數、單一任務、固定模板設定與環境資訊，保留全部應用內容。
4. 相同環境 ID 優先以 UUID 對應；UUID 找不到或環境 ID 不同時，依對應類型內唯一的 name 對應。
5. 只要求實際被引用的環境定義有替代物件；未引用的舊定義可移除。檢查涵蓋時段分支、三種任務巨集及其共通資格條件、四種內建變數操作任務的寫入目標與計算式巨集定義。
6. 變數型別必須相容，寫入目標不得變成唯讀。任務參數數量及型別必須相容；引用參數還核對 value_type 與 access，新的需求不能超出原契約所提供的型別與能力。相同任務 UUID 優先保留參數 UUID 綁定，其他情況按既定順序重連參數及值。引用引數也會重連變數 UUID。
7. 檢查環境 UUID 與應用節點是否碰撞，再執行候選專案完整驗證，包括樹路徑、巨集作用域與全部引用。尚未完成或其他不合法的應用內容也會阻止套用。
8. 預覽顯示環境資訊、已解析的變數／任務定義數及問題位置。全部檢查通過才可套用；取消或錯誤均保留原專案，不刪除使用者內容、不清空引用。

Runtime 匯出統一為 [Program JSON](RUNTIME.md)，以 variables 的 scope、tasks 及 builtins 保存執行定義，不再附另一份 environment_requirements.environment。環境識別與版本保留於專案／環境存檔；外部任務 handler 由宿主依名稱提供。
