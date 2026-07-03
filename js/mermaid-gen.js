/**
 * mermaid-gen.js
 * Generates a Mermaid classDiagram string from an AnalyzedProject.
 * Exposed as window.MermaidGenerator.
 */
class MermaidGenerator {

  /**
   * @param {object} options
   * @param {boolean} options.includeVariables   - Show instance variables
   * @param {boolean} options.includeControls    - Show containment edges for controls
   * @param {boolean} options.includeCalls       - Show cross-object call edges
   * @param {boolean} options.includeEvents      - Show events as class members
   * @param {boolean} options.includeFunctions   - Show functions/subroutines as class members
   * @param {boolean} options.showBuiltinParents - Include inheritance edges to PB built-in types
   * @param {number}  options.maxLabelLength     - Max characters for signature labels (default 80)
   */
  constructor(options = {}) {
    this._opts = {
      includeVariables:   options.includeVariables   ?? true,
      includeControls:    options.includeControls    ?? true,
      includeCalls:       options.includeCalls       ?? true,
      includeEvents:      options.includeEvents      ?? true,
      includeFunctions:   options.includeFunctions   ?? true,
      showBuiltinParents: options.showBuiltinParents ?? false,
      maxLabelLength:     options.maxLabelLength     ?? 80,
      diagramType:            options.diagramType            ?? 'class',
      callGraphDirection:     options.callGraphDirection     ?? 'LR',
      includeInternalCalls:   options.includeInternalCalls   ?? true,
      includeUnresolvedCalls: options.includeUnresolvedCalls ?? false,
      includeOrphanNodes:     options.includeOrphanNodes     ?? false,
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * @param {AnalyzedProject} project
   * @returns {string} - complete Mermaid classDiagram text
   */
  generate(project) {
    console.group('[MermaidGenerator] generate');
    console.log('[MermaidGenerator] Opções:', this._opts);

    const lines = ['classDiagram'];

    // Class blocks
    for (const obj of project.objects.values()) {
      const block = this._renderClassBlock(obj);
      if (block.length) {
        lines.push('');
        lines.push(...block);
      }
    }
    console.log(`[MermaidGenerator] Class blocks renderizados: ${project.objects.size} objetos`);

    // Inheritance edges
    const inheritEdges = this._renderInheritanceEdges(project.inheritanceEdges);
    if (inheritEdges.length) {
      lines.push('');
      lines.push(...inheritEdges);
    }
    console.log(`[MermaidGenerator] Inheritance edges: ${inheritEdges.length}`);

    // Control containment edges
    if (this._opts.includeControls) {
      const containEdges = this._renderContainmentEdges(project.objects);
      if (containEdges.length) {
        lines.push('');
        lines.push(...containEdges);
      }
      console.log(`[MermaidGenerator] Containment edges: ${containEdges.length}`);
    }

    // Cross-object call edges
    if (this._opts.includeCalls) {
      const callEdges = this._renderCallEdges(project.crossObjectCalls);
      if (callEdges.length) {
        lines.push('');
        lines.push(...callEdges);
      }
      console.log(`[MermaidGenerator] Call edges: ${callEdges.length}`);
    }

    console.log(`[MermaidGenerator] Saída total: ${lines.length} linhas`);
    console.groupEnd();
    return lines.join('\n');
  }

  /**
   * @param {AnalyzedProject} project
   * @returns {string} - complete Mermaid flowchart text (call graph)
   */
  generateCallGraph(project) {
    const calls = this._opts.includeInternalCalls
      ? project.crossObjectCalls
      : project.crossObjectCalls.filter(c => c.fromObject !== c.toObject);

    const unresolvedList = this._opts.includeUnresolvedCalls
      ? (project.unresolvedCalls || [])
      : [];

    if (!calls.length && !unresolvedList.length) {
      return `flowchart ${this._opts.callGraphDirection}\n    empty["Nenhuma chamada encontrada"]`;
    }

    const lines = [`flowchart ${this._opts.callGraphDirection}`];

    // Phase 1: Collect nodes
    const nodesByObj    = new Map(); // all objects: objName → Map<nodeId, label>
    const externalNodeIds = new Set(); // nodeIds that are unresolved (need :::external style)

    for (const c of calls) {
      for (const [obj, member] of [[c.fromObject, c.fromMember], [c.toObject, c.toMember]]) {
        if (!nodesByObj.has(obj)) nodesByObj.set(obj, new Map());
        const nid = this._nodeId(obj, member);
        nodesByObj.get(obj).set(nid, this._nodeLabel(obj, member));
      }
    }

    for (const u of unresolvedList) {
      // Origin node (may already exist from crossObjectCalls)
      if (!nodesByObj.has(u.fromObject)) nodesByObj.set(u.fromObject, new Map());
      const fnid = this._nodeId(u.fromObject, u.fromMember);
      nodesByObj.get(u.fromObject).set(fnid, this._nodeLabel(u.fromObject, u.fromMember));

      // External target: goes into its own object subgraph, marked as external
      const toObj    = u.targetObject || '?';
      const toMember = u.targetMember || '?';
      const tnid = 'ext__' + this._nodeId(toObj, toMember);
      if (!nodesByObj.has(toObj)) nodesByObj.set(toObj, new Map());
      nodesByObj.get(toObj).set(tnid, this._nodeLabel(toObj, toMember));
      externalNodeIds.add(tnid);
    }

    if (this._opts.includeOrphanNodes) {
      for (const obj of project.objects.values()) {
        for (const func of obj.functions) {
          if (!nodesByObj.has(obj.name)) nodesByObj.set(obj.name, new Map());
          const nid = this._nodeId(obj.name, func.name);
          nodesByObj.get(obj.name).set(nid, this._nodeLabel(obj.name, func.name));
        }
        for (const event of obj.events) {
          if (!nodesByObj.has(obj.name)) nodesByObj.set(obj.name, new Map());
          const nid = this._nodeId(obj.name, event.name);
          nodesByObj.get(obj.name).set(nid, this._nodeLabel(obj.name, event.name));
        }
      }
    }

    // Phase 2: Emit subgraphs (loaded and external objects share the same structure)
    for (const [obj, nodes] of nodesByObj) {
      lines.push('');
      lines.push(`  subgraph ${this._sanitiseName(obj)}["${obj}"]`);
      for (const [nid, label] of nodes) {
        const cls = externalNodeIds.has(nid) ? ':::external' : '';
        lines.push(`    ${nid}["${label}"]${cls}`);
      }
      lines.push('  end');
    }

    // Phase 3: Emit edges (deduped)
    lines.push('');
    const seen = new Set();

    for (const c of calls) {
      const from = this._nodeId(c.fromObject, c.fromMember);
      const to   = this._nodeId(c.toObject,   c.toMember);
      const key  = `${from}-->${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${from} --> ${to}`);
    }

    for (const u of unresolvedList) {
      const from     = this._nodeId(u.fromObject, u.fromMember);
      const toObj    = u.targetObject || '?';
      const toMember = u.targetMember || '?';
      const to       = 'ext__' + this._nodeId(toObj, toMember);
      const key      = `${from}-..->${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${from} -.-> ${to}`);
    }

    if (externalNodeIds.size) {
      lines.push('');
      lines.push('  classDef external fill:#fff8e1,stroke:#f9a825,stroke-width:1px,color:#5d4037');
    }

    return lines.join('\n');
  }

  // ─── Class block rendering ─────────────────────────────────────────────────

  _renderClassBlock(obj) {
    const members = [];

    if (this._opts.includeFunctions) {
      // Render implemented functions
      for (const func of obj.functions) {
        members.push(this._renderFunction(func));
      }
      // Render prototype-only functions (no body found in this file)
      for (const proto of obj.prototypes) {
        members.push(this._renderPrototype(proto));
      }
    }

    if (this._opts.includeEvents) {
      for (const event of obj.events) {
        members.push(this._renderEvent(event));
      }
    }

    if (this._opts.includeVariables) {
      for (const variable of obj.variables) {
        members.push(this._renderVariable(variable));
      }
    }

    const className = this._sanitiseName(obj.name);

    if (members.length === 0) {
      // Still emit the class block so it appears in the diagram
      return [`    class ${className}`];
    }

    const lines = [`    class ${className} {`];
    for (const m of members) {
      lines.push(`        ${m}`);
    }
    lines.push('    }');
    return lines;
  }

  _renderFunction(func) {
    const access = this._accessSymbol(func.access);
    const params = this._formatParams(func.params);
    const ret = func.returnType || 'void';
    const sig = `${access}${ret} ${func.name}(${params})`;
    return this._truncate(sig, this._opts.maxLabelLength);
  }

  _renderPrototype(proto) {
    const access = this._accessSymbol(proto.access);
    const params = this._formatParams(proto.params);
    const ret = proto.returnType || 'void';
    const sig = `${access}${ret} ${proto.name}(${params})`;
    return this._truncate(sig, this._opts.maxLabelLength);
  }

  _renderEvent(event) {
    // Events are shown with a special marker to distinguish them from functions
    const params = this._formatParams(event.params);
    const ret = event.returnType || 'void';
    const sig = `~event~ ${ret} ${event.name}(${params})`;
    return this._truncate(sig, this._opts.maxLabelLength);
  }

  _renderVariable(variable) {
    const access = this._accessSymbol(variable.access);
    const arr = variable.isArray ? '[]' : '';
    return `${access}${variable.typeName}${arr} ${variable.name}`;
  }

  // ─── Edge rendering ────────────────────────────────────────────────────────

  _renderInheritanceEdges(edges) {
    const lines = [];
    for (const edge of edges) {
      if (!this._opts.showBuiltinParents && edge.isBuiltin) continue;
      const child = this._sanitiseName(edge.child);
      const parent = this._sanitiseName(edge.parent);
      lines.push(`    ${child} --|> ${parent} : extends`);
    }
    return lines;
  }

  _renderContainmentEdges(objectMap) {
    const lines = [];
    const seen = new Set();

    for (const obj of objectMap.values()) {
      if (!obj.controls.length) continue;
      for (const ctrl of obj.controls) {
        const key = `${obj.name}→${ctrl.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const parent = this._sanitiseName(obj.name);
        const child = this._sanitiseName(ctrl.name);
        lines.push(`    ${parent} *-- ${child} : contains`);
      }
    }

    return lines;
  }

  _renderCallEdges(crossObjectCalls) {
    const lines = [];
    const seen = new Set();

    for (const call of crossObjectCalls) {
      const fromLabel = this._sanitiseLabel(call.fromMember);
      const toLabel   = this._sanitiseLabel(call.toMember);
      const label = fromLabel === toLabel ? fromLabel : `${fromLabel}.${toLabel}`;
      const key = `${call.fromObject}..>${call.toObject}:${label}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const from = this._sanitiseName(call.fromObject);
      const to   = this._sanitiseName(call.toObject);
      lines.push(`    ${from} ..> ${to} : ${label}`);
    }

    return lines;
  }

  // ─── Formatting helpers ────────────────────────────────────────────────────

  _formatParams(params) {
    if (!params || !params.length) return '';
    return params.map(p => `${p.typeName} ${p.name}`).join(', ');
  }

  _accessSymbol(access) {
    switch ((access || '').toLowerCase()) {
      case 'public':    return '+';
      case 'protected': return '#';
      case 'private':   return '-';
      default:          return '+';
    }
  }

  /** Sanitises a class/object name for Mermaid (underscores are fine). */
  _sanitiseName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /** Sanitises a label/annotation string for Mermaid. */
  _sanitiseLabel(text) {
    return text
      .replace(/</g, '~lt~')
      .replace(/>/g, '~gt~')
      .replace(/"/g, "'")
      .replace(/:/g, ' -');
  }

  _nodeId(obj, member) {
    return this._sanitiseName(obj) + '__' + this._sanitiseName(member);
  }

  _nodeLabel(obj, member) {
    return `${obj}.${member}`;
  }

  _truncate(text, max) {
    if (text.length <= max) return text;
    return text.substring(0, max - 1) + '…';
  }
}

window.MermaidGenerator = MermaidGenerator;
