# 計算式巨集的分支模式

環境層與應用層計算式巨集均支援單一／分支模式，結果型別維持 number 或 boolean，與模式分開設定。

單一模式沿用 `{kind: "number", expression: Operand}` 或 `{kind: "boolean", condition: Condition}`。分支模式為：

```json
{
  "kind": "branch",
  "branches": [
    {
      "condition": {
        "kind": "comparison",
        "operand_a": { "type": "constant", "value": 1 },
        "comparator": "==",
        "operand_b": { "type": "constant", "value": 1 }
      },
      "result": { "kind": "number", "expression": { "type": "constant", "value": 5 } }
    },
    {
      "condition": null,
      "result": { "kind": "number", "expression": { "type": "constant", "value": 20 } }
    }
  ]
}
```

分支由上而下，第一個成立者回傳結果；必須有且只有一個最後的 ELSE，內容不可為空。condition 為 null 表示 ELSE，不是回傳 null。所有 result 的 kind 必須符合巨集的 value_type。

每個 result 沿用單一計算式定義，因此數字使用 Operand 編輯器，布林使用比較式及 ALL／ANY 編輯器。第一版不允許 result 內直接再放 branch，複雜組合可引用其他計算式巨集。條件、排序及新增／刪除沿用共用 BranchRulesEditor，結果區取代任務選單。

## 模式與型別轉換

- 單一轉分支：原定義完整放入唯一的 ELSE。
- 只有 ELSE 的分支轉單一：直接取回原結果。
- 多分支轉單一：先選擇保留哪個結果，再確認移除全部條件與其他結果；取消保留草稿原內容。
- 分支結果型別變更：確認後保留條件，將各結果重設為新型別預設定義；套用時仍檢查外部引用相容性。取消整個編輯視窗不修改專案。

## 引用、存檔與求值

所有條件與結果都納入型別、遺失引用、循環及環境依賴方向檢查，包含未被選中的分支。變數或巨集被引用時的刪除／型別保護涵蓋每個分支。複製保留定義、產生新巨集 UUID，並配置不重複的 name。

專案、環境及 runtime Schema 均支援分支定義；runtime 將每個條件與結果內的環境變數引用轉為 name。分支編輯用 uid 不寫入存檔。環境匯入亦會重連應用分支條件與結果內的環境引用。

求值採惰性策略：只判斷需要的條件，只求值被選中的 result；其餘結果標示「未求值」。分支內除以零延至實際求值時才報錯，未選中分支不影響當次執行；型別與引用錯誤仍在存檔／匯入時檢查。單一計算式原本對明確除以零的編輯檢查維持不變。

模擬模式會呈現每個分支的條件結果、選中結果與回傳值，錯誤定位包含 branches/index/result 路徑。Engine 端應採相同的第一個符合及惰性回傳語意。
