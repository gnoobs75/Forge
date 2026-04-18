const { EventEmitter } = require('node:events');
const chokidar = require('chokidar');
const { basename, dirname, extname } = require('node:path');
const { statSync } = require('node:fs');

// "C--Claude-Samurai-Forge" -> "C:/Claude/Samurai/Forge"
// Pattern: drive letter, then "--" encoding ":/", then hyphens encoding "/".
function unescapeCwd(dirName) {
  const m = dirName.match(/^([A-Za-z])--(.*)$/);
  if (m) return `${m[1]}:/${m[2].replace(/-/g, '/')}`;
  return dirName.replace(/-/g, '/');
}

class SessionWatcher extends EventEmitter {
  constructor(rootDir) {
    super();
    this.rootDir = rootDir;
    this.watcher = null;
  }

  async start() {
    if (this.watcher) throw new Error('SessionWatcher already started');

    try {
      this.watcher = chokidar.watch(this.rootDir, {
        depth: 2,
        ignoreInitial: false,
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      });

      const handle = (path) => {
        if (extname(path) !== '.jsonl') return;
        const projectDirName = basename(dirname(path));
        let mtimeMs = Date.now();
        try { mtimeMs = statSync(path).mtimeMs; } catch { return; }
        this.emit('sessionFile', {
          cwd: unescapeCwd(projectDirName),
          sessionId: basename(path, '.jsonl'),
          path,
          mtimeMs,
        });
      };

      this.watcher.on('add', handle).on('change', handle);
      await new Promise((resolve, reject) => {
        this.watcher.once('ready', resolve);
        this.watcher.once('error', reject);
      });
    } catch (err) {
      if (this.watcher) {
        try { await this.watcher.close(); } catch {}
      }
      this.watcher = null;
      throw err;
    }
  }

  async stop() {
    if (this.watcher) { await this.watcher.close(); this.watcher = null; }
  }
}

module.exports = { SessionWatcher, unescapeCwd };
