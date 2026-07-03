/**
 * render-utils.js
 * Pure formatting helpers shared by ClassDiagramGenerator and CallGraphGenerator.
 * Depends on: PB_CONSTANTS, StringUtils.
 * Exposed as window.RenderUtils.
 */
const RenderUtils = {

  /** Formats a PBParam[] into a comma-separated string. */
  formatParams(params) {
    if (!params || !params.length) return '';
    return params.map(p => `${p.typeName} ${p.name}`).join(', ');
  },

  /** Maps a PB access modifier to its UML symbol. */
  accessSymbol(access) {
    return PB_CONSTANTS.ACCESS_SYMBOLS[(access || '').toLowerCase()] ?? '+';
  },

  /** Builds a call-graph node ID from object and member names. */
  nodeId(obj, member) {
    return StringUtils.sanitiseName(obj) + PB_CONSTANTS.NODE_SEP + StringUtils.sanitiseName(member);
  },

  /** Builds a human-readable call-graph node label. */
  nodeLabel(obj, member) {
    return `${obj}.${member}`;
  },

  /**
   * Returns a predicate that tests whether a call target should be filtered out.
   * @param {Set<string>} ignoredCallTargets
   */
  getIsIgnored(ignoredCallTargets) {
    return m => ignoredCallTargets?.size && ignoredCallTargets.has(m.toLowerCase());
  },

  /** Truncates text to max characters, appending '…' when cut. */
  truncate(text, max) {
    if (text.length <= max) return text;
    return text.substring(0, max - 1) + '…';
  },

};

window.RenderUtils = RenderUtils;
