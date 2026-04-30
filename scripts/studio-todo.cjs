#!/usr/bin/env node
// studio-todo — agent-facing CLI helper for tracking substeps in durable JSONL.
// See docs/plans/2026-04-29-agent-todos-design.md for the full design.

const fs = require('node:fs');
const path = require('node:path');

const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
const VALID_ACTIONS = new Set(['add', 'update', 'complete', 'cancel', 'list']);

function err(msg) {
  process.stderr.write(`studio-todo: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const [, , action, ...rest] = argv;
  if (!action) err('missing action — try: add | update | complete | cancel | list');
  if (!VALID_ACTIONS.has(action)) err(`unknown action "${action}" — valid: ${[...VALID_ACTIONS].join(', ')}`);
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = (rest[i + 1] && !rest[i + 1].startsWith('--')) ? rest[++i] : 'true';
      flags[key] = value;
    }
  }
  return { action, flags };
}

function envOrErr(name) {
  const v = process.env[name];
  if (!v) err(`missing required env var: ${name}`);
  return v;
}

function envOrNull(name) {
  return process.env[name] || null;
}

function getParent() {
  const todoId = envOrNull('STEWARD_PARENT_TODO');
  const recId = envOrNull('STEWARD_PARENT_REC');
  const project = envOrNull('STEWARD_PROJECT');
  if (todoId) return { kind: 'strategic-todo', id: todoId, project };
  if (recId) return { kind: 'recommendation', id: recId, project };
  return { kind: 'ad-hoc', id: null, project };
}

function getDataDir() {
  // Env override takes priority
  if (process.env.STEWARD_DATA_DIR) return process.env.STEWARD_DATA_DIR;
  // Walk up from cwd looking for hq-data/
  let cur = process.cwd();
  for (let i = 0; i < 8; i++) {
    const probe = path.join(cur, 'hq-data');
    if (fs.existsSync(probe)) return probe;
    const next = path.dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  err('could not locate hq-data/ — set STEWARD_DATA_DIR or run from inside an Agency repo');
}

function jsonlPath(dataDir, sessionId) {
  return path.join(dataDir, '.steward', 'agent-todos', `${sessionId}.jsonl`);
}

function appendLine(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(obj) + '\n', 'utf-8');
}

function emitEvent(action, flags, statusOverride) {
  const sessionId = envOrErr('STEWARD_SESSION_ID');
  const id = flags.id;
  if (!id) err('missing required --id');
  if (action === 'add' && !flags.title) err('--title is required on add');
  if (flags.status && !VALID_STATUSES.has(flags.status)) {
    err(`invalid status "${flags.status}" — valid: ${[...VALID_STATUSES].join(', ')}`);
  }
  const dataDir = getDataDir();
  const line = {
    ts: new Date().toISOString(),
    sessionId,
    parent: getParent(),
    action,
    id,
  };
  if (flags.title) line.title = flags.title;
  const status = statusOverride || flags.status || (action === 'add' ? 'pending' : undefined);
  if (status) line.status = status;
  if (flags.note) line.note = flags.note;
  appendLine(jsonlPath(dataDir, sessionId), line);
  process.stdout.write(`✓ ${action} ${id}\n`);
}

function listSession(filterParentId) {
  // STEWARD_SESSION_ID is only needed for the single-session case. The
  // cross-session "--parent" filter scans all JSONL files in the dir, so
  // it should work from an unmanaged shell (no env vars). Spec §6.1.
  const sessionId = filterParentId
    ? envOrNull('STEWARD_SESSION_ID')
    : envOrErr('STEWARD_SESSION_ID');
  const dataDir = getDataDir();
  const dir = path.join(dataDir, '.steward', 'agent-todos');
  if (!fs.existsSync(dir)) {
    process.stdout.write('No agent-todos yet.\n');
    return;
  }
  const files = filterParentId
    ? fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))
    : [`${sessionId}.jsonl`];
  const items = new Map(); // id → latest merged state
  for (const f of files) {
    const fp = path.join(dir, f);
    if (!fs.existsSync(fp)) continue;
    const lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      let obj;
      try { obj = JSON.parse(line); } catch { continue; } // skip half-written lines
      if (filterParentId && obj.parent?.id !== filterParentId) continue;
      const cur = items.get(obj.id) || {};
      const merged = { ...cur, ...obj };
      // Sugar actions force status
      if (obj.action === 'complete') merged.status = 'completed';
      if (obj.action === 'cancel') merged.status = 'cancelled';
      items.set(obj.id, merged);
    }
  }
  const list = [...items.values()].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  if (list.length === 0) {
    process.stdout.write('No agent-todos found.\n');
    return;
  }
  for (const item of list) {
    const icon =
      item.status === 'completed'  ? '✓' :
      item.status === 'cancelled'  ? '✗' :
      item.status === 'in_progress'? '⏳' : '○';
    process.stdout.write(`${icon} ${item.id} [${item.status || 'pending'}] ${item.title || ''}\n`);
    if (item.note) process.stdout.write(`    ${item.note}\n`);
  }
}

function main() {
  const { action, flags } = parseArgs(process.argv);
  switch (action) {
    case 'add':      return emitEvent('add', flags);
    case 'update':   return emitEvent('update', flags);
    case 'complete': return emitEvent('complete', flags, 'completed');
    case 'cancel':   return emitEvent('cancel', flags, 'cancelled');
    case 'list':     return listSession(flags.parent || null);
  }
}

if (require.main === module) {
  try { main(); }
  catch (e) {
    process.stderr.write(`studio-todo: ${e.message}\n`);
    process.exit(1);
  }
}

// Test exports
module.exports = { parseArgs, getParent, jsonlPath, _internal: { appendLine } };
