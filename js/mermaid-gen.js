/**
 * mermaid-gen.js
 * Facade: delegates class diagram to ClassDiagramGenerator, call graph to CallGraphGenerator.
 * Depends on: ClassDiagramGenerator, CallGraphGenerator.
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
      ignoredCallTargets:     options.ignoredCallTargets     ?? new Set(),
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * @param {AnalyzedProject} project
   * @returns {string} complete Mermaid classDiagram text
   */
  generate(project) {
    return new ClassDiagramGenerator(this._opts).generate(project);
  }

  /**
   * @param {AnalyzedProject} project
   * @returns {string} complete Mermaid flowchart text (call graph)
   */
  generateCallGraph(project) {
    return new CallGraphGenerator(this._opts).generateCallGraph(project);
  }
}

window.MermaidGenerator = MermaidGenerator;
