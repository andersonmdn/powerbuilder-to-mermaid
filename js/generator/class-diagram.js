/**
 * class-diagram.js
 * Generates a Mermaid classDiagram string from an AnalyzedProject.
 * Depends on: PB_CONSTANTS, StringUtils, RenderUtils.
 * Exposed as window.ClassDiagramGenerator.
 */
class ClassDiagramGenerator {

  /** @param {object} opts — same shape as MermaidGenerator._opts */
  constructor(opts) {
    this._opts = opts;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * @param {AnalyzedProject} project
   * @returns {string} complete Mermaid classDiagram text
   */
  generate(project) {
    console.group('[ClassDiagramGenerator] generate');
    console.log('[ClassDiagramGenerator] Opções:', this._opts);

    const lines = ['classDiagram'];

    for (const obj of project.objects.values()) {
      const block = this._renderClassBlock(obj);
      if (block.length) {
        lines.push('');
        lines.push(...block);
      }
    }
    console.log(`[ClassDiagramGenerator] Class blocks renderizados: ${project.objects.size} objetos`);

    const inheritEdges = this._renderInheritanceEdges(project.inheritanceEdges);
    if (inheritEdges.length) {
      lines.push('');
      lines.push(...inheritEdges);
    }
    console.log(`[ClassDiagramGenerator] Inheritance edges: ${inheritEdges.length}`);

    if (this._opts.includeControls) {
      const containEdges = this._renderContainmentEdges(project.objects);
      if (containEdges.length) {
        lines.push('');
        lines.push(...containEdges);
      }
      console.log(`[ClassDiagramGenerator] Containment edges: ${containEdges.length}`);
    }

    if (this._opts.includeCalls) {
      const isIgnored = RenderUtils.getIsIgnored(this._opts.ignoredCallTargets);
      const filteredCalls = project.crossObjectCalls.filter(c => !isIgnored(c.toMember));
      const callEdges = this._renderCallEdges(filteredCalls);
      if (callEdges.length) {
        lines.push('');
        lines.push(...callEdges);
      }
      console.log(`[ClassDiagramGenerator] Call edges: ${callEdges.length}`);
    }

    console.log(`[ClassDiagramGenerator] Saída total: ${lines.length} linhas`);
    console.groupEnd();
    return lines.join('\n');
  }

  // ─── Class block rendering ─────────────────────────────────────────────────

  _renderClassBlock(obj) {
    const members = [];

    if (this._opts.includeFunctions) {
      for (const func of obj.functions)     members.push(this._renderFunction(func));
      for (const proto of obj.prototypes)   members.push(this._renderPrototype(proto));
    }

    if (this._opts.includeEvents) {
      for (const event of obj.events)       members.push(this._renderEvent(event));
    }

    if (this._opts.includeVariables) {
      for (const variable of obj.variables) members.push(this._renderVariable(variable));
    }

    const className = StringUtils.sanitiseName(obj.name);

    if (members.length === 0) {
      return [`    class ${className}`];
    }

    const lines = [`    class ${className} {`];
    for (const m of members) lines.push(`        ${m}`);
    lines.push('    }');
    return lines;
  }

  _renderFunction(func) {
    const sig = `${RenderUtils.accessSymbol(func.access)}${func.returnType || 'void'} ${func.name}(${RenderUtils.formatParams(func.params)})`;
    return RenderUtils.truncate(sig, this._opts.maxLabelLength);
  }

  _renderPrototype(proto) {
    const sig = `${RenderUtils.accessSymbol(proto.access)}${proto.returnType || 'void'} ${proto.name}(${RenderUtils.formatParams(proto.params)})`;
    return RenderUtils.truncate(sig, this._opts.maxLabelLength);
  }

  _renderEvent(event) {
    const sig = `~event~ ${event.returnType || 'void'} ${event.name}(${RenderUtils.formatParams(event.params)})`;
    return RenderUtils.truncate(sig, this._opts.maxLabelLength);
  }

  _renderVariable(variable) {
    const access = RenderUtils.accessSymbol(variable.access);
    const arr    = variable.isArray ? '[]' : '';
    return `${access}${variable.typeName}${arr} ${variable.name}`;
  }

  // ─── Edge rendering ────────────────────────────────────────────────────────

  _renderInheritanceEdges(edges) {
    const lines = [];
    for (const edge of edges) {
      if (!this._opts.showBuiltinParents && edge.isBuiltin) continue;
      const child  = StringUtils.sanitiseName(edge.child);
      const parent = StringUtils.sanitiseName(edge.parent);
      lines.push(`    ${child} --|> ${parent} : extends`);
    }
    return lines;
  }

  _renderContainmentEdges(objectMap) {
    const lines = [];
    const seen  = new Set();

    for (const obj of objectMap.values()) {
      if (!obj.controls.length) continue;
      for (const ctrl of obj.controls) {
        const key = `${obj.name}→${ctrl.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const parent = StringUtils.sanitiseName(obj.name);
        const child  = StringUtils.sanitiseName(ctrl.name);
        lines.push(`    ${parent} *-- ${child} : contains`);
      }
    }

    return lines;
  }

  _renderCallEdges(crossObjectCalls) {
    const lines = [];
    const seen  = new Set();

    for (const call of crossObjectCalls) {
      const fromLabel = StringUtils.sanitiseLabel(call.fromMember);
      const toLabel   = StringUtils.sanitiseLabel(call.toMember);
      const label = fromLabel === toLabel ? fromLabel : `${fromLabel}.${toLabel}`;
      const key = `${call.fromObject}..>${call.toObject}:${label}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const from = StringUtils.sanitiseName(call.fromObject);
      const to   = StringUtils.sanitiseName(call.toObject);
      lines.push(`    ${from} ..> ${to} : ${label}`);
    }

    return lines;
  }
}

window.ClassDiagramGenerator = ClassDiagramGenerator;
