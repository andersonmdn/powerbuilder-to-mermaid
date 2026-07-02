/**
 * pb-parser.js
 * Parses PowerBuilder 2022 EditSource files into structured objects.
 * Exposed as window.PBParser.
 */
class PBParser {

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * @param {string} filename
   * @param {string} text - raw file content
   * @returns {ParsedFile}
   */
  parseFile(filename, text) {
    const normalised = this._normaliseLines(text);
    const exportHeader = this._extractExportHeader(normalised);
    const blocks = this._splitIntoBlocks(normalised);
    const objectMap = new Map(); // lowercase name → PBObject

    for (const block of blocks) {
      this._processBlock(block, objectMap, filename);
    }

    // Merge event stubs into their event implementations
    for (const obj of objectMap.values()) {
      this._mergeEventStubs(obj);
    }

    return {
      filename,
      exportHeader,
      objects: Array.from(objectMap.values()),
    };
  }

  // ─── Block Splitting (state machine) ──────────────────────────────────────

  /**
   * Splits the normalised source into labelled blocks using a line-by-line
   * state machine.
   * @returns {Block[]}
   */
  _splitIntoBlocks(text) {
    const lines = text.split('\n');
    const blocks = [];

    const STATE = {
      OTHER: 'other',
      FORWARD: 'forward',
      TYPEDECL: 'typedecl',
      TYPEVARIABLES: 'typevariables',
      PROTOTYPES: 'prototypes',
      FUNCTION: 'function',
      EVENT: 'event',
    };

    let state = STATE.OTHER;
    let buffer = [];
    let meta = {}; // extra info per block type

    const emit = (kind, extraMeta) => {
      if (buffer.length > 0) {
        blocks.push({ kind, text: buffer.join('\n'), ...extraMeta });
      }
      buffer = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();

      switch (state) {
        case STATE.OTHER: {
          if (/^forward\s+prototypes\s*$/i.test(trimmed)) {
            emit(STATE.OTHER, {});
            state = STATE.PROTOTYPES;
          } else if (/^forward\s*$/i.test(trimmed)) {
            emit(STATE.OTHER, {});
            state = STATE.FORWARD;
          } else if (/^type\s+variables\s*$/i.test(trimmed)) {
            emit(STATE.OTHER, {});
            state = STATE.TYPEVARIABLES;
          } else if (/^(?:global|local)\s+type\s+\w+\s+from\s+\w+/i.test(trimmed)) {
            emit(STATE.OTHER, {});
            state = STATE.TYPEDECL;
            buffer.push(line);
          } else if (/^(public|protected|private)\s+(function|subroutine)\b/i.test(trimmed)) {
            emit(STATE.OTHER, {});
            state = STATE.FUNCTION;
            buffer.push(line);
          } else if (/^on\s+\w+\.\w+/i.test(trimmed)) {
            emit(STATE.OTHER, {});
            state = STATE.EVENT;
            buffer.push(line);
          } else {
            buffer.push(line);
          }
          break;
        }

        case STATE.FORWARD: {
          if (/^end\s+forward\s*$/i.test(trimmed)) {
            emit(STATE.FORWARD, {});
            state = STATE.OTHER;
          } else {
            buffer.push(line);
          }
          break;
        }

        case STATE.TYPEDECL: {
          buffer.push(line);
          if (/^end\s+type\s*$/i.test(trimmed)) {
            emit(STATE.TYPEDECL, {});
            state = STATE.OTHER;
          }
          break;
        }

        case STATE.TYPEVARIABLES: {
          if (/^end\s+variables\s*$/i.test(trimmed)) {
            emit(STATE.TYPEVARIABLES, {});
            state = STATE.OTHER;
          } else {
            buffer.push(line);
          }
          break;
        }

        case STATE.PROTOTYPES: {
          if (/^end\s+prototypes\s*$/i.test(trimmed)) {
            emit(STATE.PROTOTYPES, {});
            state = STATE.OTHER;
          } else {
            buffer.push(line);
          }
          break;
        }

        case STATE.FUNCTION: {
          buffer.push(line);
          if (/^end\s+(function|subroutine)\s*$/i.test(trimmed)) {
            emit(STATE.FUNCTION, {});
            state = STATE.OTHER;
          }
          break;
        }

        case STATE.EVENT: {
          buffer.push(line);
          if (/^end\s+on\s*$/i.test(trimmed)) {
            emit(STATE.EVENT, {});
            state = STATE.OTHER;
          }
          break;
        }
      }
    }

    // Flush remaining buffer
    if (buffer.length > 0 && buffer.some(l => l.trim())) {
      blocks.push({ kind: STATE.OTHER, text: buffer.join('\n') });
    }

    return blocks;
  }

  // ─── Block Processors ─────────────────────────────────────────────────────

  _processBlock(block, objectMap, sourceFile) {
    switch (block.kind) {
      case 'forward':      return this._processForward(block.text, objectMap, sourceFile);
      case 'typedecl':     return this._processTypeDecl(block.text, objectMap, sourceFile);
      case 'typevariables':return this._processTypeVariables(block.text, objectMap);
      case 'prototypes':   return this._processPrototypes(block.text, objectMap);
      case 'function':     return this._processFunctionBlock(block.text, objectMap);
      case 'event':        return this._processEventBlock(block.text, objectMap);
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
    if (!header) return;

    // Find the object that owns this function via its prototypes
    const ownerObj = this._findFunctionOwner(header.name, objectMap);
    if (!ownerObj) return;

    const func = {
      access: header.access,
      kind: header.kind,
      returnType: header.returnType,
      name: header.name,
      params: header.params,
      body,
      callSites: this._extractCallSites(body),
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
    if (!ownerObj) return;

    const event = {
      ownerName: header.ownerName,
      name: header.name,
      params: header.params,
      body,
      callSites: this._extractCallSites(body),
    };

    ownerObj.events.push(event);
  }

  // ─── Line-level parsers ────────────────────────────────────────────────────

  /**
   * Parses an event stub inside a type...end type block.
   * Forms:
   *   event ue_custom;
   *   event type long ue_with_return (string as_param)
   */
  _parseEventStub(line) {
    // Typed event: "event type long ue_with_return (string as_param)"
    const typedMatch = line.match(/^event\s+type\s+(\w+)\s+(\w+)\s*\(([^)]*)\)/i);
    if (typedMatch) {
      const [, returnType, name, rawParams] = typedMatch;
      return { name, returnType, params: this._parseParamList(rawParams) };
    }

    // Simple event with optional trailing params: "event ue_custom;" or "event ue_custom;string as_arg"
    const simpleMatch = line.match(/^event\s+(\w+)\s*;(.*)$/i);
    if (simpleMatch) {
      const [, name, rawParams] = simpleMatch;
      return { name, returnType: null, params: this._parseParamList(rawParams.trim()) };
    }

    return null;
  }

  /** Parses a variable declaration line given the current access modifier. */
  _parseVariableLine(line, access) {
    if (/^(public|protected|private)\s*:?\s*$/i.test(line)) return null;
    if (line.startsWith('//')) return null;

    let rest = line;
    let resolvedAccess = access;

    // Strip leading access and sub-access modifier words.
    // Main: public, protected, private
    // Sub: privateread, protectedread, systemread, privatewrite, protectedwrite, systemwrite
    const modRe = /^(public|protected|private|privateread|protectedread|systemread|privatewrite|protectedwrite|systemwrite)\s+/i;
    let found;
    while ((found = rest.match(modRe))) {
      const w = found[1].toLowerCase();
      if (w === 'public' || w === 'protected' || w === 'private') {
        resolvedAccess = w;
      }
      rest = rest.slice(found[0].length);
    }

    // Remaining: "typeName name" or "typeName[] name" or "typeName name[]" with optional "= value"
    const match = rest.match(/^(\w+(?:\[\])?)\s+(\w+)(\[\])?\s*(?:=.*)?$/i);
    if (!match) return null;

    const [, rawType, name, bracketOnName] = match;
    const isArray = rawType.endsWith('[]') || !!bracketOnName;

    return {
      access: resolvedAccess,
      typeName: rawType.replace('[]', ''),
      name,
      isArray,
    };
  }

  /** Parses a prototype declaration line. */
  _parsePrototypeLine(line) {
    const match = line.match(
      /^(public|protected|private)\s+(function|subroutine)\s+(?:(\w+)\s+)?(\w+)\s*\(([^)]*)\)/i
    );
    if (!match) return null;

    const [, access, kind, returnType, name, rawParams] = match;
    return {
      access: access.toLowerCase(),
      kind: kind.toLowerCase(),
      returnType: kind.toLowerCase() === 'subroutine' ? 'void' : (returnType || 'void'),
      name,
      params: this._parseParamList(rawParams),
    };
  }

  /** Parses a function/subroutine header line. */
  _parseFunctionHeader(line) {
    const match = line.match(
      /^(public|protected|private)\s+(function|subroutine)\s+(?:(\w+)\s+)?(\w+)\s*\(([^)]*)\)/i
    );
    if (!match) return null;

    const [, access, kind, returnType, name, rawParams] = match;
    return {
      access: access.toLowerCase(),
      kind: kind.toLowerCase(),
      returnType: kind.toLowerCase() === 'subroutine' ? 'void' : (returnType || 'void'),
      name,
      params: this._parseParamList(rawParams),
    };
  }

  /**
   * Parses an "on obj.event" or "on obj.event;params" header line.
   */
  _parseEventHeader(line) {
    // With params after semicolon: "on w_main.ue_custom;string as_arg"
    const withParams = line.match(/^on\s+(\w+)\.(\w+)\s*;(.+)$/i);
    if (withParams) {
      const [, ownerName, name, rawParams] = withParams;
      return { ownerName, name, params: this._parseParamList(rawParams.trim()) };
    }

    // Without params: "on w_main.open"
    const noParams = line.match(/^on\s+(\w+)\.(\w+)\s*$/i);
    if (noParams) {
      const [, ownerName, name] = noParams;
      return { ownerName, name, params: [] };
    }

    return null;
  }

  // ─── Parameter parsing ─────────────────────────────────────────────────────

  /** Parses a comma-separated parameter string into PBParam[]. */
  _parseParamList(raw) {
    if (!raw || !raw.trim()) return [];

    return raw.split(',')
      .map(p => this._parseParam(p.trim()))
      .filter(Boolean);
  }

  /** Parses a single parameter like "ref string as_name" or "integer ai_val". */
  _parseParam(raw) {
    if (!raw) return null;

    const passByRef = /^ref\s+/i.test(raw);
    const withoutRef = raw.replace(/^ref\s+/i, '').trim();

    // "typeName name" — two words
    const match = withoutRef.match(/^(\w+(?:\[\])?)\s+(\w+)(?:\[\])?$/i);
    if (!match) return null;

    const [, typeName, name] = match;
    return { typeName, name, passByRef };
  }

  // ─── Call site extraction ──────────────────────────────────────────────────

  /**
   * Scans body text for cross-object call patterns.
   * @returns {CallSite[]}
   */
  _extractCallSites(body) {
    if (!body) return [];

    const sites = [];
    // Strip string literals first, then comments, so we don't match inside strings
    const stripped = this._stripComments(this._stripStringLiterals(body));

    let m;

    // Cross-object TriggerEvent / PostEvent: "obj.TriggerEvent("event")"
    // Must run BEFORE dotcall loop to avoid double-counting
    const crossTrigRe = /\b(\w+)\.(TriggerEvent|PostEvent)\s*\(\s*["'](\w+)["']/gi;
    while ((m = crossTrigRe.exec(stripped)) !== null) {
      if (!this._isBuiltinIdentifier(m[1])) {
        sites.push({
          kind: m[2].toLowerCase(),   // 'triggerevent' or 'postevent'
          targetObject: m[1],
          targetMember: m[3],
          rawText: m[0],
        });
      }
    }

    // dotcall: identifier.identifier( — skip TriggerEvent/PostEvent (handled above)
    const dotRe = /\b(\w+)\.(\w+)\s*\(/g;
    while ((m = dotRe.exec(stripped)) !== null) {
      if (!this._isBuiltinIdentifier(m[1]) &&
          !/^(TriggerEvent|PostEvent)$/i.test(m[2])) {
        sites.push({
          kind: 'dotcall',
          targetObject: m[1],
          targetMember: m[2],
          rawText: m[0],
        });
      }
    }

    // Self TriggerEvent / PostEvent (no object prefix): "TriggerEvent("event")"
    const selfTrigRe = /(?<![.\w])(TriggerEvent|PostEvent)\s*\(\s*["'](\w+)["']/gi;
    while ((m = selfTrigRe.exec(stripped)) !== null) {
      sites.push({
        kind: m[1].toLowerCase(),
        targetObject: null, // self
        targetMember: m[2],
        rawText: m[0],
      });
    }

    // Call objectvar::eventname
    const callRe = /\bCall\s+(\w+)::(\w+)\b/gi;
    while ((m = callRe.exec(stripped)) !== null) {
      sites.push({
        kind: 'call',
        targetObject: m[1],
        targetMember: m[2],
        rawText: m[0],
      });
    }

    return sites;
  }

  // ─── Event stub merging ────────────────────────────────────────────────────

  /**
   * Merges eventStubs into the events list.
   * Stubs provide the return type; implementations provide the body.
   */
  _mergeEventStubs(obj) {
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

  _normaliseLines(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  /** Removes // line comments from code body. */
  _stripComments(text) {
    return text.replace(/\/\/.*$/gm, '');
  }

  /** Blanks out string literal content so regexes don't match inside strings. */
  _stripStringLiterals(text) {
    return text.replace(/"[^"\n]*"/g, match => '"' + ' '.repeat(match.length - 2) + '"');
  }

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

  /** PB built-in identifiers that are false positives for cross-object call detection. */
  _isBuiltinIdentifier(name) {
    const builtins = new Set([
      'this', 'super', 'parent', 'string', 'integer', 'long', 'ulong',
      'date', 'time', 'datetime', 'boolean', 'double', 'decimal', 'real',
      'blob', 'any', 'byte', 'char', 'uint', 'longlong', 'powerobject',
      'window', 'menu', 'datawindow', 'nonvisualobject',
    ]);
    return builtins.has(name.toLowerCase());
  }
}

window.PBParser = PBParser;
