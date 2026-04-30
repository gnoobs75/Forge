// Built-in rule: bug-critical-ping-chat
//
// When a new bug JSON file appears with severity 'critical', post a Council
// Chat message attributed to QA Advisor flagging the bug. This is the
// "wake the studio up" channel for severity-critical work — most bugs flow
// through the todo + history chain, but critical ones also surface in the
// chat feed where everyone is watching.
//
// Council Chat persistence path: hq-data/council-chat/messages.json. If the
// file/dir doesn't exist yet (Council Chat hasn't been initialized in this
// install), the handler skips with a friendly message instead of erroring.
//
// Idempotency: scan the most recent 50 messages for a marker substring
// "[Critical bug filed in <slug>: '<title>'" — if found, skip. We do NOT
// commit the chat write because Council Chat may not be tracked in git.
//
// Trigger: kind 'file-changed', chokidar event 'add' (new bug files only).

import fs from 'node:fs';
import path from 'node:path';
import { studioWrite } from '../studio-write.js';

const BUG_PATH_REGEX = /^projects\/([^/]+)\/bugs\/[^/]+\.json$/;
const COUNCIL_CHAT_REL = 'council-chat/messages.json';
const RECENT_LOOKBACK = 50;

export const bugCriticalPingChat = {
  id: 'bug-critical-ping-chat',
  priority: 'low',
  description: 'When a critical bug is filed, post a QA Advisor message into Council Chat.',

  trigger: {
    source: 'hq',
    kind: 'file-changed',
    match: (event) => {
      const p = event?.payload?.path;
      if (typeof p !== 'string') return false;
      if (event.payload.event !== 'add') return false;
      return BUG_PATH_REGEX.test(p);
    },
  },

  handler: async ({ event, dataDir, intentUUID }) => {
    const relPath = event.payload.path;
    const m = BUG_PATH_REGEX.exec(relPath);
    if (!m) return { outcome: 'skipped', output: 'path did not match bugs pattern' };
    const slug = m[1];

    const bugAbsPath = path.join(dataDir, relPath);
    if (!fs.existsSync(bugAbsPath)) {
      return { outcome: 'skipped', output: `bug file not found: ${bugAbsPath}` };
    }

    let bug;
    try {
      bug = JSON.parse(fs.readFileSync(bugAbsPath, 'utf-8'));
    } catch (err) {
      return { outcome: 'error', error: `failed to parse bug JSON: ${err.message}` };
    }

    if (bug.severity !== 'critical') {
      return { outcome: 'skipped', output: `bug severity is "${bug.severity}", not critical` };
    }

    const chatPath = path.join(dataDir, COUNCIL_CHAT_REL);
    const chatDir = path.dirname(chatPath);
    if (!fs.existsSync(chatDir)) {
      return { outcome: 'skipped', output: 'council chat not yet initialized' };
    }

    let chatDoc;
    if (fs.existsSync(chatPath)) {
      try {
        chatDoc = JSON.parse(fs.readFileSync(chatPath, 'utf-8'));
      } catch (err) {
        return { outcome: 'error', error: `failed to parse council chat JSON: ${err.message}` };
      }
    } else {
      chatDoc = { messages: [] };
    }
    if (!Array.isArray(chatDoc.messages)) chatDoc.messages = [];

    const bugId = bug.id || path.basename(relPath, '.json');
    const title = bug.title || bugId;
    const project = bug.project || slug;
    const pageRoute = bug.pageRoute || '(unknown route)';

    const marker = `[Critical bug filed in ${project}: '${title}'`;

    // Idempotency: scan the most-recent N messages for the marker
    const recent = chatDoc.messages.slice(-RECENT_LOOKBACK);
    const alreadyPosted = recent.some(msg =>
      msg && typeof msg.text === 'string' && msg.text.includes(marker)
    );
    if (alreadyPosted) {
      return { outcome: 'skipped', output: `chat already has critical-bug post for ${bugId}` };
    }

    const newMessage = {
      agent: 'QA Advisor',
      agentColor: '#EF4444',
      text: `${marker} on ${pageRoute}. Severity critical, status open.]`,
      timestamp: new Date().toISOString(),
      kind: 'bug-alert',
      bugId,
      project,
    };

    chatDoc.messages = [...chatDoc.messages, newMessage];
    chatDoc.lastUpdated = new Date().toISOString();

    // studioWrite without repoPath — the file is still written + origin-tagged,
    // but the path is not tracked in intentBatches, so no commitIntent needed
    // (and Council Chat may not be tracked in git anyway).
    try {
      await studioWrite({
        path: chatPath,
        content: chatDoc,
        intentUUID,
        format: 'json',
        debounceMs: 100,
      });
    } catch (err) {
      return { outcome: 'error', error: `failed to write council chat: ${err.message}` };
    }

    return {
      outcome: 'success',
      output: `posted critical-bug ping for ${bugId} (${project})`,
    };
  },
};
