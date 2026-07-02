/**
 * pb-analyzer.js
 * Analyzes multiple parsed PB files, builds an object registry, resolves
 * inheritance edges and cross-object call relationships.
 * Exposed as window.PBAnalyzer.
 */
class PBAnalyzer {

  constructor() {
    // PB built-in base types — skip these as inheritance targets unless
    // the user explicitly wants to show them.
    this._builtinTypes = new Set([
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
    ]);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * @param {ParsedFile[]} parsedFiles
   * @returns {AnalyzedProject}
   */
  analyze(parsedFiles) {
    console.group('[PBAnalyzer] analyze');
    console.time('[PBAnalyzer] analyze');

    const objectMap = this._buildObjectMap(parsedFiles);
    console.log(`[PBAnalyzer] Mapa de objetos: ${objectMap.size} objeto(s)`);

    const inheritanceEdges = this._extractInheritanceEdges(objectMap);
    const builtinEdges = inheritanceEdges.filter(e => e.isBuiltin).length;
    console.log(`[PBAnalyzer] Edges de herança: ${inheritanceEdges.length} (${builtinEdges} para tipos built-in)`);

    const { crossObjectCalls, unresolvedCalls } = this._resolveCallSites(objectMap);
    console.log(`[PBAnalyzer] Chamadas cruzadas resolvidas: ${crossObjectCalls.length}, não resolvidas: ${unresolvedCalls.length}`);

    console.timeEnd('[PBAnalyzer] analyze');
    console.groupEnd();

    return {
      objects: objectMap,
      inheritanceEdges,
      crossObjectCalls,
      unresolvedCalls,
    };
  }

  // ─── Object registry ───────────────────────────────────────────────────────

  /**
   * Merges all objects from all files into a single map.
   * Warns (console) on duplicate names.
   * @returns {Map<string, PBObject>}
   */
  _buildObjectMap(parsedFiles) {
    console.log(`[PBAnalyzer] _buildObjectMap: ${parsedFiles.length} arquivo(s)`);
    const map = new Map();

    for (const file of parsedFiles) {
      for (const obj of file.objects) {
        const key = obj.name.toLowerCase();
        if (map.has(key)) {
          console.warn(
            `[PBAnalyzer] Duplicate object name "${obj.name}" found in ` +
            `"${obj.sourceFile}" (already registered from "${map.get(key).sourceFile}"). ` +
            `Keeping first occurrence.`
          );
          continue;
        }
        map.set(key, obj);
      }
    }

    console.log(`[PBAnalyzer] _buildObjectMap: ${map.size} objetos únicos`);
    return map;
  }

  // ─── Inheritance edges ─────────────────────────────────────────────────────

  /**
   * Builds inheritance edges from all objects in the map.
   * Skips edges where the parent is a known PB built-in type.
   * Detects and breaks circular inheritance.
   * @returns {{ child: string, parent: string, isBuiltin: boolean }[]}
   */
  _extractInheritanceEdges(objectMap) {
    const edges = [];
    const visited = new Set();

    for (const obj of objectMap.values()) {
      if (!obj.parentName) continue;

      // Circular inheritance guard
      const cycleKey = `${obj.name.toLowerCase()}→${obj.parentName.toLowerCase()}`;
      if (visited.has(cycleKey)) {
        console.warn(`[PBAnalyzer] Circular inheritance detected: ${cycleKey}`);
        continue;
      }
      visited.add(cycleKey);

      const isBuiltin = this._isBuiltin(obj.parentName);
      edges.push({
        child: obj.name,
        parent: obj.parentName,
        isBuiltin,
      });
    }

    return edges;
  }

  // ─── Cross-object call resolution ─────────────────────────────────────────

  /**
   * For every function and event body across all objects, resolves dotcall /
   * Call / TriggerEvent call sites against the object registry.
   * @returns {{ crossObjectCalls, unresolvedCalls }}
   */
  _resolveCallSites(objectMap) {
    const crossObjectCalls = [];
    const unresolvedCalls = [];

    for (const obj of objectMap.values()) {
      const varTypeMap = this._buildVarTypeMap(obj);

      // Resolve from function bodies
      for (const func of obj.functions) {
        console.log(`[PBAnalyzer] Resolvendo função ${obj.name}.${func.name}: ${func.callSites.length} call site(s)`);
        this._resolveFromMember(
          func.callSites, obj.name, func.name,
          objectMap, varTypeMap, crossObjectCalls, unresolvedCalls
        );
      }

      // Resolve from event bodies
      for (const event of obj.events) {
        if (!event.body) continue;
        console.log(`[PBAnalyzer] Resolvendo evento ${obj.name}.${event.name}: ${event.callSites.length} call site(s)`);
        this._resolveFromMember(
          event.callSites, obj.name, event.name,
          objectMap, varTypeMap, crossObjectCalls, unresolvedCalls
        );
      }
    }

    console.log(`[PBAnalyzer] ✔ Chamadas resolvidas (${crossObjectCalls.length}):`,
      crossObjectCalls.map(c => `${c.fromObject}.${c.fromMember} → ${c.toObject}.${c.toMember}`));
    if (unresolvedCalls.length > 0) {
      console.warn(`[PBAnalyzer] ✘ Chamadas não resolvidas (${unresolvedCalls.length}) — objeto não carregado?`,
        unresolvedCalls.map(u => `${u.fromObject}.${u.fromMember} → ${u.targetObject}.${u.targetMember}`));
    }
    return { crossObjectCalls, unresolvedCalls };
  }

  /**
   * Builds a map from variable/control instance name → type name for a given object.
   * Used to resolve call sites where the code uses a variable name (e.g. `iu_service`)
   * instead of the class name (e.g. `u_retrieve_dados`).
   */
  _buildVarTypeMap(obj) {
    const map = new Map();
    for (const v of obj.variables) {
      map.set(v.name.toLowerCase(), v.typeName.toLowerCase());
    }
    for (const c of obj.controls) {
      map.set(c.name.toLowerCase(), c.typeName.toLowerCase());
    }
    return map;
  }

  _resolveFromMember(callSites, fromObject, fromMember, objectMap, varTypeMap, crossCalls, unresolved) {
    for (const site of callSites) {
      const hasCrossTarget =
        (site.kind === 'dotcall' ||
         site.kind === 'call' ||
         site.kind === 'triggerevent' ||
         site.kind === 'postevent') &&
        site.targetObject;

      // Bare self-call: funcName( without dot — resolve against current object AND ancestors
      if (site.kind === 'barecall') {
        const ownerObj = objectMap.get(fromObject.toLowerCase());
        if (ownerObj) {
          let searchObj = ownerObj;
          let hasFunc = false;
          let foundOn = null;
          while (searchObj && !hasFunc) {
            hasFunc =
              searchObj.functions.some(f  => f.name.toLowerCase()  === site.targetMember.toLowerCase()) ||
              searchObj.prototypes.some(p => p.name.toLowerCase() === site.targetMember.toLowerCase());
            if (hasFunc) {
              foundOn = searchObj.name;
            } else if (searchObj.parentName && !this._isBuiltin(searchObj.parentName)) {
              searchObj = objectMap.get(searchObj.parentName.toLowerCase());
            } else {
              break;
            }
          }
          if (hasFunc) {
            console.log(`[PBAnalyzer] barecall ✔ ${fromObject}.${fromMember} → ${fromObject}.${site.targetMember} (def. em ${foundOn})`);
            crossCalls.push({ fromObject, fromMember, toObject: fromObject, toMember: site.targetMember, callSite: site });
          } else {
            console.log(`[PBAnalyzer] barecall ✘ ${fromObject}.${fromMember} → .${site.targetMember} — não encontrado (global/built-in/não carregado)`);
          }
        }
        continue;
      }

      // Self-triggered events whose name matches a known object → cross-object dependency
      // e.g. "Trigger Event u_retrieve_dados()" when u_retrieve_dados is in objectMap
      const isSelfEventTrigger =
        (site.kind === 'triggerevent' || site.kind === 'postevent') && !site.targetObject;
      if (isSelfEventTrigger) {
        const resolvedObj = objectMap.get(site.targetMember.toLowerCase());
        if (resolvedObj) {
          console.log(`[PBAnalyzer] Trigger Event resolvido: ${fromObject}.${fromMember} → ${resolvedObj.name}`);
          crossCalls.push({
            fromObject,
            fromMember,
            toObject: resolvedObj.name,
            toMember: site.targetMember,
            callSite: site,
          });
        } else {
          console.log(`[PBAnalyzer] Trigger Event não resolvido: "${site.targetMember}" chamado em ${fromObject}.${fromMember} — objeto não encontrado no mapa`);
        }
        continue;
      }

      if (hasCrossTarget) {
        const targetKey = site.targetObject.toLowerCase();
        // Step 1: direct lookup by object/control name
        let resolvedObj = objectMap.get(targetKey);
        // Step 2: resolve via instance variable type (e.g. iu_service → u_retrieve_dados)
        if (!resolvedObj) {
          const varType = varTypeMap.get(targetKey);
          if (varType) {
            resolvedObj = objectMap.get(varType);
            if (resolvedObj) console.log(`[PBAnalyzer] dotcall ✔ via varTypeMap: ${fromObject}.${fromMember} → ${targetKey}(=${varType}) → ${resolvedObj.name}.${site.targetMember}`);
          }
        } else {
          console.log(`[PBAnalyzer] dotcall ✔ direto: ${fromObject}.${fromMember} → ${resolvedObj.name}.${site.targetMember}`);
        }

        if (resolvedObj) {
          crossCalls.push({
            fromObject,
            fromMember,
            toObject: resolvedObj.name,
            toMember: site.targetMember,
            callSite: site,
          });
        } else {
          console.log(`[PBAnalyzer] dotcall ✘ ${fromObject}.${fromMember} → ${site.targetObject}.${site.targetMember} — "${site.targetObject}" não no mapa nem em varTypeMap`);
          unresolved.push({ fromObject, fromMember, ...site });
        }
      }
      // TriggerEvent / PostEvent with no explicit target → self-call, skip
    }
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  _isBuiltin(name) {
    return this._builtinTypes.has(name.toLowerCase());
  }

  _normalise(name) {
    return name.toLowerCase().trim();
  }
}

window.PBAnalyzer = PBAnalyzer;
