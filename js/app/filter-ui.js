/**
 * filter-ui.js
 * Manages filter groups (preset chips + JSON loader) and persists them to localStorage.
 * Depends on: DOMUtils.
 * Exposed as window.FilterUI.
 */
class FilterUI {

  /**
   * @param {{ onStatus: Function }} callbacks
   *   onStatus(message, type) — delegate to app status bar
   */
  constructor({ onStatus }) {
    this._groups   = [];
    this._onStatus = onStatus;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Restores persisted groups from localStorage and renders them. */
  restore() {
    try {
      const raw = localStorage.getItem('pb_filter_groups');
      if (raw) {
        this._groups = JSON.parse(raw);
        this._renderGroups();
      }
    } catch (err) {
      console.warn('[FilterUI] localStorage pb_filter_groups corrompido — ignorando.', err);
    }
  }

  /** Wires the filter-group-input file picker. */
  bindLoader() {
    const input = document.getElementById('filter-group-input');
    if (!input) return;
    input.addEventListener('change', e => {
      const files = Array.from(e.target.files);
      input.value = '';
      if (!files.length) return;

      const promises = files.map(f => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => {
          try {
            const data = JSON.parse(ev.target.result);
            if (!data.name || !Array.isArray(data.members))
              return reject(new Error(`${f.name}: requer "name" (string) e "members" (array)`));
            resolve({
              id:          Date.now() + '_' + Math.random().toString(36).slice(2),
              name:        String(data.name),
              description: String(data.description || ''),
              members:     data.members.map(m => String(m)),
              enabled:     true,
            });
          } catch {
            reject(new Error(`${f.name}: JSON inválido`));
          }
        };
        reader.onerror = () => reject(new Error(`Falha ao ler ${f.name}`));
        reader.readAsText(f, 'utf-8');
      }));

      Promise.allSettled(promises).then(results => {
        const errors = [];
        for (const r of results) {
          if (r.status === 'fulfilled') {
            const idx = this._groups.findIndex(g => g.name === r.value.name);
            if (idx !== -1) this._groups[idx] = r.value;
            else this._groups.push(r.value);
          } else {
            errors.push(r.reason.message);
          }
        }
        this._save();
        this._renderGroups();
        if (errors.length) this._onStatus(`Erro: ${errors.join(' | ')}`, 'error');
      });
    });
  }

  /** Renders the preset chips row. */
  renderPresets() {
    const row = document.getElementById('filter-presets-row');
    if (!row) return;
    const presets = window.FilterPresets;
    if (!presets || !presets.length) { row.style.display = 'none'; return; }

    const chips = presets.map(p => {
      const loaded = this._groups.some(g => g.name === p.name);
      return `<button class="preset-chip${loaded ? ' preset-chip-loaded' : ''}"
                data-preset="${DOMUtils.esc(p.name)}"
                title="${DOMUtils.esc(p.description)} (${p.members.length} métodos)"
              >${DOMUtils.esc(p.name)}${loaded ? ' ✓' : ''}</button>`;
    }).join('');

    row.innerHTML = `<div class="filter-presets-row">
      <span class="presets-label">Predefinições:</span>
      <div class="filter-presets-chips">${chips}</div>
    </div>`;

    row.querySelectorAll('.preset-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.preset;
        if (this._groups.some(g => g.name === name)) return;
        const preset = presets.find(p => p.name === name);
        if (!preset) return;
        this._groups.push({
          id:          Date.now() + '_' + Math.random().toString(36).slice(2),
          name:        preset.name,
          description: preset.description,
          members:     preset.members.slice(),
          enabled:     true,
        });
        this._save();
        this._renderGroups();
        this.renderPresets();
      });
    });
  }

  /**
   * Returns the merged Set of ignored call targets from all enabled groups.
   * Callers should additionally merge manual textarea input.
   */
  buildIgnoredSet() {
    const targets = new Set();
    for (const group of this._groups) {
      if (group.enabled) group.members.forEach(m => targets.add(m.toLowerCase()));
    }
    return targets;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  _save() {
    localStorage.setItem('pb_filter_groups', JSON.stringify(this._groups));
  }

  _renderGroups() {
    const list = document.getElementById('filter-group-list');
    if (!list) return;
    if (!this._groups.length) { list.innerHTML = ''; return; }

    list.innerHTML = this._groups.map((g, i) => `
      <div class="filter-group-item ${g.enabled ? 'fg-active' : 'fg-inactive'}" data-index="${i}">
        <label class="filter-group-label">
          <input type="checkbox" class="fg-checkbox" data-index="${i}" ${g.enabled ? 'checked' : ''}>
          <span class="fg-name">${DOMUtils.esc(g.name)}</span>
          ${g.description ? `<span class="fg-desc">${DOMUtils.esc(g.description)}</span>` : ''}
          <span class="fg-count">${g.members.length} métodos</span>
        </label>
        <button class="fg-remove" data-index="${i}" title="Remover grupo">×</button>
      </div>`).join('');

    list.querySelectorAll('.fg-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        this._groups[+cb.dataset.index].enabled = cb.checked;
        this._save();
        this._renderGroups();
      });
    });

    list.querySelectorAll('.fg-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        this._groups.splice(+btn.dataset.index, 1);
        this._save();
        this._renderGroups();
        this.renderPresets();
      });
    });
  }
}

window.FilterUI = FilterUI;
