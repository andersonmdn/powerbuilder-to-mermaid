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

### `js/pb-analyzer.js` — `PBAnalyzer`

Takes `ParsedFile[]`, merges all objects into a single `Map<string, PBObject>` (keyed lowercase), then:
- **`_extractInheritanceEdges`** — emits `{ child, parent, isBuiltin }` edges; marks parents that are PB built-in types so the generator can optionally hide them.
- **`_resolveCallSites`** — walks every function/event body's pre-extracted `callSites` and resolves `dotcall`/`Call` targets against the object map, producing `crossObjectCalls` and `unresolvedCalls`.

### `js/mermaid-gen.js` — `MermaidGenerator`

Accepts `options` flags and an `AnalyzedProject`, returns a Mermaid `classDiagram` string. Rendering order: class blocks → inheritance edges → containment edges → call edges.

- Events rendered with `~event~` prefix to distinguish from functions.
- `_sanitiseName` — makes object names Mermaid-safe (replaces non-`\w` with `_`).
- `_sanitiseLabel` — escapes `<>":` in edge labels.
- Call edges are deduplicated by `fromObj..>toObj:label` key.

### `js/app.js` — `App` (IIFE)

Manages UI state (`_loadedFiles`, `_analyzedProject`, `_generatedText`). The pipeline runs inside `setTimeout(..., 0)` to allow the browser to repaint the loading indicator before the synchronous parse work begins.

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
{ kind: 'dotcall'|'triggerevent'|'postevent'|'call', targetObject, targetMember, rawText }

// AnalyzedProject (produced by PBAnalyzer)
{ objects: Map<string, PBObject>, inheritanceEdges, crossObjectCalls, unresolvedCalls }
```

## PowerBuilder source format conventions

- All parsing is **case-insensitive** (PB itself is); identifiers are normalised to lowercase for map lookups, original casing kept for display.
- A control's events appear in its parent window's file under `on controlName.eventName` — the parser routes them to the correct control object via `objectMap.get(ownerName.toLowerCase())`.
- `event name;` trailing semicolon = event terminator (no params). `on obj.event;string as_arg` semicolon = param separator. Context determines which is which.
- Functions without a matching prototype are attributed to the last non-control object (`_findFunctionOwner` falls back to `_getLastObject`).
- Built-in PB type list lives in `PBAnalyzer._builtinTypes` — extend it when new base types produce unwanted inheritance edges.
