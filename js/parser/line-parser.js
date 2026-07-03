/**
 * line-parser.js
 * Regex-based line parsers for individual PowerBuilder source constructs.
 * No dependencies. Exposed as window.PBLineParser.
 */
class PBLineParser {

  /**
   * Parses an event stub inside a type...end type block.
   * Forms:
   *   event ue_custom;
   *   event type long ue_with_return (string as_param)
   */
  parseEventStub(line) {
    // Typed event: "event type long ue_with_return (string as_param)"
    const typedMatch = line.match(/^event\s+type\s+(\w+)\s+(\w+)\s*\(([^)]*)\)/i);
    if (typedMatch) {
      const [, returnType, name, rawParams] = typedMatch;
      return { name, returnType, params: this.parseParamList(rawParams) };
    }

    // Event with parens: "event hide_dados()" / "event hide_dados();"
    const parenMatch = line.match(/^event\s+(\w+)\s*\(([^)]*)\)\s*;?$/i);
    if (parenMatch) {
      const [, name, rawParams] = parenMatch;
      return { name, returnType: null, params: this.parseParamList(rawParams.trim()) };
    }

    // Simple event with optional trailing params: "event ue_custom;" or "event ue_custom;string as_arg"
    const simpleMatch = line.match(/^event\s+(\w+)\s*;(.*)$/i);
    if (simpleMatch) {
      const [, name, rawParams] = simpleMatch;
      return { name, returnType: null, params: this.parseParamList(rawParams.trim()) };
    }

    return null;
  }

  /** Parses a variable declaration line given the current access modifier. */
  parseVariableLine(line, access) {
    if (/^(public|protected|private)\s*:?\s*$/i.test(line)) return null;
    if (line.startsWith('//')) return null;

    let rest = line;
    let resolvedAccess = access;

    // Strip leading access and sub-access modifier words
    const modRe = /^(public|protected|private|privateread|protectedread|systemread|privatewrite|protectedwrite|systemwrite)\s+/i;
    let found;
    while ((found = rest.match(modRe))) {
      const w = found[1].toLowerCase();
      if (w === 'public' || w === 'protected' || w === 'private') resolvedAccess = w;
      rest = rest.slice(found[0].length);
    }

    // "typeName name" or "typeName[] name" or "typeName name[]" with optional "= value"
    const match = rest.match(/^(\w+(?:\[\])?)\s+(\w+)(\[\])?\s*(?:=.*)?$/i);
    if (!match) return null;

    const [, rawType, name, bracketOnName] = match;
    return {
      access: resolvedAccess,
      typeName: rawType.replace('[]', ''),
      name,
      isArray: rawType.endsWith('[]') || !!bracketOnName,
    };
  }

  /** Parses a prototype declaration line. */
  parsePrototypeLine(line) {
    const match = line.match(
      /^(public|protected|private)\s+(function|subroutine)\s+(?:(\w+)\s+)?(\w+)\s*\(([^)]*)\)/i
    );
    if (!match) return null;
    const [, access, kind, returnType, name, rawParams] = match;
    return {
      access: access.toLowerCase(),
      kind: kind.toLowerCase(),
      returnType: kind.toLowerCase() === 'subroutine' ? 'void' : (returnType || 'void'),
      name,
      params: this.parseParamList(rawParams),
    };
  }

  /** Parses a function/subroutine header line. */
  parseFunctionHeader(line) {
    const match = line.match(
      /^(public|protected|private)\s+(function|subroutine)\s+(?:(\w+)\s+)?(\w+)\s*\(([^)]*)\)/i
    );
    if (!match) return null;
    const [, access, kind, returnType, name, rawParams] = match;
    return {
      access: access.toLowerCase(),
      kind: kind.toLowerCase(),
      returnType: kind.toLowerCase() === 'subroutine' ? 'void' : (returnType || 'void'),
      name,
      params: this.parseParamList(rawParams),
    };
  }

  /** Parses an "on obj.event" or "on obj.event;params" header line. */
  parseEventHeader(line) {
    // With params after semicolon: "on w_main.ue_custom;string as_arg"
    const withParams = line.match(/^on\s+(\w+)\.(\w+)\s*;(.*)$/i);
    if (withParams) {
      const [, ownerName, name, rawParams] = withParams;
      return { ownerName, name, params: this.parseParamList(rawParams.trim()) };
    }

    // With parens: "on w_main.ue_custom(string as_arg)"
    const withParens = line.match(/^on\s+(\w+)\.(\w+)\s*\(([^)]*)\)\s*;?$/i);
    if (withParens) {
      const [, ownerName, name, rawParams] = withParens;
      return { ownerName, name, params: this.parseParamList(rawParams.trim()) };
    }

    // Without params: "on w_main.open"
    const noParams = line.match(/^on\s+(\w+)\.(\w+)\s*$/i);
    if (noParams) {
      const [, ownerName, name] = noParams;
      return { ownerName, name, params: [] };
    }

    return null;
  }

  /** Parses a comma-separated parameter string into PBParam[]. */
  parseParamList(raw) {
    if (!raw || !raw.trim()) return [];
    return raw.split(',').map(p => this.parseParam(p.trim())).filter(Boolean);
  }

  /** Parses a single parameter like "ref string as_name" or "integer ai_val". */
  parseParam(raw) {
    if (!raw) return null;
    const passByRef = /^ref\s+/i.test(raw);
    const withoutRef = raw.replace(/^ref\s+/i, '').trim();
    const match = withoutRef.match(/^(\w+(?:\[\])?)\s+(\w+)(?:\[\])?$/i);
    if (!match) return null;
    const [, typeName, name] = match;
    return { typeName, name, passByRef };
  }
}

window.PBLineParser = PBLineParser;
