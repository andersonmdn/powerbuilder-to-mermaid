/**
 * preview-controller.js
 * Zoom, pan e fullscreen para a aba Preview.
 * Depende de: panzoom (CDN global window.panzoom), HoverHighlight.
 * Exposto como window.PreviewController.
 */
window.PreviewController = (() => {
  'use strict';

  let _modal   = null;  // { el, vp } — criado uma vez, reutilizado
  let _pzModal = null;  // instância panzoom do modal fullscreen
  let _escKey  = null;  // referência do handler ESC

  // ─── Modal DOM ──────────────────────────────────────────────────────────────

  function _ensureModal() {
    if (_modal) return _modal;
    const el = document.createElement('div');
    el.className = 'pv-modal';
    el.style.display = 'none';
    el.innerHTML =
      '<div class="pv-modal-header">' +
        '<span class="pv-modal-title">Preview</span>' +
        '<div class="pv-modal-controls">' +
          '<button class="pv-btn" data-fs="zoomin"  title="Aumentar zoom">+</button>' +
          '<button class="pv-btn" data-fs="zoomout" title="Diminuir zoom">−</button>' +
          '<button class="pv-btn" data-fs="fit"     title="Ajustar \xe0 tela">Fit</button>' +
          '<button class="pv-btn" data-fs="reset"   title="Resetar zoom">Reset</button>' +
          '<button class="pv-btn pv-btn-close" data-fs="close" title="Fechar (ESC)">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="pv-modal-viewport"></div>';
    document.body.appendChild(el);
    _modal = { el, vp: el.querySelector('.pv-modal-viewport') };
    return _modal;
  }

  // ─── Fit to viewport ────────────────────────────────────────────────────────

  function _fit(pz, svgEl, viewport) {
    pz.moveTo(0, 0);
    pz.zoomAbs(0, 0, 1);
    requestAnimationFrame(() => {
      const svgW = parseFloat(svgEl.getAttribute('width'))  || svgEl.getBoundingClientRect().width;
      const svgH = parseFloat(svgEl.getAttribute('height')) || svgEl.getBoundingClientRect().height;
      const vw   = viewport.clientWidth;
      const vh   = viewport.clientHeight;
      if (!svgW || !svgH || !vw || !vh) return;
      const scale = Math.min(vw / svgW, vh / svgH) * 0.92;
      pz.zoomAbs(0, 0, scale);
      pz.moveTo((vw - svgW * scale) / 2, (vh - svgH * scale) / 2);
    });
  }

  // ─── Fullscreen modal ───────────────────────────────────────────────────────

  function _closeModal() {
    if (!_modal) return;
    _modal.el.style.display = 'none';
    if (_pzModal) { _pzModal.dispose(); _pzModal = null; }
    _modal.vp.innerHTML = '';
    if (_escKey) { document.removeEventListener('keydown', _escKey); _escKey = null; }
  }

  function _openModal(svgEl, mermaidText) {
    const { el, vp } = _ensureModal();

    const clone = svgEl.cloneNode(true);
    clone.removeAttribute('style');
    vp.innerHTML = '';
    vp.appendChild(clone);
    el.style.display = 'flex';

    _pzModal = panzoom(clone, { maxZoom: 40, minZoom: 0.05, zoomSpeed: 0.065 });

    if (mermaidText && mermaidText.trimStart().startsWith('flowchart') &&
        typeof HoverHighlight !== 'undefined') {
      HoverHighlight.init(clone, mermaidText);
    }

    setTimeout(() => _fit(_pzModal, clone, vp), 60);

    el.querySelector('.pv-modal-controls').onclick = e => {
      const btn = e.target.closest('[data-fs]');
      if (!btn) return;
      const rect = vp.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      switch (btn.dataset.fs) {
        case 'zoomin':  _pzModal.smoothZoom(cx, cy, 1.3);    break;
        case 'zoomout': _pzModal.smoothZoom(cx, cy, 1 / 1.3); break;
        case 'fit':     _fit(_pzModal, clone, vp);            break;
        case 'reset':   _pzModal.moveTo(0, 0); _pzModal.zoomAbs(0, 0, 1); break;
        case 'close':   _closeModal();                         break;
      }
    };

    _escKey = e => { if (e.key === 'Escape') _closeModal(); };
    document.addEventListener('keydown', _escKey);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  function attach(container, svgEl, mermaidText) {
    if (typeof panzoom === 'undefined') {
      console.warn('PreviewController: panzoom CDN não carregado.');
      return { dispose() {} };
    }

    container.classList.add('pv-active');

    const pz = panzoom(svgEl, { maxZoom: 40, minZoom: 0.05, zoomSpeed: 0.065 });

    setTimeout(() => _fit(pz, svgEl, container), 60);

    // Toolbar overlay
    const toolbar = document.createElement('div');
    toolbar.className = 'pv-toolbar';
    toolbar.innerHTML =
      '<div class="pv-toolbar-group">' +
        '<button class="pv-btn" data-action="zoomin"  title="Aumentar zoom">+</button>' +
        '<button class="pv-btn" data-action="zoomout" title="Diminuir zoom">−</button>' +
        '<button class="pv-btn" data-action="fit"     title="Ajustar \xe0 tela">Fit</button>' +
        '<button class="pv-btn" data-action="reset"   title="Resetar zoom">Reset</button>' +
      '</div>' +
      '<button class="pv-btn pv-btn-expand" data-action="expand" title="Tela cheia">⛶</button>';
    container.appendChild(toolbar);

    toolbar.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      switch (btn.dataset.action) {
        case 'zoomin':  pz.smoothZoom(cx, cy, 1.3);    break;
        case 'zoomout': pz.smoothZoom(cx, cy, 1 / 1.3); break;
        case 'fit':     _fit(pz, svgEl, container);     break;
        case 'reset':   pz.moveTo(0, 0); pz.zoomAbs(0, 0, 1); break;
        case 'expand':  _openModal(svgEl, mermaidText); break;
      }
    });

    // Duplo clique para aproximar
    const onDblClick = e => pz.smoothZoom(e.clientX, e.clientY, 1.5);
    container.addEventListener('dblclick', onDblClick);

    return {
      dispose() {
        pz.dispose();
        container.classList.remove('pv-active');
        if (toolbar.parentNode) toolbar.remove();
        container.removeEventListener('dblclick', onDblClick);
        _closeModal();
      }
    };
  }

  return { attach };
})();
