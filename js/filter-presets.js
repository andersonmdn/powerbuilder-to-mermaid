/**
 * filter-presets.js
 * Built-in filter group presets.
 * Each entry mirrors the JSON files in /json/ — edit either to add new presets.
 * Exposed as window.FilterPresets so app.js can render them without fetch().
 */
window.FilterPresets = [
  {
    name: "DataWindow",
    description: "Métodos de componente DataWindow (visuais e de dados)",
    members: [
      "AcceptText", "Retrieve", "Update", "Reset", "RowCount",
      "GetItem", "SetItem", "DeleteRow", "InsertRow",
      "SetSort", "Sort", "SetFilter", "Filter", "Find", "FindRequired",
      "GetRow", "GetColumn", "SetRow", "SetColumn",
      "GroupCalc", "ImportFile", "ImportString", "SaveAs",
      "GetSQLSelect", "SetSQLSelect", "SetTransObject",
      "ShareData", "ShareDataOff",
      "SetRedraw", "Describe", "Modify", "GetText", "SetText",
      "ScrollToRow", "SelectRow", "SelectText", "GetObjectAtPointer",
      "Print", "PrintImmediate", "Resize", "SetBorderStyle",
      "SetColumnAttribute", "GetColumnAttribute", "SetTabOrder",
      "DBErrorCode", "DBErrorMessage", "SetFocus"
    ]
  },
  {
    name: "DataStore",
    description: "Métodos de DataStore (manipulação de dados não-visual)",
    members: [
      "Retrieve", "Update", "Reset", "RowCount",
      "GetItem", "SetItem", "DeleteRow", "InsertRow",
      "SetSort", "Sort", "SetFilter", "Filter", "Find", "FindRequired",
      "GetRow", "GroupCalc", "ImportFile", "ImportString", "SaveAs",
      "GetSQLSelect", "SetSQLSelect", "SetTransObject",
      "ShareData", "ShareDataOff",
      "DBErrorCode", "DBErrorMessage", "SetFocus"
    ]
  }
];
