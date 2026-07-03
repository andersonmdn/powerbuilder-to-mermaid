/**
 * string-utils.js
 * Pure string-manipulation helpers shared by the parser and generator.
 * No dependencies. Exposed as window.StringUtils.
 */
const StringUtils = {

  normaliseLines(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  },

  /** Removes // line comments from code body. */
  stripComments(text) {
    return text.replace(/\/\/.*$/gm, '');
  },

  /** Blanks out string literal content so regexes don't match inside strings. */
  stripStringLiterals(text) {
    return text.replace(/"[^"\n]*"/g, match => '"' + ' '.repeat(match.length - 2) + '"');
  },

  /** Sanitises a class/object name for Mermaid (underscores are safe). */
  sanitiseName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  },

  /** Sanitises a label/annotation string for Mermaid. */
  sanitiseLabel(text) {
    return text
      .replace(/</g, '~lt~')
      .replace(/>/g, '~gt~')
      .replace(/"/g, "'")
      .replace(/:/g, ' -');
  },

};

window.StringUtils = StringUtils;
