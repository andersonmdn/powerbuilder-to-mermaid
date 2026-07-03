/**
 * call-graph.js
 * Generates a Mermaid flowchart (call graph) string from an AnalyzedProject.
 * Depends on: PB_CONSTANTS, StringUtils, RenderUtils.
 * Exposed as window.CallGraphGenerator.
 */
class CallGraphGenerator {

  /** @param {object} opts — same shape as MermaidGenerator._opts */
  constructor(opts) {
    this._opts = opts;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * @param {AnalyzedProject} project
   * @returns {string} complete Mermaid flowchart text
   */
  generateCallGraph(project) {
    const isIgnored = RenderUtils.getIsIgnored(this._opts.ignoredCallTargets);

    let calls = this._opts.includeInternalCalls
      ? project.crossObjectCalls
      : project.crossObjectCalls.filter(c => c.fromObject !== c.toObject);
    calls = calls.filter(c => !isIgnored(c.toMember));

    const unresolvedList = (this._opts.includeUnresolvedCalls
      ? (project.unresolvedCalls || [])
      : []
    ).filter(u => !isIgnored(u.targetMember || ''));

    if (!calls.length && !unresolvedList.length) {
      return `flowchart ${this._opts.callGraphDirection}\n    empty["Nenhuma chamada encontrada"]`;
    }

    const { nodesByObj, externalNodeIds } = this._collectCGNodes(project, calls, unresolvedList, isIgnored);

    const lines = [`flowchart ${this._opts.callGraphDirection}`];
    lines.push(...this._emitCGSubgraphs(nodesByObj, externalNodeIds));
    lines.push(...this._emitCGEdges(calls, unresolvedList));

    if (externalNodeIds.size) {
      lines.push('');
      lines.push(`  classDef external fill:${PB_CONSTANTS.COLOR_EXT_FILL},stroke:${PB_CONSTANTS.COLOR_EXT_STROKE},stroke-width:1px,color:${PB_CONSTANTS.COLOR_EXT_TEXT}`);
    }

    return lines.join('\n');
  }

  // ─── Node / edge collection ────────────────────────────────────────────────

  /** Collects all call-graph nodes, grouped by object. Returns nodesByObj and externalNodeIds. */
  _collectCGNodes(project, calls, unresolvedList, isIgnored) {
    const nodesByObj      = new Map(); // objName → Map<nodeId, label>
    const externalNodeIds = new Set();

    for (const c of calls) {
      for (const [obj, member] of [[c.fromObject, c.fromMember], [c.toObject, c.toMember]]) {
        if (!nodesByObj.has(obj)) nodesByObj.set(obj, new Map());
        nodesByObj.get(obj).set(RenderUtils.nodeId(obj, member), RenderUtils.nodeLabel(obj, member));
      }
    }

    for (const u of unresolvedList) {
      if (!nodesByObj.has(u.fromObject)) nodesByObj.set(u.fromObject, new Map());
      nodesByObj.get(u.fromObject).set(
        RenderUtils.nodeId(u.fromObject, u.fromMember),
        RenderUtils.nodeLabel(u.fromObject, u.fromMember)
      );

      const toObj    = u.targetObject || '?';
      const toMember = u.targetMember || '?';
      const tnid = PB_CONSTANTS.NODE_PREFIX_EXT + RenderUtils.nodeId(toObj, toMember);
      if (!nodesByObj.has(toObj)) nodesByObj.set(toObj, new Map());
      nodesByObj.get(toObj).set(tnid, RenderUtils.nodeLabel(toObj, toMember));
      externalNodeIds.add(tnid);
    }

    if (this._opts.includeOrphanNodes) {
      for (const obj of project.objects.values()) {
        for (const func of obj.functions) {
          if (isIgnored(func.name)) continue;
          if (!nodesByObj.has(obj.name)) nodesByObj.set(obj.name, new Map());
          nodesByObj.get(obj.name).set(RenderUtils.nodeId(obj.name, func.name), RenderUtils.nodeLabel(obj.name, func.name));
        }
        for (const event of obj.events) {
          if (isIgnored(event.name)) continue;
          if (!nodesByObj.has(obj.name)) nodesByObj.set(obj.name, new Map());
          nodesByObj.get(obj.name).set(RenderUtils.nodeId(obj.name, event.name), RenderUtils.nodeLabel(obj.name, event.name));
        }
      }
    }

    return { nodesByObj, externalNodeIds };
  }

  /** Emits subgraph blocks for all collected node groups. */
  _emitCGSubgraphs(nodesByObj, externalNodeIds) {
    const lines = [];
    for (const [obj, nodes] of nodesByObj) {
      lines.push('');
      lines.push(`  subgraph ${StringUtils.sanitiseName(obj)}["${obj}"]`);
      for (const [nid, label] of nodes) {
        const cls = externalNodeIds.has(nid) ? PB_CONSTANTS.CSS_CLASS_EXTERNAL : '';
        lines.push(`    ${nid}["${label}"]${cls}`);
      }
      lines.push('  end');
    }
    return lines;
  }

  /** Emits deduplicated edges for resolved (-->) and unresolved (-.->.) calls. */
  _emitCGEdges(calls, unresolvedList) {
    const lines = [''];
    const seen  = new Set();

    for (const c of calls) {
      const from = RenderUtils.nodeId(c.fromObject, c.fromMember);
      const to   = RenderUtils.nodeId(c.toObject,   c.toMember);
      const key  = `${from}-->${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${from} --> ${to}`);
    }

    for (const u of unresolvedList) {
      const from     = RenderUtils.nodeId(u.fromObject, u.fromMember);
      const toObj    = u.targetObject || '?';
      const toMember = u.targetMember || '?';
      const to       = PB_CONSTANTS.NODE_PREFIX_EXT + RenderUtils.nodeId(toObj, toMember);
      const key      = `${from}-..->${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${from} -.-> ${to}`);
    }

    return lines;
  }
}

window.CallGraphGenerator = CallGraphGenerator;
