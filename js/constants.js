/**
 * constants.js
 * Shared constants for pb-parser, pb-analyzer, mermaid-gen and app.
 * Must be loaded before all other application scripts.
 */
const PB_CONSTANTS = {
  // Sentinels used in pb-parser.js and pb-analyzer.js
  SENTINEL_PARENT: '__parent__',
  SENTINEL_SUPER:  '__super__',

  // Call-graph node identifiers (mermaid-gen.js)
  NODE_SEP:        '__',
  NODE_PREFIX_EXT: 'ext__',

  // Call-graph external-node style (mermaid-gen.js)
  CSS_CLASS_EXTERNAL: ':::external',
  COLOR_EXT_FILL:     '#fff8e1',
  COLOR_EXT_STROKE:   '#f9a825',
  COLOR_EXT_TEXT:     '#5d4037',

  // app.js limits and delays
  FILE_SIZE_LIMIT:    500 * 1024,  // 500 KB
  COPY_REVERT_DELAY:  1500,
  DL_REVERT_DELAY:    1000,

  // pb-parser.js: state machine state names (also used as block kind values)
  PB_STATES: {
    OTHER:         'other',
    FORWARD:       'forward',
    TYPEDECL:      'typedecl',
    TYPEVARIABLES: 'typevariables',
    PROTOTYPES:    'prototypes',
    FUNCTION:      'function',
    EVENT:         'event',
    INLINE_EVENT:  'inline_event',
  },

  // pb-parser.js: bare-call filter — PB keywords and built-in functions
  PB_KEYWORDS_SET: new Set([
    'if', 'elseif', 'while', 'until', 'for', 'not', 'return',
    'choose', 'case', 'try', 'catch', 'throw',
    'len', 'mid', 'left', 'right', 'upper', 'lower', 'trim', 'pos',
    'isnull', 'isvalid', 'isdate', 'isnumber',
    'messagebox', 'open', 'close', 'send',
    'abs', 'int', 'mod', 'max', 'min', 'round', 'truncate',
  ]),

  // pb-parser.js: dot-call filter — identifiers that are not user-defined objects
  PB_BUILTIN_IDENTIFIERS_SET: new Set([
    'this', 'super', 'parent', 'string', 'integer', 'long', 'ulong',
    'date', 'time', 'datetime', 'boolean', 'double', 'decimal', 'real',
    'blob', 'any', 'byte', 'char', 'uint', 'longlong', 'powerobject',
    'window', 'menu', 'datawindow', 'nonvisualobject',
  ]),

  // pb-analyzer.js: inheritance edge filter — PB built-in base types
  PB_BUILTIN_TYPES_SET: new Set([
    'window', 'menu', 'datawindow', 'nonvisualobject', 'userobject',
    'powerobject', 'graphicobject', 'drawobject',
    'commandbutton', 'picturebutton', 'checkbox', 'radiobutton',
    'singlelineedit', 'multilineedit', 'editmask', 'richtextedit',
    'listbox', 'dropdownlistbox', 'dropdownpicturebox',
    'statictext', 'picture', 'line', 'oval', 'rectangle', 'roundrectangle',
    'tab', 'tabpage', 'treeview', 'listview', 'progressbar', 'trackbar',
    'scrollbar', 'hscrollbar', 'vscrollbar',
    'datawindowchild', 'datastore', 'transaction', 'error', 'message',
    'mailsession', 'oleobject', 'olecontrol', 'olecustomcontrol',
    'inet', 'internetresult',
    'structure', 'exception',
  ]),

  // app.js: file-row status icons
  STATUS_ICONS: {
    ok:      '✓',
    error:   '✗',
    warning: '⚠',
    pending: '…',
    default: '·',
  },

  // mermaid-gen.js: UML access-level symbols
  ACCESS_SYMBOLS: {
    public:    '+',
    protected: '#',
    private:   '-',
  },
};
