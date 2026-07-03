/**
 * call-site-extractor.js
 * Scans PowerBuilder function/event bodies for cross-object call patterns.
 * Depends on: PB_CONSTANTS, StringUtils.
 * Exposed as window.CallSiteExtractor.
 */
class CallSiteExtractor {

  /**
   * Main entry point. Strips comments/strings then runs all 6 pattern detectors.
   * Order matters: cross-trigger must run before dotcall to avoid double-counting.
   * @param {string} body
   * @returns {CallSite[]}
   */
  extractCallSites(body) {
    if (!body) return [];

    const sites = [];
    const stripped = StringUtils.stripComments(StringUtils.stripStringLiterals(body));

    this._extractCrossTriggerCalls(stripped, sites);
    this._extractDotCalls(stripped, sites);
    this._extractSelfTriggerCalls(stripped, sites);
    this._extractKeywordEventCalls(stripped, sites);
    this._extractCallSyntaxCalls(stripped, sites);
    this._extractBareCalls(stripped, sites);

    console.debug(`[CallSiteExtractor] ${sites.length} call site(s) encontrado(s)`);
    return sites;
  }

  // ─── Pattern detectors ─────────────────────────────────────────────────────

  /** obj.TriggerEvent("ev") / obj.PostEvent("ev") */
  _extractCrossTriggerCalls(stripped, sites) {
    const re = /\b(\w+)\.(TriggerEvent|PostEvent)\s*\(\s*["'](\w+)["']/gi;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const qualifier = m[1].toLowerCase();
      if (qualifier === 'this') {
        sites.push({ kind: m[2].toLowerCase(), targetObject: null, targetMember: m[3], rawText: m[0] });
      } else if (qualifier === 'parent') {
        sites.push({ kind: m[2].toLowerCase(), targetObject: PB_CONSTANTS.SENTINEL_PARENT, targetMember: m[3], rawText: m[0] });
      } else if (qualifier === 'super') {
        sites.push({ kind: m[2].toLowerCase(), targetObject: PB_CONSTANTS.SENTINEL_SUPER, targetMember: m[3], rawText: m[0] });
      } else if (!PB_CONSTANTS.PB_BUILTIN_IDENTIFIERS_SET.has(m[1].toLowerCase())) {
        sites.push({ kind: m[2].toLowerCase(), targetObject: m[1], targetMember: m[3], rawText: m[0] });
      }
    }
  }

  /** identifier.method( — skips TriggerEvent/PostEvent (handled above) */
  _extractDotCalls(stripped, sites) {
    const re = /\b(\w+)\.(\w+)\s*\(/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      if (/^(TriggerEvent|PostEvent)$/i.test(m[2])) continue;
      const qualifier = m[1].toLowerCase();
      if (qualifier === 'parent') {
        sites.push({ kind: 'dotcall', targetObject: PB_CONSTANTS.SENTINEL_PARENT, targetMember: m[2], rawText: m[0] });
      } else if (qualifier === 'super') {
        sites.push({ kind: 'dotcall', targetObject: PB_CONSTANTS.SENTINEL_SUPER, targetMember: m[2], rawText: m[0] });
      } else if (!PB_CONSTANTS.PB_BUILTIN_IDENTIFIERS_SET.has(m[1].toLowerCase())) {
        sites.push({ kind: 'dotcall', targetObject: m[1], targetMember: m[2], rawText: m[0] });
      }
    }
  }

  /** Bare TriggerEvent("ev") / PostEvent("ev") with no object prefix → self */
  _extractSelfTriggerCalls(stripped, sites) {
    const re = /(?<![.\w])(TriggerEvent|PostEvent)\s*\(\s*["'](\w+)["']/gi;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      sites.push({ kind: m[1].toLowerCase(), targetObject: null, targetMember: m[2], rawText: m[0] });
    }
  }

  /** Keyword form: "Trigger Event name" / "Post Event name" (no quotes, always self) */
  _extractKeywordEventCalls(stripped, sites) {
    const re = /\b(Trigger|Post)\s+Event\s+(\w+)/gi;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      if (!PB_CONSTANTS.PB_BUILTIN_IDENTIFIERS_SET.has(m[2].toLowerCase())) {
        sites.push({
          kind: m[1].toLowerCase() === 'trigger' ? 'triggerevent' : 'postevent',
          targetObject: null,
          targetMember: m[2],
          rawText: m[0],
        });
      }
    }
  }

  /** Call objectvar::eventname */
  _extractCallSyntaxCalls(stripped, sites) {
    const re = /\bCall\s+(\w+)::(\w+)\b/gi;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      sites.push({ kind: 'call', targetObject: m[1], targetMember: m[2], rawText: m[0] });
    }
  }

  /** Bare funcName( with no preceding dot — resolver confirms it's a known method on self */
  _extractBareCalls(stripped, sites) {
    const re = /(?<![.\w])(\w+)\s*\(/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const lc = m[1].toLowerCase();
      if (!PB_CONSTANTS.PB_BUILTIN_IDENTIFIERS_SET.has(lc) && !PB_CONSTANTS.PB_KEYWORDS_SET.has(lc)) {
        sites.push({ kind: 'barecall', targetObject: null, targetMember: m[1], rawText: m[0] });
      }
    }
  }
}

window.CallSiteExtractor = CallSiteExtractor;
