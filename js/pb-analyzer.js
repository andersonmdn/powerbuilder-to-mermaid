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
      // Resolve from function bodies
      for (const func of obj.functions) {
        this._resolveFromMember(
          func.callSites, obj.name, func.name,
          objectMap, crossObjectCalls, unresolvedCalls
        );
      }

      // Resolve from event bodies
      for (const event of obj.events) {
        if (!event.body) continue;
        this._resolveFromMember(
          event.callSites, obj.name, event.name,
          objectMap, crossObjectCalls, unresolvedCalls
        );
      }
    }

    if (unresolvedCalls.length > 0) {
      console.warn(`[PBAnalyzer] ${unresolvedCalls.length} call site(s) não resolvido(s):`,
        unresolvedCalls.map(u => `${u.fromObject}.${u.fromMember} → ${u.targetObject}`));
    }
    return { crossObjectCalls, unresolvedCalls };
  }

  _resolveFromMember(callSites, fromObject, fromMember, objectMap, crossCalls, unresolved) {
    for (const site of callSites) {
      const hasCrossTarget =
        (site.kind === 'dotcall' ||
         site.kind === 'call' ||
         site.kind === 'triggerevent' ||
         site.kind === 'postevent') &&
        site.targetObject;

      if (hasCrossTarget) {
        const targetKey = site.targetObject.toLowerCase();
        if (objectMap.has(targetKey)) {
          crossCalls.push({
            fromObject,
            fromMember,
            toObject: objectMap.get(targetKey).name,
            toMember: site.targetMember,
            callSite: site,
          });
        } else {
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
