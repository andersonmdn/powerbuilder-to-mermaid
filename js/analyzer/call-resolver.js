/**
 * call-resolver.js
 * Resolves cross-object call sites against the object registry.
 * Three strategies: barecall, self-trigger, cross-target.
 * Depends on: PB_CONSTANTS.
 * Exposed as window.CallResolver.
 */
class CallResolver {

  /** @param {Map<string, PBObject>} objectMap */
  constructor(objectMap) {
    this._objectMap        = objectMap;
    this._crossObjectCalls = [];
    this._unresolvedCalls  = [];
  }

  /**
   * Iterates all functions and events in the object map, resolves their call sites.
   * @returns {{ crossObjectCalls, unresolvedCalls }}
   */
  resolveAll() {
    for (const obj of this._objectMap.values()) {
      const varTypeMap = this._buildVarTypeMap(obj);

      for (const func of obj.functions) {
        const scopedVarMap = this._buildScopedVarMap(varTypeMap, func.params);
        console.log(`[CallResolver] Resolvendo função ${obj.name}.${func.name}: ${func.callSites.length} call site(s)`);
        this._resolveFromMember(func.callSites, obj.name, func.name, scopedVarMap);
      }

      for (const event of obj.events) {
        if (!event.body) continue;
        const scopedVarMap = this._buildScopedVarMap(varTypeMap, event.params);
        console.log(`[CallResolver] Resolvendo evento ${obj.name}.${event.name}: ${event.callSites.length} call site(s)`);
        this._resolveFromMember(event.callSites, obj.name, event.name, scopedVarMap);
      }
    }

    return {
      crossObjectCalls: this._crossObjectCalls,
      unresolvedCalls:  this._unresolvedCalls,
    };
  }

  // ─── Resolution dispatcher ─────────────────────────────────────────────────

  _resolveFromMember(callSites, fromObject, fromMember, varTypeMap) {
    for (const site of callSites) {
      if (site.kind === 'barecall') {
        this._resolveBarecall(site, fromObject, fromMember);
      } else if ((site.kind === 'triggerevent' || site.kind === 'postevent') && !site.targetObject) {
        this._resolveSelfTrigger(site, fromObject, fromMember);
      } else if (site.targetObject) {
        this._resolveCrossTarget(site, fromObject, fromMember, varTypeMap);
      }
    }
  }

  // ─── Strategy: bare call ───────────────────────────────────────────────────

  /** Searches current object → inheritance chain → parent window. */
  _resolveBarecall(site, fromObject, fromMember) {
    const ownerObj = this._objectMap.get(fromObject.toLowerCase());
    if (!ownerObj) return;

    let searchObj = ownerObj;
    let foundMember = null;
    let foundOn = null;
    while (searchObj && !foundMember) {
      foundMember =
        this._findByName(searchObj.functions,  site.targetMember) ||
        this._findByName(searchObj.prototypes, site.targetMember);
      if (foundMember) {
        foundOn = searchObj.name;
      } else if (searchObj.parentName && !this._isBuiltin(searchObj.parentName)) {
        searchObj = this._objectMap.get(searchObj.parentName.toLowerCase());
      } else {
        break;
      }
    }

    if (foundMember) {
      console.log(`[CallResolver] barecall ✔ ${fromObject}.${fromMember} → ${fromObject}.${foundMember.name} (def. em ${foundOn})`);
      this._crossObjectCalls.push({ fromObject, fromMember, toObject: fromObject, toMember: foundMember.name, callSite: site });
      return;
    }

    if (ownerObj.withinName) {
      const parentObj = this._objectMap.get(ownerObj.withinName.toLowerCase());
      if (parentObj) {
        const parentMember =
          this._findByName(parentObj.functions,  site.targetMember) ||
          this._findByName(parentObj.prototypes, site.targetMember);
        if (parentMember) {
          console.log(`[CallResolver] barecall ✔ (janela-pai) ${fromObject}.${fromMember} → ${parentObj.name}.${parentMember.name}`);
          this._crossObjectCalls.push({ fromObject, fromMember, toObject: parentObj.name, toMember: parentMember.name, callSite: site });
          return;
        }
      }
    }

    console.log(`[CallResolver] barecall ✘ ${fromObject}.${fromMember} → .${site.targetMember} — não encontrado`);
  }

  // ─── Strategy: self trigger ────────────────────────────────────────────────

  /** Checks: object name match → self events → parent window → stubs → inheritance chain. */
  _resolveSelfTrigger(site, fromObject, fromMember) {
    const targetEv = site.targetMember.toLowerCase();

    // Case 1: event name matches a loaded object name
    const resolvedObj = this._objectMap.get(targetEv);
    if (resolvedObj) {
      console.log(`[CallResolver] Trigger Event resolvido (objeto): ${fromObject}.${fromMember} → ${resolvedObj.name}`);
      this._crossObjectCalls.push({ fromObject, fromMember, toObject: resolvedObj.name, toMember: site.targetMember, callSite: site });
      return;
    }

    const ownerObj = this._objectMap.get(fromObject.toLowerCase());

    // Case 2: event on the current object
    const selfEv = this._findByName(ownerObj?.events, targetEv);
    if (selfEv) {
      console.log(`[CallResolver] Trigger Event resolvido (self): ${fromObject}.${fromMember} → ${fromObject}.${selfEv.name}`);
      this._crossObjectCalls.push({ fromObject, fromMember, toObject: fromObject, toMember: selfEv.name, callSite: site });
      return;
    }

    // Case 3: control triggering an event on its parent window
    if (ownerObj?.withinName) {
      const parentObj = this._objectMap.get(ownerObj.withinName.toLowerCase());
      const parentEv  = this._findByName(parentObj?.events, targetEv);
      if (parentEv) {
        console.log(`[CallResolver] Trigger Event resolvido (janela-pai): ${fromObject}.${fromMember} → ${parentObj.name}.${parentEv.name}`);
        this._crossObjectCalls.push({ fromObject, fromMember, toObject: parentObj.name, toMember: parentEv.name, callSite: site });
        return;
      }
    }

    // Case 4: event stub on current object
    const selfStub = this._findByName(ownerObj?.eventStubs, targetEv);
    if (selfStub) {
      console.log(`[CallResolver] Trigger Event resolvido (stub): ${fromObject}.${fromMember} → ${fromObject}.${selfStub.name}`);
      this._crossObjectCalls.push({ fromObject, fromMember, toObject: fromObject, toMember: selfStub.name, callSite: site });
      return;
    }

    // Case 5: walk inheritance chain
    let ancestor = ownerObj?.parentName && !this._isBuiltin(ownerObj.parentName)
      ? this._objectMap.get(ownerObj.parentName.toLowerCase()) : null;
    while (ancestor) {
      const ancEv =
        this._findByName(ancestor.events, targetEv) ||
        this._findByName(ancestor.eventStubs, targetEv);
      if (ancEv) {
        console.log(`[CallResolver] Trigger Event resolvido (herança): ${fromObject}.${fromMember} → ${fromObject}.${ancEv.name} (def. em ${ancestor.name})`);
        this._crossObjectCalls.push({ fromObject, fromMember, toObject: fromObject, toMember: ancEv.name, callSite: site });
        return;
      }
      ancestor = ancestor.parentName && !this._isBuiltin(ancestor.parentName)
        ? this._objectMap.get(ancestor.parentName.toLowerCase()) : null;
    }

    console.log(`[CallResolver] Trigger Event não resolvido: "${site.targetMember}" em ${fromObject}.${fromMember}`);
  }

  // ─── Strategy: cross target ────────────────────────────────────────────────

  /** Resolves dotcall / Call / cross-TriggerEvent where targetObject is explicit. */
  _resolveCrossTarget(site, fromObject, fromMember, varTypeMap) {
    const ownerObj = this._objectMap.get(fromObject.toLowerCase());
    let resolvedObj;

    if (site.targetObject === PB_CONSTANTS.SENTINEL_PARENT) {
      if (ownerObj?.withinName) {
        resolvedObj = this._objectMap.get(ownerObj.withinName.toLowerCase());
        if (resolvedObj) console.log(`[CallResolver] Parent resolvido: ${fromObject}.${fromMember} → ${resolvedObj.name}.${site.targetMember}`);
      }
    } else if (site.targetObject === PB_CONSTANTS.SENTINEL_SUPER) {
      if (ownerObj?.parentName && !this._isBuiltin(ownerObj.parentName)) {
        resolvedObj = this._objectMap.get(ownerObj.parentName.toLowerCase());
        if (resolvedObj) console.log(`[CallResolver] Super resolvido: ${fromObject}.${fromMember} → ${resolvedObj.name}.${site.targetMember}`);
      }
    }

    if (!resolvedObj) {
      const targetKey = site.targetObject.toLowerCase();
      resolvedObj = this._objectMap.get(targetKey);
      if (!resolvedObj) {
        const varType = varTypeMap.get(targetKey);
        if (varType) {
          resolvedObj = this._objectMap.get(varType);
          if (resolvedObj) console.log(`[CallResolver] dotcall ✔ via varTypeMap: ${fromObject}.${fromMember} → ${targetKey}(=${varType}) → ${resolvedObj.name}.${site.targetMember}`);
        }
      } else {
        console.log(`[CallResolver] dotcall ✔ direto: ${fromObject}.${fromMember} → ${resolvedObj.name}.${site.targetMember}`);
      }
    }

    if (resolvedObj) {
      const memberLower = site.targetMember.toLowerCase();
      const resolvedMember =
        this._findByName(resolvedObj.functions,  memberLower) ||
        this._findByName(resolvedObj.events,     memberLower) ||
        this._findByName(resolvedObj.eventStubs, memberLower) ||
        this._findByName(resolvedObj.prototypes, memberLower);
      this._crossObjectCalls.push({
        fromObject, fromMember,
        toObject: resolvedObj.name,
        toMember: resolvedMember ? resolvedMember.name : site.targetMember,
        callSite: site,
      });
    } else {
      console.log(`[CallResolver] dotcall ✘ ${fromObject}.${fromMember} → ${site.targetObject}.${site.targetMember}`);
      if (site.targetObject === PB_CONSTANTS.SENTINEL_PARENT || site.targetObject === PB_CONSTANTS.SENTINEL_SUPER) return;
      this._unresolvedCalls.push({ fromObject, fromMember, ...site });
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  _buildVarTypeMap(obj) {
    const map = new Map();
    for (const v of obj.variables) map.set(v.name.toLowerCase(), v.typeName.toLowerCase());
    for (const c of obj.controls)  map.set(c.name.toLowerCase(), c.typeName.toLowerCase());
    return map;
  }

  _buildScopedVarMap(varTypeMap, params) {
    const scoped = new Map(varTypeMap);
    for (const p of (params || [])) {
      if (p.name && p.typeName) scoped.set(p.name.toLowerCase(), p.typeName.toLowerCase());
    }
    return scoped;
  }

  _isBuiltin(name) {
    return PB_CONSTANTS.PB_BUILTIN_TYPES_SET.has(name.toLowerCase());
  }

  _findByName(list, name) {
    return list?.find(m => m.name.toLowerCase() === name.toLowerCase());
  }
}

window.CallResolver = CallResolver;
