/**
 * pb-parser.js
 * Parses PowerBuilder 2022 EditSource files into structured objects.
 * Exposed as window.PBParser.
 */
class PBParser {

  constructor() {
    this._cse = new CallSiteExtractor();
    this._lp  = new PBLineParser();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * @param {string} filename
   * @param {string} text - raw file content
   * @returns {ParsedFile}
   */
  parseFile(filename, text) {
    console.group(`[PBParser] parseFile: ${filename}`);
    console.log(`[PBParser] Tamanho do texto: ${text.length} chars`);

    const normalised = this._normaliseLines(text);
    const exportHeader = this._extractExportHeader(normalised);
    const blocks = this._splitIntoBlocks(normalised);
    const objectMap = new Map(); // lowercase name → PBObject

    console.log(`[PBParser] Blocos encontrados: ${blocks.length}`, blocks.map(b => b.kind));

    for (const block of blocks) {
      this._processBlock(block, objectMap, filename);
    }

    console.log(`[PBParser] Objetos no mapa: ${objectMap.size}`, [...objectMap.keys()]);

    // Merge event stubs into their event implementations
    for (const obj of objectMap.values()) {
      this._mergeEventStubs(obj);
    }

    const result = {
      filename,
      exportHeader,
      objects: Array.from(objectMap.values()),
    };

    console.log(`[PBParser] Resultado: ${result.objects.length} objetos em "${filename}"`);
    console.groupEnd();
    return result;
  }

  // ─── Block Splitting (state machine) ──────────────────────────────────────

  _splitIntoBlocks(text) {
    const S   = PB_CONSTANTS.PB_STATES;
    const ctx = { buffer: [], blocks: [] };

    const emit = (kind) => {
      if (ctx.buffer.length > 0) ctx.blocks.push({ kind, text: ctx.buffer.join('\n') });
      ctx.buffer = [];
    };

    const dispatch = new Map([
      [S.OTHER,         (line, t) => this._stateOther(line, t, ctx, emit, S)],
      [S.FORWARD,       (line, t) => this._stateForward(line, t, ctx, emit, S)],
      [S.TYPEDECL,      (line, t) => this._stateTypedecl(line, t, ctx, emit, S)],
      [S.TYPEVARIABLES, (line, t) => this._stateTypeVariables(line, t, ctx, emit, S)],
      [S.PROTOTYPES,    (line, t) => this._statePrototypes(line, t, ctx, emit, S)],
      [S.FUNCTION,      (line, t) => this._stateFunction(line, t, ctx, emit, S)],
      [S.EVENT,         (line, t) => this._stateEvent(line, t, ctx, emit, S)],
      [S.INLINE_EVENT,  (line, t) => this._stateInlineEvent(line, t, ctx, emit, S)],
    ]);

    let state = S.OTHER;
    for (const line of text.split('\n')) {
      const next = dispatch.get(state)(line, line.trim());
      if (next !== undefined) state = next;
    }

    if (ctx.buffer.length > 0 && ctx.buffer.some(l => l.trim())) {
      ctx.blocks.push({ kind: S.OTHER, text: ctx.buffer.join('\n') });
    }

    return ctx.blocks;
  }

  // ─── State handlers ────────────────────────────────────────────────────────

  _stateOther(line, trimmed, ctx, emit, S) {
    if (/^forward\s+prototypes\s*$/i.test(trimmed)) { emit(S.OTHER); return S.PROTOTYPES; }
    if (/^forward\s*$/i.test(trimmed))              { emit(S.OTHER); return S.FORWARD; }
    if (/^type\s+variables\s*$/i.test(trimmed))     { emit(S.OTHER); return S.TYPEVARIABLES; }
    if (/^(?:global|local)\s+type\s+\w+\s+from\s+\w+/i.test(trimmed)) {
      emit(S.OTHER); ctx.buffer.push(line); return S.TYPEDECL;
    }
    if (/^(public|protected|private)\s+(function|subroutine)\b/i.test(trimmed)) {
      emit(S.OTHER); ctx.buffer.push(line); return S.FUNCTION;
    }
    if (/^on\s+\w+\.\w+/i.test(trimmed)) { emit(S.OTHER); ctx.buffer.push(line); return S.EVENT; }
    if (/^event\b/i.test(trimmed))        { emit(S.OTHER); ctx.buffer.push(line); return S.INLINE_EVENT; }
    ctx.buffer.push(line);
  }

  _stateForward(line, trimmed, ctx, emit, S) {
    if (/^end\s+forward\s*$/i.test(trimmed)) { emit(S.FORWARD); return S.OTHER; }
    ctx.buffer.push(line);
  }

  _stateTypedecl(line, trimmed, ctx, emit, S) {
    ctx.buffer.push(line);
    if (/^end\s+type\s*$/i.test(trimmed)) { emit(S.TYPEDECL); return S.OTHER; }
  }

  _stateTypeVariables(line, trimmed, ctx, emit, S) {
    if (/^end\s+variables\s*$/i.test(trimmed)) { emit(S.TYPEVARIABLES); return S.OTHER; }
    ctx.buffer.push(line);
  }

  _statePrototypes(line, trimmed, ctx, emit, S) {
    if (/^end\s+prototypes\s*$/i.test(trimmed)) { emit(S.PROTOTYPES); return S.OTHER; }
    ctx.buffer.push(line);
  }

  _stateFunction(line, trimmed, ctx, emit, S) {
    ctx.buffer.push(line);
    if (/^end\s+(function|subroutine)\s*$/i.test(trimmed)) { emit(S.FUNCTION); return S.OTHER; }
  }

  _stateEvent(line, trimmed, ctx, emit, S) {
    ctx.buffer.push(line);
    if (/^end\s+on\s*$/i.test(trimmed)) { emit(S.EVENT); return S.OTHER; }
  }

  _stateInlineEvent(line, trimmed, ctx, emit, S) {
    ctx.buffer.push(line);
    if (/^end\s+event\s*$/i.test(trimmed)) { emit(S.INLINE_EVENT); return S.OTHER; }
  }

  // ─── Block Processors ─────────────────────────────────────────────────────

  _processBlock(block, objectMap, sourceFile) {
    console.debug(`[PBParser] _processBlock: kind="${block.kind}"`);
    switch (block.kind) {
      case 'forward':      return this._processForward(block.text, objectMap, sourceFile);
      case 'typedecl':     return this._processTypeDecl(block.text, objectMap, sourceFile);
      case 'typevariables':return this._processTypeVariables(block.text, objectMap);
      case 'prototypes':   return this._processPrototypes(block.text, objectMap);
      case 'function':     return this._processFunctionBlock(block.text, objectMap);
      case 'event':        return this._processEventBlock(block.text, objectMap);
      case 'inline_event': return this._processInlineEventBlock(block.text, objectMap);
    }
  }

  /** Parses the forward...end forward block for type and control declarations. */
  _processForward(text, objectMap, sourceFile) {
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Control: "type cb_ok from commandbutton within w_main"
      const ctrlMatch = trimmed.match(/^type\s+(\w+)\s+from\s+(\w+)\s+within\s+(\w+)/i);
      if (ctrlMatch) {
        const [, name, typeName, withinName] = ctrlMatch;
        this._getOrCreateObject(objectMap, name, sourceFile, {
          isControl: true,
          withinName,
          objectType: this._inferObjectType(typeName),
          parentName: typeName,
        });
        // Register this control on the parent
        const parent = objectMap.get(withinName.toLowerCase());
        if (parent) {
          parent.controls.push({ name, typeName, withinName });
        }
        continue;
      }

      // Top-level type: "global type w_main from w_ancestor"
      const typeMatch = trimmed.match(/^(?:global|local)\s+type\s+(\w+)\s+from\s+(\w+)(?:\s+within\s+(\w+))?/i);
      if (typeMatch) {
        const [, name, parentName, withinName] = typeMatch;
        this._getOrCreateObject(objectMap, name, sourceFile, {
          isControl: !!withinName,
          withinName: withinName || null,
          objectType: this._inferObjectType(parentName),
          parentName,
        });
      }
    }
  }

  /** Parses global type...end type blocks for event stubs. */
  _processTypeDecl(text, objectMap, sourceFile) {
    const lines = text.split('\n');
    const headerLine = lines[0]?.trim();
    if (!headerLine) return;

    const headerMatch = headerLine.match(/^(?:global|local)\s+type\s+(\w+)\s+from\s+(\w+)(?:\s+within\s+(\w+))?/i);
    if (!headerMatch) return;

    const [, name, parentName, withinName] = headerMatch;
    const obj = this._getOrCreateObject(objectMap, name, sourceFile, {
      isControl: !!withinName,
      withinName: withinName || null,
      objectType: this._inferObjectType(parentName),
      parentName,
    });

    for (let i = 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || /^end\s+type/i.test(trimmed)) continue;

      const stub = this._parseEventStub(trimmed);
      if (stub) {
        obj.eventStubs.push(stub);
      }
    }
  }

  /** Parses type variables...end variables for instance variable declarations. */
  _processTypeVariables(text, objectMap) {
    const lastObj = this._getLastObject(objectMap);
    if (!lastObj) return;

    let currentAccess = 'public';
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Pure access section separator: "protected:" or "protected" alone
      const accessMatch = trimmed.match(/^(public|protected|private)\s*:?\s*$/i);
      if (accessMatch) {
        currentAccess = accessMatch[1].toLowerCase();
        continue;
      }

      const variable = this._parseVariableLine(trimmed, currentAccess);
      if (variable) {
        // Sync currentAccess with inline modifier so subsequent bare lines inherit it
        currentAccess = variable.access;
        lastObj.variables.push(variable);
      }
    }
  }

  /** Parses forward prototypes...end prototypes for function signatures. */
  _processPrototypes(text, objectMap) {
    const lastObj = this._getLastObject(objectMap);
    if (!lastObj) return;

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const proto = this._parsePrototypeLine(trimmed);
      if (proto) {
        lastObj.prototypes.push(proto);
      }
    }
  }

  /** Parses a function/subroutine implementation block. */
  _processFunctionBlock(text, objectMap) {
    const lines = text.split('\n');
    if (!lines.length) return;

    const headerLine = lines[0].trim();
    const bodyLines = lines.slice(1, -1); // exclude header and "end function"
    const body = bodyLines.join('\n');

    const header = this._parseFunctionHeader(headerLine);
    if (!header) {
      console.warn(`[PBParser] _processFunctionBlock: header não parseado →`, headerLine);
      return;
    }

    // Find the object that owns this function via its prototypes
    const ownerObj = this._findFunctionOwner(header.name, objectMap);
    if (!ownerObj) {
      console.warn(`[PBParser] _processFunctionBlock: sem dono para função "${header.name}"`);
      return;
    }
    const callSites = this._extractCallSites(body);
    console.log(`[PBParser] Função "${ownerObj.name}.${header.name}" → body ${body.length} chars, ${callSites.length} call site(s)`);
    if (callSites.length > 0) {
      console.log(`  └─ call sites:`, callSites.map(s => `${s.kind}:${s.targetObject || 'self'}.${s.targetMember}`));
    }

    const func = {
      access: header.access,
      kind: header.kind,
      returnType: header.returnType,
      name: header.name,
      params: header.params,
      body,
      callSites,
    };

    // Replace prototype entry if present (merge)
    const protoIdx = ownerObj.prototypes.findIndex(
      p => p.name.toLowerCase() === header.name.toLowerCase()
    );
    if (protoIdx !== -1) {
      ownerObj.prototypes.splice(protoIdx, 1);
    }

    ownerObj.functions.push(func);
  }

  /** Parses an on...end on event implementation block. */
  _processEventBlock(text, objectMap) {
    const lines = text.split('\n');
    if (!lines.length) return;

    const headerLine = lines[0].trim();
    const bodyLines = lines.slice(1, -1); // exclude header and "end on"
    const body = bodyLines.join('\n');

    const header = this._parseEventHeader(headerLine);
    if (!header) return;

    const ownerObj = objectMap.get(header.ownerName.toLowerCase());
    if (!ownerObj) {
      console.warn(`[PBParser] _processEventBlock: sem dono para evento "${header.ownerName}.${header.name}"`);
      return;
    }
    const callSites = this._extractCallSites(body);
    console.log(`[PBParser] Evento "${header.ownerName}.${header.name}" → body ${body.length} chars, ${callSites.length} call site(s)`);
    if (callSites.length > 0) {
      console.log(`  └─ call sites:`, callSites.map(s => `${s.kind}:${s.targetObject || 'self'}.${s.targetMember}`));
    }

    const event = {
      ownerName: header.ownerName,
      name: header.name,
      params: header.params,
      body,
      callSites,
    };

    ownerObj.events.push(event);
  }

  /**
   * Parses an inline "event name() ... end event" block.
   * Owner is the last non-control object in the map (same heuristic as type variables).
   * Header forms:
   *   event name() ; local_var_decls
   *   event type returnType name() ; local_var_decls
   *   event name ; body_start
   *   event name
   */
  _processInlineEventBlock(text, objectMap) {
    const lines = text.split('\n');
    if (!lines.length) return;

    const headerLine = lines[0].trim();
    let name, params = [];

    // "event type returnType name(params)"
    const typedMatch = headerLine.match(/^event\s+type\s+\w+\s+(\w+)\s*\(([^)]*)\)/i);
    if (typedMatch) {
      name = typedMatch[1];
      params = this._parseParamList(typedMatch[2]);
    } else {
      // "event name(params)"
      const parenMatch = headerLine.match(/^event\s+(\w+)\s*\(([^)]*)\)/i);
      if (parenMatch) {
        name = parenMatch[1];
        params = this._parseParamList(parenMatch[2]);
      } else {
        // "event name ; ..." or "event name"
        const simpleMatch = headerLine.match(/^event\s+(\w+)/i);
        if (simpleMatch) name = simpleMatch[1];
      }
    }

    if (!name) {
      console.warn(`[PBParser] _processInlineEventBlock: header não parseado →`, headerLine);
      return;
    }

    // Include any body content on the header line (after the signature) + middle lines
    const headerSuffix = headerLine.replace(/^event\s+(?:type\s+\w+\s+)?\w+(?:\s*\([^)]*\))?\s*;?\s*/i, '');
    const body = [headerSuffix, ...lines.slice(1, -1)].join('\n');

    const ownerObj = this._getLastObject(objectMap);
    if (!ownerObj) {
      console.warn(`[PBParser] _processInlineEventBlock: sem dono para evento "${name}"`);
      return;
    }

    const callSites = this._extractCallSites(body);
    console.log(`[PBParser] Evento "${ownerObj.name}.${name}" → body ${body.length} chars, ${callSites.length} call site(s)`);
    if (callSites.length > 0) {
      console.log(`  └─ call sites:`, callSites.map(s => `${s.kind}:${s.targetObject || 'self'}.${s.targetMember}`));
    }

    ownerObj.events.push({
      ownerName: ownerObj.name,
      name,
      params,
      body,
      callSites,
    });
  }

  // ─── Line-level parsers & parameter parsing (delegates to PBLineParser) ────

  _parseEventStub(line)         { return this._lp.parseEventStub(line); }
  _parseVariableLine(line, acc) { return this._lp.parseVariableLine(line, acc); }
  _parsePrototypeLine(line)     { return this._lp.parsePrototypeLine(line); }
  _parseFunctionHeader(line)    { return this._lp.parseFunctionHeader(line); }
  _parseEventHeader(line)       { return this._lp.parseEventHeader(line); }
  _parseParamList(raw)          { return this._lp.parseParamList(raw); }
  _parseParam(raw)              { return this._lp.parseParam(raw); }

  // ─── Call site extraction ──────────────────────────────────────────────────

  _extractCallSites(body) {
    return this._cse.extractCallSites(body);
  }

  // ─── Event stub merging ────────────────────────────────────────────────────

  /**
   * Merges eventStubs into the events list.
   * Stubs provide the return type; implementations provide the body.
   */
  _mergeEventStubs(obj) {
    let mergedCount = 0;
    for (const stub of obj.eventStubs) {
      const existing = obj.events.find(
        e => e.name.toLowerCase() === stub.name.toLowerCase()
      );
      if (existing) {
        // Enrich implementation with stub signature info
        if (!existing.returnType) existing.returnType = stub.returnType;
        if (!existing.params.length && stub.params.length) {
          existing.params = stub.params;
        }
        mergedCount++;
      } else {
        // No implementation found — add as stub-only event (declared but not implemented here)
        obj.events.push({
          ownerName: obj.name,
          name: stub.name,
          returnType: stub.returnType,
          params: stub.params,
          body: null,
          callSites: [],
          stubOnly: true,
        });
      }
    }
    if (obj.eventStubs.length > 0) {
      console.debug(`[PBParser] _mergeEventStubs: ${obj.name} — ${mergedCount}/${obj.eventStubs.length} stub(s) mesclado(s)`);
    }
  }

  // ─── Object registry helpers ───────────────────────────────────────────────

  _getOrCreateObject(objectMap, name, sourceFile, defaults = {}) {
    const key = name.toLowerCase();
    if (!objectMap.has(key)) {
      objectMap.set(key, {
        name,
        objectType: defaults.objectType || 'unknown',
        parentName: defaults.parentName || null,
        withinName: defaults.withinName || null,
        isControl: defaults.isControl || false,
        controls: [],
        eventStubs: [],
        variables: [],
        prototypes: [],
        functions: [],
        events: [],
        sourceFile,
      });
    } else {
      // Update fields that may be missing
      const obj = objectMap.get(key);
      if (!obj.parentName && defaults.parentName) obj.parentName = defaults.parentName;
      if (!obj.withinName && defaults.withinName) obj.withinName = defaults.withinName;
      if (defaults.objectType && obj.objectType === 'unknown') obj.objectType = defaults.objectType;
    }
    return objectMap.get(key);
  }

  /** Returns the last object inserted into the map (for context-dependent sections). */
  _getLastObject(objectMap) {
    const values = Array.from(objectMap.values());
    // Return last non-control object, or last object if all are controls
    for (let i = values.length - 1; i >= 0; i--) {
      if (!values[i].isControl) return values[i];
    }
    return values[values.length - 1] || null;
  }

  /**
   * Finds which object owns a function by matching the function name against
   * prototypes. Falls back to the last non-control object.
   */
  _findFunctionOwner(funcName, objectMap) {
    for (const obj of objectMap.values()) {
      const hasProto = obj.prototypes.some(
        p => p.name.toLowerCase() === funcName.toLowerCase()
      );
      if (hasProto) return obj;
    }
    return this._getLastObject(objectMap);
  }

  // ─── Utility helpers ───────────────────────────────────────────────────────

  _extractExportHeader(text) {
    const match = text.match(/^\$PBExportHeader\$(\S+)/im);
    return match ? match[1] : null;
  }

  _normaliseLines(text)        { return StringUtils.normaliseLines(text); }

  _inferObjectType(parentName) {
    if (!parentName) return 'unknown';
    const p = parentName.toLowerCase();
    if (p === 'window' || p.startsWith('w_')) return 'window';
    if (p === 'menu' || p.startsWith('m_')) return 'menu';
    if (p === 'datawindow' || p === 'dw') return 'datawindow';
    if (p === 'nonvisualobject') return 'nonvisual';
    if (p === 'userobject') return 'userobject';
    return 'userobject';
  }


}

window.PBParser = PBParser;
