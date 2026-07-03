/**
 * results-ui.js
 * Manages the results section: tab switching and panel rendering.
 * Depends on: DOMUtils.
 * Exposed as window.ResultsUI.
 */
class ResultsUI {

  /**
   * @param {{ getText: Function, getProject: Function }} accessors
   *   getText()     — returns current generated Mermaid text
   *   getProject()  — returns current AnalyzedProject
   */
  constructor({ getText, getProject }) {
    this._getText    = getText;
    this._getProject = getProject;
    this._activeTab  = 'mermaid';
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Shows the results section and activates the current tab. */
  show() {
    document.getElementById('results-section').style.display = 'block';
    this.switchTab(this._activeTab);
  }

  /** Wires all tab buttons. */
  bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
  }

  switchTab(tabName) {
    this._activeTab = tabName;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.style.display = panel.dataset.tab === tabName ? 'block' : 'none';
    });

    if      (tabName === 'mermaid')  this._renderMermaidText();
    else if (tabName === 'preview')  this._renderMermaidPreview();
    else if (tabName === 'objects')  this._renderObjectsTable();
  }

  // ─── Panel renderers ───────────────────────────────────────────────────────

  _renderMermaidText() {
    const el = document.getElementById('mermaid-output');
    if (el) el.textContent = this._getText();
  }

  async _renderMermaidPreview() {
    const container = document.getElementById('preview-container');
    if (!container) return;

    if (typeof mermaid === 'undefined') {
      container.innerHTML = '<p class="error-msg">Mermaid.js não carregado — verifique conexão com a internet para CDN.</p>';
      return;
    }

    const text = this._getText();
    if (!text) {
      container.innerHTML = '<p class="info-msg">Gere o diagrama primeiro.</p>';
      return;
    }

    try {
      container.innerHTML = '<p class="info-msg">Renderizando…</p>';
      const id = 'pb-mermaid-' + Date.now();
      const { svg } = await mermaid.render(id, text);
      container.innerHTML = svg;
    } catch (err) {
      container.innerHTML = `<p class="error-msg">Erro ao renderizar: ${err.message}</p>`;
    }
  }

  _renderObjectsTable() {
    const container = document.getElementById('objects-container');
    const project = this._getProject();
    if (!container || !project) return;

    const objects = Array.from(project.objects.values());
    if (!objects.length) {
      container.innerHTML = '<p class="info-msg">Nenhum objeto encontrado.</p>';
      return;
    }

    const rows = objects.map(obj => {
      const parent = obj.parentName
        ? `<span class="tag tag-parent">${DOMUtils.esc(obj.parentName)}</span>`
        : '<span class="tag tag-none">—</span>';
      return `
        <tr>
          <td><strong>${DOMUtils.esc(obj.name)}</strong></td>
          <td><span class="tag tag-type">${DOMUtils.esc(obj.objectType)}</span></td>
          <td>${parent}</td>
          <td class="num">${obj.functions.length + obj.prototypes.length}</td>
          <td class="num">${obj.events.length}</td>
          <td class="num">${obj.variables.length}</td>
          <td class="num">${obj.controls.length}</td>
          <td><span class="tag tag-file">${DOMUtils.esc(obj.sourceFile)}</span></td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="stats-bar">
        <span>${objects.length} objetos</span>
        <span>${project.inheritanceEdges.length} heranças</span>
        <span>${project.crossObjectCalls.length} chamadas cross-objeto</span>
        <span>${project.unresolvedCalls.length} chamadas não resolvidas</span>
      </div>
      <div class="table-scroll">
        <table class="objects-table">
          <thead>
            <tr>
              <th>Nome</th><th>Tipo</th><th>Herda de</th>
              <th>Funções</th><th>Eventos</th><th>Variáveis</th>
              <th>Controles</th><th>Arquivo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
}

window.ResultsUI = ResultsUI;
