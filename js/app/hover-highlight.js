/**
 * hover-highlight.js
 * Post-render hover highlighting for Mermaid call-graph SVG.
 * On mouseenter over a node: highlights the node, all directly connected
 * nodes (in + out), and the edges between them; dims everything else.
 * Depends on nothing. Exposed as window.HoverHighlight.
 */
const HoverHighlight = (() => {

  let _svgEl      = null;
  let _adj        = null;   // Map<nodeId, { out: Set<nodeId>, in: Set<nodeId> }>
  let _nodeElMap  = null;   // Map<nodeId, SVGGElement>
  let _edgeElMap  = null;   // Map<"from-->to", SVGGElement>
  let _highlighted = [];    // elements tagged in this hover pass (for O(k) cleanup)

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Call once after the Mermaid SVG is injected into the DOM.
   * @param {SVGSVGElement} svgEl       – the <svg> element
   * @param {string}        mermaidText – the .mmd source that produced the SVG
   */
  function init(svgEl, mermaidText) {
    _svgEl       = svgEl;
    _adj         = _buildAdjacency(mermaidText);
    _highlighted = [];

    const { nodeElMap, edgeElMap } = _buildDOMIndexes(svgEl);
    _nodeElMap = nodeElMap;
    _edgeElMap = edgeElMap;

    _nodeElMap.forEach(el => el.classList.add('cg-node'));
    _edgeElMap.forEach(el => el.classList.add('cg-edge'));

    _nodeElMap.forEach((el, nodeId) => {
      el.addEventListener('mouseenter', () => _onHover(nodeId));
      el.addEventListener('mouseleave', _onLeave);
    });
  }

  // ─── Index builders ────────────────────────────────────────────────────────

  /**
   * Parse the Mermaid text for edge lines and build an adjacency map.
   * Handles both "-->" (resolved) and ".->" (unresolved) arrows.
   */
  function _buildAdjacency(text) {
    const adj = new Map();
    const re  = /^\s+(\S+)\s+-+\.?->\s+(\S+)/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      const [, from, to] = m;
      if (!adj.has(from)) adj.set(from, { out: new Set(), in: new Set() });
      if (!adj.has(to))   adj.set(to,   { out: new Set(), in: new Set() });
      adj.get(from).out.add(to);
      adj.get(to).in.add(from);
    }
    return adj;
  }

  /**
   * Single-pass SVG scan: builds nodeElMap and edgeElMap using Mermaid's
   * predictable ID patterns:
   *   nodes: id="flowchart-{nodeId}-{N}"
   *   edges: id="L-{fromId}-{toId}-{N}"
   * Our nodeIds contain only [a-zA-Z0-9_], so "-" is an unambiguous separator.
   */
  function _buildDOMIndexes(svgEl) {
    const nodeElMap = new Map();
    const edgeElMap = new Map();

    svgEl.querySelectorAll('[id^="flowchart-"]').forEach(el => {
      // "flowchart-w_main__ue_open-0" → "w_main__ue_open"
      const nodeId = el.id.replace(/^flowchart-/, '').replace(/-\d+$/, '');
      nodeElMap.set(nodeId, el);
    });

    svgEl.querySelectorAll('[id^="L-"]').forEach(el => {
      // "L-w_main__ue_open-n_customer__of_save-0" → mid = "w_main__ue_open-n_customer__of_save"
      const mid     = el.id.replace(/^L-/, '').replace(/-\d+$/, '');
      const dashIdx = mid.indexOf('-');
      if (dashIdx < 0) return;
      const from = mid.slice(0, dashIdx);
      const to   = mid.slice(dashIdx + 1);
      edgeElMap.set(`${from}-->${to}`, el);
    });

    return { nodeElMap, edgeElMap };
  }

  // ─── Hover handlers ────────────────────────────────────────────────────────

  function _onHover(nodeId) {
    _onLeave();
    _svgEl.classList.add('cg-hover-active');

    // Always highlight the hovered node itself
    _highlight(_nodeElMap.get(nodeId));

    const info = _adj.get(nodeId);
    if (!info) return;

    info.out.forEach(toId => {
      _highlight(_nodeElMap.get(toId));
      _highlight(_edgeElMap.get(`${nodeId}-->${toId}`));
    });

    info.in.forEach(fromId => {
      _highlight(_nodeElMap.get(fromId));
      _highlight(_edgeElMap.get(`${fromId}-->${nodeId}`));
    });
  }

  function _onLeave() {
    if (_svgEl) _svgEl.classList.remove('cg-hover-active');
    _highlighted.forEach(el => el.classList.remove('cg-highlighted'));
    _highlighted = [];
  }

  function _highlight(el) {
    if (!el) return;
    el.classList.add('cg-highlighted');
    _highlighted.push(el);
  }

  return { init };

})();

window.HoverHighlight = HoverHighlight;
