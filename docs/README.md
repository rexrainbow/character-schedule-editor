# Character Schedule Editor

日行程可手動複選適用用途「主要／疊加事件／中斷事件」，未選擇則為「未分類」。清單依用途分群，選取器依情境預設篩選，也可顯示全部用途，詳見 [DAY_USES.md](./DAY_USES.md)。事件容器決定中斷對象，日行程在時段開始後設定「放行本時段」，詳見 [SLOT_RELEASE.md](./SLOT_RELEASE.md)。

周序列操作選單可匯出 Markdown 行程報告，依序列出全專案周序列、事件、日行程與完整展開的時段任務邏輯，詳見 [REPORT.md](./REPORT.md)。

原始碼依資料核心、GUI、Schema、範例、語系與樣式分目錄，目錄用途詳見 [SOURCE_LAYOUT.md](./SOURCE_LAYOUT.md)。

Web 編輯器資料操作已整併至可供 Node.js 共用的 Project API，包含物件操作、引用保護、批次交易、快照訂閱與序列化；GUI 仍保留獨立的表單草稿及互動狀態。詳見 [PROJECT_API.md](./PROJECT_API.md)。

「增加數值」支援選填隨機幅度，數值變數可勾選「僅限整數」；模擬可透過亂數種子重現結果。資料結構與執行規則詳見 [RANDOM_INCREMENTS.md](./RANDOM_INCREMENTS.md)。

環境與應用兩層皆有「列舉定義」面板，支援群組、共用引用、唯讀檢視及環境替換時重新連結。詳見 [ENUM_DEFINITIONS.md](./ENUM_DEFINITIONS.md)。

任務與任務巨集可新增「選項」參數，使用下拉選單、相容參數轉傳及字串比較。Schema、匯出與引用規則見 [ENUM_PARAMETERS.md](./ENUM_PARAMETERS.md)。

事件已分為單次、週期與機率三種。事件圖示、引用參數、屬性運算元、調整任務與單日模擬契約，見 [PROBABILITY_EVENTS.md](./PROBABILITY_EVENTS.md)。

空白時段行程可選「新增 ELSE 分支」或「新增優先候選」，後者直接編輯候選巨集清單，不額外建立巨集定義。詳細資料格式及互動見 [SLOT_PRIORITY.md](./SLOT_PRIORITY.md)。

任務巨集支援任務序列、分支任務與優先候選，均可設定預設收合的資格條件；省略或清空表示無限制。優先候選可引用任一種巨集並填入引數，執行第一個符合資格者。舊條件任務匯入後轉成附資格條件的一步序列。詳見 [TASK_MACROS.md](./TASK_MACROS.md)。

模擬模式支援時段行程與周序列某日，整天共用測試變數並合併事件優先權。[中斷與放行](./SLOT_RELEASE.md) 每時段重新判斷：先執行開始任務，再判斷放行條件，成立時跳過自身主體與結束，解除自己的阻擋；其他事件的阻擋不受影響。一般任務選單不提供此專用控制。詳見 [SIMULATION.md](./SIMULATION.md)。

日行程新增日開始／結束、各時段開始／結束事件，預設留空且介面收合，可重用既有時段行程或快速建立。周內自訂、複製、引用清理、預覽及 runtime 匯出均保留事件配置；詳見 [DAY_EVENTS.md](./DAY_EVENTS.md)。周序列現可透過集中事件管理新增單次／週期疊加事件組，使用固定周次與星期、優先權排序及日曆式日期選取，詳見 [SEQUENCE_EVENTS.md](./SEQUENCE_EVENTS.md)。

周序列支援第一周開始日與最後一周結束日。日期格上方的普通旗幟設為開始日、三角旗設為結束日；已選旗幟以綠色／粉色標記。範圍包含兩端，Day 1 從開始日起算；範圍外顯示「開始前／結束後」並變暗，日行程預覽、跳轉及覆蓋編輯仍可使用。只有一周時兩種旗幟都顯示，越過另一端會連動到同一天並提示。周列或來源周刪除後只剩一周且範圍衝突，保留開始日並將結束日調到同一天；空序列保留邊界偏好。

專案周序列新增選填 `start_weekday`／`end_weekday`（mon～sun，省略預設 mon／sun）；runtime 序列輸出明確的兩個欄位，完整保留範圍外的周與覆蓋資料，engine 依邊界執行，並讓 schedule.current_day 從開始日 1 起算。單周開始日晚於結束日的匯入會指出 end_weekday 並拒絕取代專案。

使用者頁籤依序為日行程、周行程、周序列、時段行程，再接變數與巨集；啟動、新建與匯入後預設開啟日行程。日／周的時段選擇視窗可輸入名稱，按 Enter 或「建立並指定」建立空時段行程並立即指定；完整同名時重用既有行程，同名多筆需手動選擇。名稱忽略前後空白、區分大小寫，取消及輸入法組字不建立資料。

時段行程預設 `branches: []`，可單純以名稱表示活動；任務與分支為進階功能，可新增 ELSE 開始編輯，也可移除唯一 ELSE 恢復空行程。已存在的分支仍需完整條件及任務，非空分支必須有唯一且最後的 ELSE。完整專案與 runtime 均保留空分支及名稱，模擬顯示「正在執行：名稱／沒有動作，完成」，不產生任務呼叫或變數變更。需要固定 engine 契約時仍應使用 `engine_key`。

計算式巨集新增分支模式，依序判斷條件並回傳第一個符合的數字／布林結果，最後保留 ELSE。支援保留內容的模式轉換，環境匯出、runtime 匯出與模擬均支援，詳見 [COMPUTED_BRANCHES.md](./COMPUTED_BRANCHES.md)。

專案選單新增「模擬模式」：選取時段行程、設定獨立測試變數，查看條件求值、巨集展開、任務呼叫及變數變更。內建變數操作會更新模擬副本；一般環境任務只記錄呼叫並標示效果未模擬。可重設輸入或明確套用執行後數值，不修改專案。詳見 [SIMULATION.md](./SIMULATION.md)。

環境模式新增「環境層計算式巨集」，使用者模式可唯讀瀏覽與引用；環境及 runtime 匯出均包含它們。未匯入環境的新專案預設包含六個唯讀行程進度變數與三個布林巨集；包含從開始日起算、初始值為 1 的「目前第幾天」（schedule.current_day）。既有專案可於環境變數頁加入範本補上，保留原有定義。周序列的日行程名稱上方顯示 Day N，目前從第一周星期一起算，空白及覆蓋日同樣編號，並隨周列操作重新計算。詳見 [ENVIRONMENT_EXPRESSIONS.md](./ENVIRONMENT_EXPRESSIONS.md)。

任務巨集允許空內容：序列的 `steps: []` 與分支的 `branches: []` 均可被引用、保存及匯出 runtime。空巨集可作為除錯佔位，runtime 可印出巨集名稱後完成，不需實際動作。非空分支仍須保留最後的 ELSE，未選取任務的步驟／分支仍視為未完成。

周序列的日行程名稱支援停留預覽、鍵盤聚焦及觸控點擊，顯示實際生效的日行程與每時段行程。周行程已直接顯示各時段，因此不提供日行程預覽。兩者均保留名稱旁的跳轉按鈕，可開啟具名日行程；匿名日行程則跳至來源周並標示星期。選擇日行程及修改覆蓋使用獨立按鈕。

日行程已指定的時段格右上角提供常駐 `↗`，直接開啟共用時段行程編輯器；時段格主體維持原指定操作。編輯器的「返回日行程」會恢復來源日行程與捲動位置。跳轉不修改指定關係，空時段不提供跳轉按鈕。

環境層與應用層變數支援符合型別的常數初始值；Runtime 匯出含兩層完整變數樹，由 runtime 決定是否套用環境初始值。詳見 [INITIAL_VALUES.md](./INITIAL_VALUES.md)。

數值變數支援選填最小值、最大值，空白表示無限制；runtime 與模擬的數值寫入截斷至設定範圍。詳見 [VARIABLE_BOUNDS.md](./VARIABLE_BOUNDS.md)。

時段行程提供可收合的靜態「邏輯一覽」，支援摘要、展開一層與全部展開，詳見 [LOGIC_OVERVIEW.md](./LOGIC_OVERVIEW.md)。

日行程支援手動多標籤，清單及來源選取器提供標籤篩選與未分類檢視。標籤隨 runtime 日行程輸出，可供事件週期判斷資格，詳見 [DAY_TAGS.md](./DAY_TAGS.md)。

運算元選取器提供獨立的「計算式巨集」頁籤，可搜尋並選取環境層及應用層巨集，布林回傳值可直接與 true／false 比較。「數值運算」頁籤專供四則運算；數值限定的位置不顯示布林巨集。

React + Vite 的深色 Project／Slots／Day／Week／Week Sequences 編輯器，依照 `SPEC.md` 實作。

## 啟動

```powershell
cd C:\mywork\electron-app\character-schedule-editor
npm.cmd install
npm.cmd run dev
```

在瀏覽器開啟終端機顯示的本機網址（預設為 http://127.0.0.1:5173）。Windows 若限制 PowerShell 指令碼，使用 `npm.cmd` 即可。

```powershell
npm.cmd run build
npm.cmd run preview
npm.cmd test
npx.cmd playwright test
```

首次執行瀏覽器測試前，執行 `npx.cmd playwright install chromium`。

## 使用方式

繁體中文介面統一使用「時段行程」（Slot）、「日行程」（Day）、「周行程」（Week）、「周序列」（Week Sequence）與「時段」（Cell）；每日格數顯示為「每日時段數」。JSON 欄位名稱不隨介面語言改變。

- 啟動時顯示「匯入專案／新建專案」起始畫面，不自動開啟設定。新建時可選擇匯入環境，預覽名稱、版本與定義數量，並採用環境的每日時段數；按下建立才提交。未匯入時預設 3，建立含行程進度範本的環境。`src/examples/example.json` 僅供手動匯入與測試，不預載。
- 專案名稱旁的下拉選單提供專案設定／新專案，以及「使用者編輯／環境編輯／模擬模式」單選項目，目前模式顯示勾選，預設使用者模式。使用者模式提供四種行程、應用層變數空間、計算式巨集與任務巨集；環境模式提供環境層變數空間、計算式巨集與任務定義；模擬模式提供獨立測試情境與執行結果。環境及模擬模式各有頂列標籤，切換保留工作狀態。桌面與手機均使用單列工具列。
- 新專案的「每日時段數」預設為 3；既有及匯入專案保留原設定。
- 變數群組／變數、計算式巨集、任務、任務巨集與四種行程可設定 `engine_key`，一般排列為「圖示、名稱、Engine key」。它是選填的 engine 契約名稱，編輯器參照仍使用 UUID。跨類型重複的非空 key 顯示黃色警告，停留可查看衝突來源，不阻擋套用或完整專案匯入／匯出；Runtime 匯出另要求契約名稱唯一。比對忽略前後空白且區分大小寫。複製時清空 key，變數樹則清空所有複製節點的 key。
- 變數／群組、計算式巨集、任務與任務巨集也可使用同一套離線圖示選擇器。環境定義的圖示與 key 在使用者模式維持唯讀。任務參數及內部步驟不新增 `engine_key`。
- 應用層變數頁可唯讀瀏覽環境定義；新增、複製與修改只作用於應用層。兩層的變數均可供運算式及任務引用，「設定變數」依 `read_only` 決定可寫入目標，與定義編輯限制分開。節點以 `scope` 保存層別，未標示的既有節點視為環境層，禁止跨層移動及重複完整路徑。
- 最左側專案選單提供專案設定／新建、匯入專案（Import project）、匯出專案（Export project）及模式切換。使用者模式頂列另提供「匯出執行資料（Export runtime data）」，輸出供 engine 使用的 JSON；環境模式隱藏此按鈕。
- Runtime 格式、環境契約與參數順序規則詳見 [RUNTIME.md](./RUNTIME.md)，獨立 Schema 為 [src/schemas/runtime.schema.json](../src/schemas/runtime.schema.json)。輸出保留 `display_name`、移除 icon 與編輯器中介資料；應用變數轉為樹、環境引用改用 engine_key、匿名日行程嵌入周行程。缺少必要環境 key 或 key 重複時只阻擋 runtime 匯出，仍可匯出完整專案。
- 環境模式頂列的「環境操作」提供設定、匯入及匯出環境；檔案只包含環境名稱／ID／版本、每日時段數、環境變數、任務及固定模板設定。替換前預覽並檢查引用相容性，全部成功才可套用。完整流程見 [ENVIRONMENT.md](./ENVIRONMENT.md)，獨立 Schema 為 [src/schemas/environment.schema.json](../src/schemas/environment.schema.json)。
- 編輯區取消最大寬度限制，填滿剩餘視窗空間；一般輸入字體約 15–16px、任務摘要約 13px。四種行程首列統一為圖示、名稱與操作選單，移除重複類型標題與時段行程屬性區塊；正常首列高度約 44px，欄位錯誤仍就地顯示。日／周／周序列的名稱列固定於上方。
- 整頁固定於視窗高度，不產生頁面垂直捲動；左側清單單獨捲動，日行程只有時段清單捲動。桌面清單寬 184–200px，可由清單標題旁按鈕收合為 44px 窄欄；收合保留搜尋與選取，手機仍顯示橫向清單。
- 周行程與周序列的七天均分剩餘空間，1280px 以上視窗可完整顯示七天；1024px 視窗收合清單後也可容納整周。固定時段編號欄 56px、週次操作欄 152px；長名稱省略並可停留查看全文，任務摘要最多兩行。窄螢幕保留矩陣內水平捲動，標題與左側固定欄維持固定。
- 編輯視窗僅內容區捲動，標題與操作按鈕固定；日／周行程時段格共用排版，圖示與文字橫向置中對齊、名稱上方與任務摘要下方，摘要最多兩行，滑鼠停留可查看完整文字。
- Slot 支援依名稱搜尋、新增、複製、刪除與名稱編輯。Slot 與 Day 的 ID 為自動產生的 UUID v4，不顯示或編輯；匯入與匯出保留原 UUID。
- 複製時產生新 UUID，名稱附加 ` (副本)`，圖示與分支內容一起複製。
- 時段行程、日行程、周行程與周序列共用一套 120 個 Tabler 活動圖示，以 `icon: "tabler:briefcase"` 等字串保存。點擊名稱前的圖示開啟方格選擇器，支援繁中／英文名稱搜尋與分類；套用才更新，取消／Esc 不修改，清除後使用預設圖示。時段編輯視窗內切換同一視窗，不疊加視窗。
- 圖示選擇器最前方提供 8 種純色圓角方塊：紅、橙、黃、綠、青、藍、紫、灰，另有「純色」分類。以 `color:red`、`color:blue` 等 icon 字串保存，不使用圖片或網路資源，所有使用共用圖示的物件皆可選取。
- 清單、日／周行程時段格、周行程的日引用、周序列的周引用與生效日行程，以及各引用選擇器都顯示圖示與名稱。引用來源的圖示更新後同步顯示；週內自訂日行程在建立時保留來源日的圖示。
- 圖示 SVG 資料與中英文標籤隨 App 打包，無執行時圖示 API 請求，可離線使用；保留圓角色塊背景。舊資料缺少 Day／Week／Sequence 圖示時補上預設，舊名稱 `commute`／`work` 等提供對應圖示，未知名稱保留並顯示預設圖示。
- 圖示清單位於 `src/icons/catalog.js`；修改後執行 `npm.cmd run icons:build` 重建精選 SVG 資料。Tabler 與 Iconify 授權隨輸出附於 `public/licenses`／`dist/licenses`。
- 匯出檔案包含 `project`、`slots`、`day_schedules`、`week_schedules`、`week_sequences` 與 `operand_nodes`；所有集合的 key 均為小寫 UUID。開發階段 `schema_version` 僅檢查為非空字串，不限制版本值。不提供舊 Condition 格式轉換，專案需包含 `operand_nodes` 並使用 Reference／Constant／Expression Operand。
- 「變數空間定義」頁面管理 Group／Value 樹，支援搜尋並保留祖先路徑、展開收合、鍵盤導覽、新增、重新命名與父節點選擇。排序由變數清單工具列的上移／下移圖示，交換目前選取節點與相鄰同級節點；搜尋期間及到達首尾時停用對應按鈕。群組連同子樹移動，`order` 由 App 自動連續編號，右側不提供排序輸入。變數葉節點具有 `read_only` 屬性，新建預設可寫入。
- 複製 Group 會複製整個子樹，複製 Value 只複製自身；所有副本使用新 UUID，頂層附加 ` (副本)`，重名時編號，既有條件仍引用原節點。刪除群組可連同所有後代一次刪除，確認時顯示節點總數；若子樹內任一變數被使用則阻擋整次刪除並列出引用位置。不相容的 Value Type 修改會被拒絕並列出受影響分支。
- ALL／ANY 繼續支援遞迴。比較葉節點使用 `operand_a`／`comparator`／`operand_b`；點擊任一 Operand 開啟共用選擇器，可選擇 Value UUID 或 Number／String／Boolean 常數。常數保留原生 JSON 型別，空字串合法。兩側需同型別，文字及布林值只允許 `==`／`!=`。
- Operand 選擇器取消不提交；時段編輯視窗內切換同一視窗並保留草稿。可暫時設定不相容的 Operand，錯誤就地顯示，Apply／匯出前必須修正，不自動替換比較符號。
- 「引用變數」可點擊群組列、箭頭或鍵盤左右鍵，逐層展開／收合尋找變數；群組只供導覽，不能套用為 Operand。新選擇從收合的根群組開始，已有引用則自動展開其祖先。搜尋可使用群組路徑，結果中的群組仍可展開／收合。
- 群組與變數的顯示路徑以 `.` 連接，例如 `主角.狀態.是否生病`；路徑搜尋使用同一格式，資料仍以 UUID 引用。
- 數字 Operand 旁的 Add OP 開啟 `(原 Operand + 0)` 草稿，可選擇 `+ - * /`；每次 Add OP 包裝目前整個運算式。Expression 的左右 Operand 可繼續巢狀編輯，完整括號預覽呈現實際樹結構，支援換行，不計算結果。
- 運算式共用一份 Dialog 草稿，以 Back／麵包屑導航子層；Apply 從任一層提交完整根 Operand，Cancel／X／Esc 全部丟棄。Remove OP 在同一視窗選擇保留左側或右側，只替換目前子樹。
- Expression 子層只提供數字變數／數字常數／Expression。空白或無效數字、缺少 Operand、直接除以 `0`／`-0` 會停用 Apply；除以 Expression 不求值。Expression 的深層引用同樣參與刪除阻擋與 Value Type 相容性檢查。
- 可匯入 `src/examples/expression-example.json` 體驗巢狀 Expression、ALL／ANY 與周序列。Expression 嵌入 Condition，沒有獨立 UUID，時段複製會深複製整棵運算式。
- 「計算式巨集」是獨立清單，以 UUID 保存數字運算式或布林條件式，結果型別由定義決定且唯讀。定義存於 `expression_macros`，不再存入變數空間，也不產生 engine 的狀態欄位。
- 「編輯定義」直接共用分支規則的 Condition Editor（Comparison、ALL／ANY）與 Operand／Expression Editor，不包含 Task／ELSE。定義採草稿 Apply／Cancel，內層 Operand 在同一視窗切換；數字定義只提供數字運算元。
- 計算式巨集可引用變數或其他計算式巨集，不展開複製定義，也不求值。變數引用使用 `reference`／`reference_id`，計算式巨集使用 `expression_macro_reference`／`expression_macro_id`。匯入與提交檢查深層引用、型別及直接／間接循環。
- 計算定義也參與變數刪除與型別修改保護。複製變數子樹不複製計算式巨集；複製計算式巨集保留其讀取依賴。運算元選取器分別呈現本巨集參數、變數空間與計算式巨集。
- 可匯入 `src/examples/computed-example.json` 體驗兩個數字計算變數、ANY 布林定義，以及 Slot 中的數字比較與 `計算變數 == true`。
- Days 支援搜尋、新增、複製與刪除。每日格數在專案設定中共用，已有 Day 時唯讀；長列表只渲染可見 Cell，以支援捲動瀏覽。
- Weeks 支援搜尋、新增、複製、刪除與七天矩陣；星期一至星期日固定排列，支援水平／垂直捲動與可見列渲染。
- Sequences 支援空序列建立、搜尋、複製與刪除；每列引用一個既有周行程，可新增、移動、複製、刪除或更換來源。覆蓋跟隨原列移動，匯出時重新編號。
- 周序列的日行程覆蓋只有「不覆蓋／選擇具名共用日行程／覆蓋為空白」。不提供來源周行程或日行程編輯，也不建立任何序列匿名行程。取消覆蓋視窗不提交草稿。
- 刪除來源周行程前提示周序列引用列數，確認後移除全部相關列與 Overrides，周序列可變為空。刪除共用日行程時移除直接引用它的整筆 Overrides，恢復繼承。
- 可匯入 `src/examples/sequence-example.json` 體驗周序列、共用日行程覆蓋、空白覆蓋與繼承週內自訂的示範。
- 星期標題可引用共用日行程、清除或保留目前週內自訂。取代私有日行程時，需在同一視窗確認捨棄其配置；取消不變更資料。
- 周行程時段重用既有 Slot Dialog。只有 `slot_ids` 實際改變才建立私有日行程（Copy-on-Write）；僅開啟、選取同一時段行程、清除已空時段或編輯全域 Slot 定義，不會產生匿名日行程。
- 私有日行程只屬於一個周行程的一個星期，不出現在一般日行程清單。清空全部時段仍保留其 UUID；複製周行程會複製私有日行程與 owner，刪除或取代則清除對應私有日行程，但不刪除全域時段行程。
- 刪除共用日行程前提示星期引用數，確認後將引用它的星期設為未指定，保留其他私有日行程。
- 點擊 Day Cell 開啟單一 Slot Dialog，可選擇、建立、複製、編輯或清空 Slot 引用。Create／Duplicate／Edit 先編輯草稿，Apply 儲存、指定目前 Cell 並關閉返回 Day；Back 丟棄草稿返回選擇模式，取消／X／Esc 丟棄草稿關閉。
- Clear Assignment 立即提交，之後取消不撤銷。編輯共用 Slot 會更新所有引用；刪除 Slot 前提示引用數，確認後清空所有對應 Cell。
- Slot Info 顯示圖示、名稱與各分支任務摘要。任務以 UUID 解析目前的 `display_name`；尚未選取任務時顯示「未命名任務」。
- Condition 支援比較式與遞迴 ALL／ANY 群組；opA、opB 使用 Reference／Constant 選擇視窗。
- 新分支插入 ELSE 之前；ELSE 不可刪除或移動。
- Task 從任務定義選單選取，各參數以共用 Expression 編輯器填入，依參數型別檢查常數與變數引用。
- 不顯示常駐資料驗證成功區塊；欄位錯誤就地顯示，Apply／匯出前檢查資料。JSON 匯入同時檢查 Schema、ELSE 位置、Day 格數、Slot／Day 引用及私有日行程 owner 唯一性；錯誤顯示資料路徑，且不取代目前文件。
- 預設讀取瀏覽器／系統偏好語言：中文對應繁體中文，其他語系對應英文。可手動切換，語言偏好儲存於 localStorage；資料內容不會因切換語言而翻譯。
- 文件保留於記憶體，請使用「匯出專案」儲存；未儲存的變更會在離開頁面時觸發瀏覽器提醒。「匯出執行資料」不等於儲存專案，不會清除此提醒。

## 程式結構

- `src/gui/App.jsx`：專案狀態、Slots／Days／Weeks／Sequences 切換、引用清理、匯入與匯出。
- `src/gui/editors/SlotEditor.jsx`、`src/gui/dialogs/SlotDialog.jsx`：共用 Slot 表單、選擇與編輯草稿流程。
- `src/gui/editors/DayEditor.jsx`、`src/gui/dialogs/ProjectSettings.jsx`：Day Cell 列表與專案設定。
- `src/gui/editors/WeekEditor.jsx`、`src/gui/dialogs/DaySelector.jsx`、`src/gui/dialogs/WeekSlotDialog.jsx`：周行程矩陣、日行程選擇與既有 Slot Dialog 整合。
- `src/core/weekModel.js`：Copy-on-Write、周行程複製／刪除與共用日行程引用清理。
- `src/core/sequenceModel.js`：周序列列操作、覆蓋與繼承解析、引用計數。
- `src/gui/editors/SequenceEditor.jsx`、`src/gui/dialogs/SequenceOverrideDialog.jsx`、`src/gui/dialogs/WeekPicker.jsx`：周序列矩陣、唯讀來源選擇及具名日行程覆蓋視窗。
- `src/gui/components/ActionMenu.jsx`、`src/gui/hooks/useVisibleRows.js`、`src/styles/workspace.css`：操作選單、依可用高度渲染列表與視窗版面。
- `src/gui/components/IconField.jsx`、`src/gui/components/SlotIcon.jsx`、`src/icons`：共用圖示選擇器、本地 SVG 顯示與中英文活動目錄。
- `src/gui/editors/ConditionEditor.jsx`：遞迴條件介面、Operand 選擇按鈕與就地型別檢查。
- `src/gui/editors/OperandsEditor.jsx`、`src/gui/components/OperandTree.jsx`、`src/gui/dialogs/OperandSelector.jsx`：變數樹、父節點選擇、Reference／Constant 選擇器。
- `src/core/operandModel.js`：樹排序、子樹複製、引用追蹤與跨物件型別驗證。
- `src/gui/dialogs/ComputedDefinitionDialog.jsx`：共用 Condition／Expression 編輯器的計算定義草稿與相依關係驗證。
- `src/core/model.js`：編輯草稿轉換、資料操作與 Ajv Draft 2020-12 驗證。
- `src/schemas/slots.schema.json`：與 SPEC 同步的完整 Project Schema；`src/examples/example.json` 為符合新版格式的範例專案。
- `src/i18n/index.js`：繁體中文／英文介面字串、語系判定。

此版為本機 React GUI，未加入 Electron 主程序或安裝檔打包。

### 任務定義與使用

在「任務定義」新增任務，定義 number、string、boolean 或 variable_reference 必填參數。前三者使用共用 Expression 編輯器填入常數、變數、計算變數或數字運算式。布林 ALL／ANY 請先建立布林計算變數再引用。

「變數引用」參數另設定引用型別（數字／文字／布林／不限）及讀取／寫入／讀寫限制。使用時開啟變數樹，傳遞的是變數位置，不會先求值；寫入與讀寫排除唯讀變數，全部排除群組與計算式巨集。任務巨集也可定義此參數，並直接轉傳符合型別與存取能力的局部引用參數；它不出現在一般 Expression 的參數選單中。參數契約變更、變數刪除／型別／唯讀變更及環境替換均檢查這些引用。

任務及參數均以 UUID 引用。任務被引用時不可刪除；刪除參數需確認並清除所有對應值，修改型別會阻擋不相容引用。新增參數後須補齊既有使用處才可匯出。舊字串任務格式已由 `task_id`／`arguments` 取代，開發階段不提供舊格式轉換。

可匯入 `src/examples/task-example.json` 查看包含文字、數字 Expression 與布林計算變數參數的範例。任務管理與引用檢查位於 `src/core/taskModel.js`，定義與使用介面分別為 `src/gui/editors/TasksEditor.jsx`、`src/gui/editors/TaskUseEditor.jsx`。

### 任務巨集

「任務巨集」支援任務序列、分支任務與優先候選。三種模式共用可選的資格條件，預設收合，未設定表示無限制；資格通過後才執行內容。分支任務共用 `BranchRulesEditor`，優先候選可選任何巨集模式。各模式提供唯讀的「本巨集參數」，可在資格條件、內部 Expression 與呼叫參數中引用。

時段行程、分支動作與任務序列步驟可選一般／內建任務或任意模式巨集；優先候選只能引用巨集。巨集可互相呼叫但禁止直接／間接循環。呼叫引數以呼叫者作用範圍解讀，再於被呼叫巨集自己的參數作用域檢查資格；候選選中後不重複求值，引用參數保持變數位置。

切換模式會保留名稱、參數與資格條件並清除內容，已有內容時先確認；呼叫者不因目標模式變更而失效。複製會產生新 UUID 並重連資格條件與內容中的參數引用。刪除與型別檢查涵蓋資格條件、巨集間引用及任務填值。

Schema 使用 `task_macros` 與 `task_macro_id`，開發階段不轉換舊 `task_sequences` 格式。舊 conditional 任務巨集會轉成附資格條件的一步序列。可匯入 `src/examples/task-macro-example.json` 查看序列／分支及參數傳遞；完整規則見 [TASK_MACROS.md](./TASK_MACROS.md)。

### 內建變數操作任務

固定提供「設定變數」、「增加數值」、「切換布林」、「重設初始值」。增加數值支援負增量與數字 expression；切換只接受可寫布林變數；重設使用 runtime 實際採用的初始化值。時段分支及三種任務巨集共用介面。四個範本的名稱、圖示、engine_key 及參數名稱均可在環境模式修改，結構固定。詳細契約與匯出格式見 [BUILTIN_VARIABLE_TASKS.md](./BUILTIN_VARIABLE_TASKS.md)。

任務清單固定提供「設定變數」模板，與普通任務共用編輯面板。在環境模式可修改圖示、名稱、engine_key 與兩個參數名稱；參數種類、數量及順序固定，新增、刪除、排序與型別控制停用，不提供複製或刪除模板。自訂名稱會同步到使用者模式，且不隨語系切換被覆蓋；未自訂名稱仍跟隨介面語系。

設定保存於 `builtin_tasks.set_variable`；Runtime 以所填的 engine_key 作為 `task_key` 連接環境提供的任務，不使用固定操作碼。若實際使用模板卻未設定 key，會指出位置並拒絕 Runtime 匯出，完整專案仍可儲存。時段行程與三種任務巨集均可選取。目標只允許變數空間中非唯讀的葉節點；數值共用 Expression 編輯器並跟隨目標型別，可引用唯讀變數、計算式巨集及目前的巨集參數。

資料為 `{builtin: "set_variable", target_variable_id, value}`，寫入位置與一般讀值引用分開。寫入中的變數不能改成唯讀或刪除，不相容的型別修改也會被拒絕。切換目標遇到不相容數值時先確認清除。engine 應先求值再寫入，編輯器不執行運算。

可匯入 `src/examples/state-example.json` 查看獨立變數空間、計算式巨集、唯讀變數，以及時段行程／任務巨集中的設定變數。相關介面位於 `src/gui/editors/ExpressionMacrosEditor.jsx` 與 `src/gui/editors/SetVariableEditor.jsx`。


[事件的多日行程來源與手動模擬選擇](./EVENT_DAY_SOURCES.md)

[流程控制：預約事件](./SCHEDULE_EVENT_TASK.md)
