/**
 * app.js
 * Pipeline orchestration for the PB → Mermaid tool.
 * Depends on: PBParser, PBAnalyzer, MermaidGenerator, FileManager, FilterUI, ResultsUI.
 */
const App = (() => {

  // ─── State ──────────────────────────────────────────────────────────────────

  let _analyzedProject = null;
  let _generatedText   = '';

  // ─── Sub-modules ─────────────────────────────────────────────────────────────

  const _fileManager = new FileManager({
    onFilesReady:  ()         => _setGenerateEnabled(true),
    onFileRemoved: (hasFiles) => _setGenerateEnabled(hasFiles),
  });

  const _filterUI = new FilterUI({
    onStatus: (message, type) => _showStatus(message, type),
  });

  const _resultsUI = new ResultsUI({
    getText:    () => _generatedText,
    getProject: () => _analyzedProject,
  });

  // ─── Init ────────────────────────────────────────────────────────────────────

  function init() {
    _initMermaid();
    _fileManager.bindDropZone();
    _fileManager.bindFileInput();
    _bindGenerateButton();
    _resultsUI.bindTabs();
    _bindCopyButton();
    _bindDownloadButton();
    _bindDiagramTypeToggle();
    _filterUI.restore();
    _filterUI.bindLoader();
    _filterUI.renderPresets();
  }

  function _initMermaid() {
    if (typeof mermaid !== 'undefined') {
      mermaid.initialize({ startOnLoad: false, theme: 'default' });
    }
  }

  // ─── Diagram type toggle ──────────────────────────────────────────────────────

  function _bindDiagramTypeToggle() {
    document.querySelectorAll('input[name="diagram-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const isCallGraph = document.getElementById('opt-type-callgraph').checked;
        document.getElementById('callgraph-options').style.display     = isCallGraph ? 'flex' : 'none';
        document.getElementById('class-diagram-options').style.display = isCallGraph ? 'none' : 'flex';
      });
    });
  }

  // ─── Pipeline ─────────────────────────────────────────────────────────────────

  function _bindGenerateButton() {
    const btn = document.getElementById('btn-generate');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!_fileManager.getFiles().length) return;
      _setGenerateEnabled(false);
      _showStatus('Analisando…', 'info');
      setTimeout(() => _runPipeline(), 0);
    });
  }

  function _runPipeline() {
    console.group('[App] _runPipeline');
    console.time('[App] pipeline total');
    try {
      const parser = new PBParser();
      const parsedFiles = _fileManager.getFiles().map(f => {
        try {
          return parser.parseFile(f.filename, f.text);
        } catch (err) {
          throw err;
        }
      });
      console.log(`[App] Parse concluído: ${parsedFiles.length} arquivo(s)`);

      const analyzer = new PBAnalyzer();
      _analyzedProject = analyzer.analyze(parsedFiles);
      console.log(`[App] Análise concluída: ${_analyzedProject.objects.size} objetos`);

      const options = _getOptions();
      const generator = new MermaidGenerator(options);
      _generatedText = options.diagramType === 'callgraph'
        ? generator.generateCallGraph(_analyzedProject)
        : generator.generate(_analyzedProject);
      console.log(`[App] Diagrama gerado (${options.diagramType}): ${_generatedText.length} chars`);

      _resultsUI.show();
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
    const checked  = id  => { const el = document.getElementById(id); return el ? el.checked : true; };
    const radioVal = name => { const el = document.querySelector(`input[name="${name}"]:checked`); return el ? el.value : null; };

    const ignoredCallTargets = _filterUI.buildIgnoredSet();

    // Merge manual textarea entries
    const raw = document.getElementById('opt-ignore-json')?.value?.trim();
    if (raw) {
      try {
        const cfg = JSON.parse(raw);
        if (Array.isArray(cfg.ignoredCallTargets))
          cfg.ignoredCallTargets.forEach(t => ignoredCallTargets.add(String(t).toLowerCase()));
      } catch {
        _showStatus('JSON inválido no campo "Ignorar chamadas". Verifique o formato.', 'error');
      }
    }

    return {
      includeVariables:   checked('opt-variables'),
      includeControls:    checked('opt-controls'),
      includeCalls:       checked('opt-calls'),
      includeEvents:      checked('opt-events'),
      includeFunctions:   checked('opt-functions'),
      showBuiltinParents: checked('opt-builtins'),
      diagramType:            radioVal('diagram-type')  ?? 'class',
      callGraphDirection:     radioVal('cg-direction')  ?? 'LR',
      includeInternalCalls:   checked('opt-cg-internal'),
      includeUnresolvedCalls: checked('opt-cg-unresolved'),
      includeOrphanNodes:     checked('opt-cg-orphans'),
      ignoredCallTargets,
    };
  }

  // ─── Copy / Download ──────────────────────────────────────────────────────────

  function _bindCopyButton() {
    document.getElementById('btn-copy')?.addEventListener('click', () => {
      if (!_generatedText) return;
      navigator.clipboard.writeText(_generatedText).then(() => {
        _revertBtnText(document.getElementById('btn-copy'), 'Copiado!', PB_CONSTANTS.COPY_REVERT_DELAY);
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
      setTimeout(() => URL.revokeObjectURL(url), PB_CONSTANTS.DL_REVERT_DELAY);
    });
  }

  function _revertBtnText(btn, newText, delay) {
    const orig = btn.textContent;
    btn.textContent = newText;
    setTimeout(() => { btn.textContent = orig; }, delay);
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

  // ─── Public ────────────────────────────────────────────────────────────────────

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
