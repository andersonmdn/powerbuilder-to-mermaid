/**
 * app.js
 * UI orchestration for the PB → Mermaid tool.
 * Wires file drag-drop, parsing pipeline, and results display.
 */
const App = (() => {

  // ─── State ──────────────────────────────────────────────────────────────────

  let _loadedFiles = [];      // { filename, text }
  let _analyzedProject = null;
  let _generatedText = '';
  let _activeTab = 'mermaid';

  // ─── Init ────────────────────────────────────────────────────────────────────

  function init() {
    _initMermaid();
    _bindDropZone();
    _bindFileInput();
    _bindGenerateButton();
    _bindTabs();
    _bindCopyButton();
    _bindDownloadButton();
  }

  function _initMermaid() {
    if (typeof mermaid !== 'undefined') {
      mermaid.initialize({ startOnLoad: false, theme: 'default' });
    }
  }

  // ─── File ingestion ──────────────────────────────────────────────────────────

  function _bindDropZone() {
    const zone = document.getElementById('drop-zone');
    if (!zone) return;

    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      _processFileList(e.dataTransfer.files);
    });

    zone.addEventListener('click', () => {
      document.getElementById('file-input').click();
    });
  }

  function _bindFileInput() {
    const input = document.getElementById('file-input');
    if (!input) return;
    input.addEventListener('change', e => {
      _processFileList(e.target.files);
      input.value = ''; // reset so same file can be re-added
    });
  }

  function _processFileList(fileList) {
    if (!fileList || !fileList.length) return;
    console.log(`[App] _processFileList: ${fileList.length} arquivo(s) recebido(s)`);

    const LARGE_FILE_BYTES = 500 * 1024;
    const promises = Array.from(fileList).map(file => {
      if (file.size > LARGE_FILE_BYTES) {
        _addFileRow(file.name, 'warning', `Arquivo grande (${_formatBytes(file.size)}) — processamento pode ser lento.`);
      } else {
        _addFileRow(file.name, 'pending');
      }
      return _readFile(file);
    });

    Promise.all(promises).then(results => {
      results.forEach(r => {
        const existing = _loadedFiles.findIndex(f => f.filename === r.filename);
        if (existing !== -1) {
          _loadedFiles[existing] = r;
          _updateFileRow(r.filename, 'ok');
        } else {
          _loadedFiles.push(r);
          _updateFileRow(r.filename, 'ok');
        }
      });
      _setGenerateEnabled(true);
    });
  }

  function _readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        console.log(`[App] Arquivo lido: ${file.name} (${_formatBytes(file.size)})`);
        resolve({ filename: file.name, text: e.target.result });
      };
      reader.onerror = () => {
        _updateFileRow(file.name, 'error', 'Falha ao ler arquivo.');
        reject(new Error(`Failed to read ${file.name}`));
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  // ─── Pipeline ─────────────────────────────────────────────────────────────────

  function _bindGenerateButton() {
    const btn = document.getElementById('btn-generate');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!_loadedFiles.length) return;
      _setGenerateEnabled(false);
      _showStatus('Analisando…', 'info');
      // Defer to allow browser to repaint the loading state
      setTimeout(() => _runPipeline(), 0);
    });
  }

  function _runPipeline() {
    console.group('[App] _runPipeline');
    console.time('[App] pipeline total');
    try {
      const parser = new PBParser();
      const parsedFiles = _loadedFiles.map(f => {
        try {
          const result = parser.parseFile(f.filename, f.text);
          _updateFileRow(f.filename, 'ok');
          return result;
        } catch (err) {
          _updateFileRow(f.filename, 'error', err.message);
          throw err;
        }
      });
      console.log(`[App] Parse concluído: ${parsedFiles.length} arquivo(s)`);

      const analyzer = new PBAnalyzer();
      _analyzedProject = analyzer.analyze(parsedFiles);
      console.log(`[App] Análise concluída: ${_analyzedProject.objects.size} objetos, ${_analyzedProject.inheritanceEdges.length} edges de herança, ${_analyzedProject.crossObjectCalls.length} chamadas cruzadas`);

      const options = _getOptions();
      const generator = new MermaidGenerator(options);
      _generatedText = generator.generate(_analyzedProject);
      console.log(`[App] Diagrama gerado: ${_generatedText.length} chars`);

      _showResults();
      _showStatus('Concluído!', 'success');
    } catch (err) {
      _showStatus(`Erro: ${err.message}`, 'error');
      console.error('[App] Pipeline error:', err);
    } finally {
      console.timeEnd('[App] pipeline total');
      console.groupEnd();
      _setGenerateEnabled(true);
    }
  }

  // ─── Options ──────────────────────────────────────────────────────────────────

  function _getOptions() {
    const checked = id => {
      const el = document.getElementById(id);
      return el ? el.checked : true;
    };
    return {
      includeVariables:   checked('opt-variables'),
      includeControls:    checked('opt-controls'),
      includeCalls:       checked('opt-calls'),
      includeEvents:      checked('opt-events'),
      includeFunctions:   checked('opt-functions'),
      showBuiltinParents: checked('opt-builtins'),
    };
  }

  // ─── Results display ──────────────────────────────────────────────────────────

  function _showResults() {
    document.getElementById('results-section').style.display = 'block';
    _switchTab(_activeTab);
  }

  function _bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
    });
  }

  function _switchTab(tabName) {
    _activeTab = tabName;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.style.display = panel.dataset.tab === tabName ? 'block' : 'none';
    });

    if (tabName === 'mermaid') {
      _renderMermaidText();
    } else if (tabName === 'preview') {
      _renderMermaidPreview();
    } else if (tabName === 'objects') {
      _renderObjectsTable();
    }
  }

  function _renderMermaidText() {
    const el = document.getElementById('mermaid-output');
    if (el) el.textContent = _generatedText;
  }

  async function _renderMermaidPreview() {
    const container = document.getElementById('preview-container');
    if (!container) return;

    if (typeof mermaid === 'undefined') {
      container.innerHTML = '<p class="error-msg">Mermaid.js não carregado — verifique conexão com a internet para CDN.</p>';
      return;
    }

    if (!_generatedText) {
      container.innerHTML = '<p class="info-msg">Gere o diagrama primeiro.</p>';
      return;
    }

    try {
      container.innerHTML = '<p class="info-msg">Renderizando…</p>';
      const id = 'pb-mermaid-' + Date.now();
      const { svg } = await mermaid.render(id, _generatedText);
      container.innerHTML = svg;
    } catch (err) {
      container.innerHTML = `<p class="error-msg">Erro ao renderizar: ${err.message}</p>`;
    }
  }

  function _renderObjectsTable() {
    const container = document.getElementById('objects-container');
    if (!container || !_analyzedProject) return;

    const objects = Array.from(_analyzedProject.objects.values());
    if (!objects.length) {
      container.innerHTML = '<p class="info-msg">Nenhum objeto encontrado.</p>';
      return;
    }

    const rows = objects.map(obj => {
      const parent = obj.parentName
        ? `<span class="tag tag-parent">${_esc(obj.parentName)}</span>`
        : '<span class="tag tag-none">—</span>';
      const funcCount  = obj.functions.length + obj.prototypes.length;
      const eventCount = obj.events.length;
      const varCount   = obj.variables.length;
      const ctrlCount  = obj.controls.length;
      return `
        <tr>
          <td><strong>${_esc(obj.name)}</strong></td>
          <td><span class="tag tag-type">${_esc(obj.objectType)}</span></td>
          <td>${parent}</td>
          <td class="num">${funcCount}</td>
          <td class="num">${eventCount}</td>
          <td class="num">${varCount}</td>
          <td class="num">${ctrlCount}</td>
          <td><span class="tag tag-file">${_esc(obj.sourceFile)}</span></td>
        </tr>`;
    }).join('');

    const inheritCount = _analyzedProject.inheritanceEdges.length;
    const callCount    = _analyzedProject.crossObjectCalls.length;

    container.innerHTML = `
      <div class="stats-bar">
        <span>${objects.length} objetos</span>
        <span>${inheritCount} heranças</span>
        <span>${callCount} chamadas cross-objeto</span>
        <span>${_analyzedProject.unresolvedCalls.length} chamadas não resolvidas</span>
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

  // ─── File list UI ──────────────────────────────────────────────────────────────

  function _addFileRow(filename, status, message) {
    const list = document.getElementById('file-list');
    if (!list) return;

    const existing = list.querySelector(`[data-filename="${CSS.escape(filename)}"]`);
    if (existing) {
      _updateFileRow(filename, status, message);
      return;
    }

    const row = document.createElement('div');
    row.className = `file-row status-${status}`;
    row.dataset.filename = filename;

    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = _statusIcon(status);

    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = filename;

    const msg = document.createElement('span');
    msg.className = 'file-msg';
    msg.textContent = message || '';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remover arquivo';
    removeBtn.addEventListener('click', () => _removeFile(filename));

    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(msg);
    row.appendChild(removeBtn);
    list.appendChild(row);
  }

  function _updateFileRow(filename, status, message) {
    const list = document.getElementById('file-list');
    if (!list) return;
    const row = list.querySelector(`[data-filename="${CSS.escape(filename)}"]`);
    if (!row) return;

    row.className = `file-row status-${status}`;
    const icon = row.querySelector('.file-icon');
    if (icon) icon.textContent = _statusIcon(status);
    const msg = row.querySelector('.file-msg');
    if (msg) msg.textContent = message || '';
  }

  function _removeFile(filename) {
    _loadedFiles = _loadedFiles.filter(f => f.filename !== filename);
    const list = document.getElementById('file-list');
    const row = list?.querySelector(`[data-filename="${CSS.escape(filename)}"]`);
    if (row) row.remove();
    if (!_loadedFiles.length) _setGenerateEnabled(false);
  }

  // ─── Copy / Download ──────────────────────────────────────────────────────────

  function _bindCopyButton() {
    document.getElementById('btn-copy')?.addEventListener('click', () => {
      if (!_generatedText) return;
      navigator.clipboard.writeText(_generatedText).then(() => {
        const btn = document.getElementById('btn-copy');
        const orig = btn.textContent;
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });
  }

  function _bindDownloadButton() {
    document.getElementById('btn-download')?.addEventListener('click', () => {
      if (!_generatedText) return;
      const blob = new Blob([_generatedText], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'diagram.mmd';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  // ─── Status bar ───────────────────────────────────────────────────────────────

  function _showStatus(message, type) {
    const bar = document.getElementById('status-bar');
    if (!bar) return;
    bar.textContent = message;
    bar.className = `status-bar status-${type}`;
    bar.style.display = 'block';
  }

  function _setGenerateEnabled(enabled) {
    const btn = document.getElementById('btn-generate');
    if (btn) btn.disabled = !enabled;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  function _statusIcon(status) {
    switch (status) {
      case 'ok':      return '✓';
      case 'error':   return '✗';
      case 'warning': return '⚠';
      case 'pending': return '…';
      default:        return '·';
    }
  }

  function _formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Public ────────────────────────────────────────────────────────────────────

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
