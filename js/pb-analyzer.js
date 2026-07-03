/**
 * pb-analyzer.js
 * Analyzes multiple parsed PB files, builds an object registry, resolves
 * inheritance edges and cross-object call relationships.
 * Depends on: PB_CONSTANTS, CallResolver.
 * Exposed as window.PBAnalyzer.
 */
class PBAnalyzer {

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

      const isBuiltin = PB_CONSTANTS.PB_BUILTIN_TYPES_SET.has(obj.parentName.toLowerCase());
      edges.push({
        child: obj.name,
        parent: obj.parentName,
        isBuiltin,
      });
    }

    return edges;
  }

  // ─── Cross-object call resolution ─────────────────────────────────────────

  /** Delegates all call-site resolution to CallResolver. */
  _resolveCallSites(objectMap) {
    const { crossObjectCalls, unresolvedCalls } = new CallResolver(objectMap).resolveAll();
    console.log(`[PBAnalyzer] ✔ Chamadas resolvidas (${crossObjectCalls.length}):`,
      crossObjectCalls.map(c => `${c.fromObject}.${c.fromMember} → ${c.toObject}.${c.toMember}`));
    if (unresolvedCalls.length > 0) {
      console.warn(`[PBAnalyzer] ✘ Chamadas não resolvidas (${unresolvedCalls.length}) — objeto não carregado?`,
        unresolvedCalls.map(u => `${u.fromObject}.${u.fromMember} → ${u.targetObject}.${u.targetMember}`));
    }
    return { crossObjectCalls, unresolvedCalls };
  }
}

window.PBAnalyzer = PBAnalyzer;
