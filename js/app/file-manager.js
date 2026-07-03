/**
 * file-manager.js
 * Handles file ingestion (drop zone, file input) and the file list UI.
 * Depends on: PB_CONSTANTS, DOMUtils.
 * Exposed as window.FileManager.
 */
class FileManager {

  /**
   * @param {{ onFilesReady: Function, onFileRemoved: Function }} callbacks
   *   onFilesReady()             — called after all files in a batch finish loading
   *   onFileRemoved(hasFiles)    — called when a file is removed; arg = whether any remain
   */
  constructor({ onFilesReady, onFileRemoved }) {
    this._files        = [];
    this._onFilesReady = onFilesReady;
    this._onFileRemoved = onFileRemoved;
  }

  /** Returns the currently loaded file list. */
  getFiles() { return this._files; }

  // ─── Drop zone & file input ────────────────────────────────────────────────

  bindDropZone() {
    const zone = document.getElementById('drop-zone');
    if (!zone) return;

    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));

    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      this._processFileList(e.dataTransfer.files);
    });

    zone.addEventListener('click', () => document.getElementById('file-input').click());
  }

  bindFileInput() {
    const input = document.getElementById('file-input');
    if (!input) return;
    input.addEventListener('change', e => {
      this._processFileList(e.target.files);
      input.value = ''; // reset so same file can be re-added
    });
  }

  // ─── File processing ───────────────────────────────────────────────────────

  _processFileList(fileList) {
    if (!fileList || !fileList.length) return;
    console.log(`[FileManager] _processFileList: ${fileList.length} arquivo(s) recebido(s)`);

    const promises = Array.from(fileList).map(file => {
      if (file.size > PB_CONSTANTS.FILE_SIZE_LIMIT) {
        this._addFileRow(file.name, 'warning', `Arquivo grande (${DOMUtils.formatBytes(file.size)}) — processamento pode ser lento.`);
      } else {
        this._addFileRow(file.name, 'pending');
      }
      return this._readFile(file);
    });

    Promise.all(promises).then(results => {
      for (const r of results) {
        const idx = this._files.findIndex(f => f.filename === r.filename);
        if (idx !== -1) {
          this._files[idx] = r;
        } else {
          this._files.push(r);
        }
        this._updateFileRow(r.filename, 'ok');
      }
      this._onFilesReady();
    });
  }

  _readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        console.log(`[FileManager] Arquivo lido: ${file.name} (${DOMUtils.formatBytes(file.size)})`);
        resolve({ filename: file.name, text: e.target.result });
      };
      reader.onerror = () => {
        this._updateFileRow(file.name, 'error', 'Falha ao ler arquivo.');
        reject(new Error(`Failed to read ${file.name}`));
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  // ─── File list UI ──────────────────────────────────────────────────────────

  _addFileRow(filename, status, message) {
    const list = document.getElementById('file-list');
    if (!list) return;

    if (list.querySelector(`[data-filename="${CSS.escape(filename)}"]`)) {
      this._updateFileRow(filename, status, message);
      return;
    }

    const row = document.createElement('div');
    row.className = `file-row status-${status}`;
    row.dataset.filename = filename;

    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = this._statusIcon(status);

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
    removeBtn.addEventListener('click', () => this._removeFile(filename));

    row.append(icon, name, msg, removeBtn);
    list.appendChild(row);
  }

  _updateFileRow(filename, status, message) {
    const list = document.getElementById('file-list');
    if (!list) return;
    const row = list.querySelector(`[data-filename="${CSS.escape(filename)}"]`);
    if (!row) return;

    row.className = `file-row status-${status}`;
    const icon = row.querySelector('.file-icon');
    if (icon) icon.textContent = this._statusIcon(status);
    const msg = row.querySelector('.file-msg');
    if (msg) msg.textContent = message || '';
  }

  _removeFile(filename) {
    this._files = this._files.filter(f => f.filename !== filename);
    const list = document.getElementById('file-list');
    list?.querySelector(`[data-filename="${CSS.escape(filename)}"]`)?.remove();
    this._onFileRemoved(this._files.length > 0);
  }

  _statusIcon(status) {
    return PB_CONSTANTS.STATUS_ICONS[status] ?? PB_CONSTANTS.STATUS_ICONS.default;
  }
}

window.FileManager = FileManager;
