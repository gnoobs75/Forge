const { readFile, writeFile, mkdir, rename } = require('node:fs/promises');
const { dirname } = require('node:path');

class Registry {
  /** @param {string} filePath */
  constructor(filePath) {
    this.filePath = filePath;
    /** @type {import('./types').TabRecord[]} */
    this.tabs = [];
  }

  async load() {
    let raw;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') { this.tabs = []; return; }
      // Re-throw non-ENOENT I/O errors (EACCES, EIO, EISDIR, etc.) so callers
      // can surface them. Do NOT blank the registry here — the file on disk
      // might be perfectly good and just transiently unreadable.
      throw err;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // True corruption: the file exists and is readable but not valid JSON.
      // Back it up, start empty. Never infinite-fail-loop.
      try { await rename(this.filePath, this.filePath + '.bak-' + Date.now()); } catch {}
      this.tabs = [];
      return;
    }

    if (!parsed || !Array.isArray(parsed.tabs)) {
      // Structurally corrupt: valid JSON but missing/invalid `tabs` array.
      try { await rename(this.filePath, this.filePath + '.bak-' + Date.now()); } catch {}
      this.tabs = [];
      return;
    }

    this.tabs = parsed.tabs;
  }

  // Atomic write: write to .tmp, then rename.
  async save() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = this.filePath + '.tmp';
    const payload = JSON.stringify({ tabs: this.tabs }, null, 2);
    await writeFile(tmp, payload, 'utf8');
    await rename(tmp, this.filePath);
  }

  list() { return this.tabs.slice(); }

  get(id) { return this.tabs.find(t => t.id === id); }

  upsert(tab) {
    const i = this.tabs.findIndex(t => t.id === tab.id);
    if (i >= 0) this.tabs[i] = tab; else this.tabs.push(tab);
  }

  remove(id) { this.tabs = this.tabs.filter(t => t.id !== id); }
}

module.exports = { Registry };
