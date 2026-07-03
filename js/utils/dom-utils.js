/**
 * dom-utils.js
 * Pure utility helpers for DOM/UI use.
 * No dependencies. Exposed as window.DOMUtils.
 */
const DOMUtils = {

  /** Escapes a string for safe insertion into HTML. */
  esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  /** Converts a byte count to a human-readable string (B / KB / MB). */
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  },

};

window.DOMUtils = DOMUtils;
