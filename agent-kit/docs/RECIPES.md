# 需求組合範例索引

需要可由 API 直接匯入的測試輸入，參考 [生活與薪資 YAML 藍圖](../examples/life-simulation.yaml) 與 [格式說明](BLUEPRINT.md)；以下 recipe 則保留人類可讀的設計說明。

這些 recipe 是現有功能的組合方式，不是新增內建指令，也不是可直接匯入的 JSON。先讀 [系統能力總覽](SYSTEM_SEMANTICS.md) 與 [Engine 執行語意契約](ENGINE_SEMANTICS.md)，再選擇相關範例。操作可使用規定作用域內的精確 name 或 UUID；API 格式見 PROJECT_API.md（專案路徑：`docs/PROJECT_API.md`；未收錄於離線文件包）、MCP_SERVER.md（專案路徑：`docs/MCP_SERVER.md`；未收錄於離線文件包）。

| Recipe | 適用需求 | 主要能力 | 驗證邊界 |
| --- | --- | --- | --- |
| [可執行活動加權選擇](recipes/weighted-activity.md) | 在符合資格的活動中隨機擇一，無候選時休息 | 加權隨機巨集、資格、權重、後備動作 | 選中空巨集仍可能沒有任務效果 |
| [每七天支付房租](recipes/periodic-rent.md) | 定期扣款、定期補給 | 疊加事件、週期、數值增量 | 多次扣款需跨日 runtime 測試 |
| [出勤與薪資結算](recipes/attendance-payroll.md) | 累計、獎金、門檻扣款 | 疊加事件、變數、分支計算、序列、重設 | 實際工作完成需 engine 定義 |
| [感冒機率事件](recipes/probability-event.md) | 機率發生、冷卻、當日替代 | 機率事件、中斷、計數依據 | 單日模擬人工指定發生 |
| [設備檢修與放行](recipes/interrupt-and-release.md) | 條件式保留主要行程 | 開始任務、中斷、專用放行 | 外部檢查結果需手動或 engine 提供 |
| [預約約會](recipes/scheduled-event.md) | 未來一次事件、加權結果 | 預約任務、日期運算、加權來源 | 模擬只產生預約，不執行未來 |

## 使用原則

參數化計算式與隨機數值／文字輸出，可參考 [隨機計算式](recipes/random-expressions.md)。

- 房租與薪資結算是疊加事件範例：只在指定位置執行扣款或結算，原本的全天行程繼續運作，不需要中斷。感冒與設備檢修是中斷事件範例：以事件內容取代主要時段；設備正常時再放行。分類依據是是否阻擋其他行程，而不是是否佔滿一整天。
- 每份範例列出必要假設；套用到實際專案時必須重新確認，不能把範例數值當業務規格。
- 「每七天」先確認是日曆天或符合條件日，以及首次哪天發生。週期事件起點即第一次執行。
- 「有上班」與「實際完成一班」不同；計數任務應放在真正代表完成的位置。
- Recipe 的偽碼只描述語意，不可直接傳入 MCP。先查操作目錄、引用與環境契約，再建立資料。
- 目前沒有專案專用 SKILL.md。YAML 格式、Schema 與完整範例已提供 MCP resource，見 BLUEPRINT.md；未來 skill 可引用此索引及語意文件，不需複製整份知識內容。
