# 編輯位置連結

編輯器以網址的 hash 保存目前模式、頁面及物件的持久化 name，適用於 GitHub Pages 與本機服務。例如：

```text
#/user/expressions/weekly_pay
#/user/days/working
#/user/task-macros/work
#/user/sequences/life/events/cold
#/environment/variables/schedule_current_week
#/environment/tasks/increment_variable
#/simulation/continuous
```

其他頁面包括 slots、weeks、sequences、enums，以及 simulation 模式的 simulation 頁面。模式與頁面後可省略物件名稱，開啟該清單；介面沿用目前的預設選取行為。變數、列舉與計算式在使用者模式可檢視環境定義，環境模式則只接受環境定義的連結。

上方工具列的「複製此編輯位置連結」可分享目前位置；事件管理面板內也提供相同按鈕。未套用的新事件尚無專案物件，不能複製其事件連結。連結不包含專案內容、UUID、搜尋篩選、展開狀態、模擬值或未套用草稿；接收者需另外開啟同一份專案。

啟動時會保留連結，等到匯入或開啟專案後定位。切換編輯器及物件會加入瀏覽歷史，上一頁／下一頁可還原位置；同一個 UUID 更改 name 時替換當前網址。分享後若物件更名或刪除，舊連結會顯示找不到物件的提示，並回到對應清單供重新選擇，不進行模糊比對或名稱遷移。

事件連結直接開啟事件管理並選取指定事件，關閉後網址回到周序列。瀏覽器導覽若會捨棄尚未套用的面板草稿，會提供「繼續編輯」與「丟棄並開啟」。一般編輯器欄位仍沿用立即提交的行為；網址導覽不會儲存專案檔案。

實作由 `src/gui/navigation/editorLocation.js` 統一名稱解析，`src/gui/hooks/useEditorLocation.js` 管理歷史與草稿保護，App 將解析結果轉回 UUID 選取。共用 Dialog 透過 NavigationContext 登記草稿狀態。
