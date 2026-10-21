# 環境層計算式巨集與行程進度

識別契約已更新：進度使用 schedule_current_week 等合法 name，取代舊 schedule.* engine_key；詳見 [NAMING.md](./NAMING.md)。

環境層巨集同樣支援分支計算式；條件與每個回傳結果均只允許環境依賴，並隨環境檔保存、載入與重連。格式與轉換操作見 [COMPUTED_BRANCHES.md](./COMPUTED_BRANCHES.md)。

計算式巨集新增 `scope: "environment" | "application"`，省略時視為 application。專案仍以同一個 `expression_macros` UUID 字典保存兩層巨集。巨集是計算定義，不會在變數空間建立儲存欄位。

環境模式新增「環境層計算式巨集」頁面，沿用數字 Expression／布林 ALL、ANY 條件式編輯器，支援新增、複製、刪除、圖示、名稱與 engine_key。使用者模式的計算式巨集頁可瀏覽環境巨集，其定義不可修改或複製；新增及修改作用於應用層。

環境巨集只能引用環境變數與環境巨集；應用巨集可引用兩層。選擇器依此過濾，匯入與提交驗證也會檢查依賴方向、型別、遺失引用與循環。兩層巨集名稱在共用集合內保持唯一，參照仍用 UUID。

環境檔新增 `expression_macros`，只包含環境巨集，保留 UUID、名稱、圖示、scope、engine_key 與定義。匯入至新專案時採用該環境的完整定義，不額外合併預設範本。替換既有環境時，巨集與變數同樣依環境 UUID 或唯一 engine_key 重連應用內容的引用；型別不符、引用缺漏或循環則拒絕套用，保持原專案。

Runtime 仍使用同一個 `expression_macros` 字典，完整輸出環境與應用巨集；保留 display_name、選填 engine_key、型別及定義，移除 scope 和 icon。巨集間引用保留 expression_macro_id，定義中的環境變數引用改為 engine_key。Engine 可依 UUID 求值，兩層不需不同的運算機制。

新建專案且未匯入環境時，建立以下「行程進度」範本。既有專案可在環境變數頁按「加入行程進度範本」。重複加入保留既有 UUID 與自訂內容，不重複建立；遇到不相容的 engine_key 定義則報錯，整次操作不套用。

| 變數顯示名稱 | 預設 engine_key | 型別／初始值 | Engine 定義 |
| --- | --- | --- | --- |
| 目前周次 | schedule.current_week | number / 1 | 周序列中的位置，從 1 開始 |
| 目前星期 | schedule.current_weekday | number / 1 | 星期一 1 至星期日 7 |
| 目前第幾天 | schedule.current_day | number / 1 | 從開始日起算，第 1 天為 1；同一天所有時段維持相同值 |
| 目前時段 | schedule.current_slot | number / 1 | 當日時段位置，從 1 開始 |
| 每日時段數 | schedule.slots_per_day | number / 新專案設定值 | 由環境 settings.slots_per_day 提供 |
| 周序列周數 | schedule.total_weeks | number / 0 | 執行中周序列的周數，空序列為 0 |

六個變數初始為 read_only，群組預設 key 為 schedule.progress。這些預設 key 是可編輯的契約名稱，engine 須提供相符的綁定。Engine 在執行前以實際起點、環境設定及所選周序列覆寫初始值；一個時段內維持一致快照，完成後一次推進位置。編輯器不實作 engine 計時或推進。

周序列每個有效日行程名稱上方顯示 Day N，包含未指定、覆蓋與空白日期；預設第一周星期一開始、最後一周星期日結束，可於第一周／最後一周的日期旗幟設定。有效編號為周列索引 × 7 + 星期索引 − 開始星期索引 + 1，範圍外不編號。周列新增、複製、移動、刪除時依目前位置重新計算，Day N 不保存於資料內，只有開始／結束星期需存檔。開始日設定同時決定畫面編號及 schedule.current_day 的起算點；即使從星期四開始，該日仍是 Day 1，而目前周次及目前星期維持各自定義。模擬模式可手動調整目前第幾天的測試值，尚不自動推進。

| 環境巨集名稱 | 預設 engine_key | 布林定義 |
| --- | --- | --- |
| 是否第一個時段 | schedule.is_first_slot | 目前時段 == 1 |
| 是否周末 | schedule.is_weekend | 目前星期 >= 6 |
| 是否最後一周 | schedule.is_last_week | 目前周次 == 周序列周數 |

範本名稱在建立時使用目前介面語系，之後作為可自訂的 display_name 保存；切換語系不覆蓋使用者命名。範本也可在環境模式修改，不是固定內建結構。
