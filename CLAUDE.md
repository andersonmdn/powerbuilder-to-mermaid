# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the tool

Open `index.html` directly in Chrome (`file://` protocol). No build step, no server needed. Mermaid.js is loaded from CDN — an internet connection is required for the diagram preview tab.

To test changes: refresh the browser, drag `.sru`/`.srw`/`.srm`/`.srp` files into the drop zone, and click **Analisar e Gerar Diagrama**.

## Architecture

Four JS files loaded in strict dependency order via `<script src>` tags (no ES modules — `file://` protocol blocks them):

```
PBParser  →  PBAnalyzer  →  MermaidGenerator
                                   ↑
                               App (IIFE, UI)
```

Each module exposes itself via `window.*` (e.g. `window.PBParser`).

### `js/pb-parser.js` — `PBParser`

Converts raw EditSource text into a `ParsedFile` containing `PBObject[]`. Uses a **line-by-line state machine** (`_splitIntoBlocks`) that emits typed `Block` objects as it transitions between PB source sections:

| State | Triggered by | Ends at |
|---|---|---|
| `FORWARD` | `forward` | `end forward` |
| `TYPEDECL` | `global/local type X from Y` | `end type` |
| `TYPEVARIABLES` | `type variables` | `end variables` |
| `PROTOTYPES` | `forward prototypes` | `end prototypes` |
| `FUNCTION` | `public/protected/private function/subroutine` | `end function/subroutine` |
| `EVENT` | `on obj.event` | `end on` |

Each block kind is dispatched to a `_process*` method. Context-dependent sections (`type variables`, `forward prototypes`) are attributed to the **last non-control object** in the map (`_getLastObject`).

After block processing, `_mergeEventStubs` reconciles event stubs (signature from `type...end type`) with implementations (body from `on...end on`).

`_extractCallSites` scans function/event bodies with six regex patterns after stripping string literals and line comments:

| Kind | Pattern | Example |
|---|---|---|
| `dotcall` | `obj.method(` | `dw.SetRedraw(TRUE)` |
| `triggerevent` / `postevent` | `obj.TriggerEvent("ev")` or bare `TriggerEvent("ev")` | `this.TriggerEvent("clicked")` |
| `call` | `Call obj::event` | `Call super::clicked` |
| `barecall` | bare `funcName(` (no dot) | `f_validar()` |

`this.TriggerEvent(...)` is normalised to a bare self-trigger (targetObject = null). Built-in identifiers and PB keywords are filtered from `barecall` matches via `_isBuiltinIdentifier` / `_isPBKeyword`.

### `js/pb-analyzer.js` — `PBAnalyzer`

Takes `ParsedFile[]`, merges all objects into a single `Map<string, PBObject>` (keyed lowercase), then:

- **`_extractInheritanceEdges`** — emits `{ child, parent, isBuiltin }` edges; marks parents that are PB built-in types so the generator can optionally hide them.
- **`_resolveCallSites`** — walks every function/event body's pre-extracted `callSites` and resolves them against the object map, producing `crossObjectCalls` and `unresolvedCalls`.

Resolution pipeline for each call site (in `_resolveFromMember`):

1. **`barecall`** — searches current object's functions/prototypes, then walks the inheritance chain, then falls back to the parent window (`withinName`) if the caller is a control.
2. **Self `TriggerEvent`/`PostEvent`** (no targetObject) — checks in order: (1) event name matches a loaded object name (cross-object trigger); (2) current object's events; (3) parent window's events (if control); (4) current object's event stubs.
3. **`dotcall`/`call`/cross `TriggerEvent`** (with targetObject) — direct objectMap lookup, then fallback via `varTypeMap` (instance variable name → class type).

`_buildVarTypeMap` maps instance variable and control names to their types. Before calling `_resolveFromMember`, a `scopedVarMap` is built per-function/event that extends the object-level map with the current member's parameters — enabling resolution of calls like `a_dw.GetSQLSelect()` where `a_dw` is a parameter.

Unresolved calls go to `unresolvedCalls` with structure `{ fromObject, fromMember, kind, targetObject, targetMember, rawText }`.

### `js/mermaid-gen.js` — `MermaidGenerator`

Accepts `options` and an `AnalyzedProject`. Exposes two public methods:

- **`generate(project)`** — returns a `classDiagram` string. Rendering order: class blocks → inheritance edges → containment edges → call edges (`..>`). Call edges deduplicated by `fromObj..>toObj:label`.
- **`generateCallGraph(project)`** — returns a `flowchart LR/TB` string. Nodes are individual method/event instances grouped into `subgraph` blocks per object. Arestas resolvidas usam `-->`, não-resolvidas usam `-.->`.

Call graph node IDs use double-underscore as separator: `objectName__memberName`. External/unresolved target nodes get the prefix `ext__` and the `:::external` Mermaid class (yellow background).

All options (see constructor `_opts`) are passed from `App._getOptions()`:

| Option | Affects |
|---|---|
| `diagramType` | `'class'` or `'callgraph'` — selects which method `App` calls |
| `callGraphDirection` | `'LR'` or `'TB'` for flowchart layout |
| `includeInternalCalls` | Filter same-object calls in call graph |
| `includeUnresolvedCalls` | Show `unresolvedCalls` as external nodes (yellow) |
| `includeOrphanNodes` | Show all functions/events even with no calls |
| `includeVariables/Controls/Events/Functions` | Class diagram member visibility |
| `showBuiltinParents` | Class diagram inheritance to PB built-ins |

### `js/app.js` — `App` (IIFE)

Manages UI state (`_loadedFiles`, `_analyzedProject`, `_generatedText`). The pipeline runs inside `setTimeout(..., 0)` to allow the browser to repaint the loading indicator before the synchronous parse work begins. `_getOptions()` reads all checkboxes and radio buttons, then the pipeline calls either `generator.generateCallGraph()` or `generator.generate()` based on `diagramType`.

## Key data structures

```js
// PBObject (core unit, produced by PBParser)
{
  name, objectType, parentName, withinName, isControl,
  controls:   [{ name, typeName, withinName }],
  eventStubs: [{ name, returnType, params }],      // from type...end type
  events:     [{ ownerName, name, params, body, callSites, stubOnly? }],
  functions:  [{ access, kind, returnType, name, params, body, callSites }],
  prototypes: [{ access, kind, returnType, name, params }], // prototype-only (no body)
  variables:  [{ access, typeName, name, isArray }],
  sourceFile
}

// CallSite (detected in function/event bodies)
{ kind: 'dotcall'|'triggerevent'|'postevent'|'call'|'barecall', targetObject, targetMember, rawText }

// AnalyzedProject (produced by PBAnalyzer)
{
  objects: Map<string, PBObject>,
  inheritanceEdges: [{ child, parent, isBuiltin }],
  crossObjectCalls: [{ fromObject, fromMember, toObject, toMember, callSite }],
  unresolvedCalls:  [{ fromObject, fromMember, kind, targetObject, targetMember, rawText }]
}
```

## PowerBuilder source format conventions

- All parsing is **case-insensitive** (PB itself is); identifiers are normalised to lowercase for map lookups, original casing kept for display.
- A control's events appear in its parent window's file under `on controlName.eventName` — the parser routes them to the correct control object via `objectMap.get(ownerName.toLowerCase())`.
- `event name;` trailing semicolon = event terminator (no params). `on obj.event;string as_arg` semicolon = param separator. Context determines which is which.
- Functions without a matching prototype are attributed to the last non-control object (`_findFunctionOwner` falls back to `_getLastObject`).
- Built-in PB type list lives in `PBAnalyzer._builtinTypes` — extend it when new base types produce unwanted inheritance edges.
- Most real-world projects reference external objects not included in the loaded files. These produce `unresolvedCalls` entries — expected behaviour, visualised with the "Chamadas não resolvidas" option.
