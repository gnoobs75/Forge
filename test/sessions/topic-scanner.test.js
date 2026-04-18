import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scanTopic } = require('../../electron/sessions/topic-scanner.js');

describe('scanTopic', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-topic-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeJsonl(name, records) {
    const p = join(dir, name);
    writeFileSync(p, records.map(r => JSON.stringify(r)).join('\n'), 'utf8');
    return p;
  }

  it('returns "" when file empty', async () => {
    const p = join(dir, 'empty.jsonl');
    writeFileSync(p, '', 'utf8');
    expect(await scanTopic(p)).toBe('');
  });

  it('returns "" when file missing', async () => {
    expect(await scanTopic(join(dir, 'nope.jsonl'))).toBe('');
  });

  it('returns last user message, truncated with "\u2026" when > 60 chars', async () => {
    const longMsg = 'a'.repeat(120);
    const p = writeJsonl('long.jsonl', [
      { role: 'user', content: 'first short question' },
      { role: 'assistant', content: 'some assistant reply' },
      { role: 'user', content: longMsg },
    ]);
    const out = await scanTopic(p);
    expect(out.length).toBe(60);
    expect(out.endsWith('\u2026')).toBe(true);
    expect(out.startsWith('a'.repeat(59))).toBe(true);
  });

  it('skips assistant and tool entries', async () => {
    const p = writeJsonl('mix.jsonl', [
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: 'hi there' },
      { type: 'tool_result', content: 'tool stuff' },
      { role: 'system', content: 'system reminder' },
    ]);
    expect(await scanTopic(p)).toBe('hello world');
  });

  it('handles structured content [{type:"text",text:...}]', async () => {
    const p = writeJsonl('structured.jsonl', [
      { role: 'user', content: [
        { type: 'text', text: 'build me a' },
        { type: 'tool_use', id: 'x' },
        { type: 'text', text: 'pipeline please' },
      ] },
    ]);
    expect(await scanTopic(p)).toBe('build me a pipeline please');
  });

  it('handles wrapped shape {message:{role:"user",content:"..."}}', async () => {
    const p = writeJsonl('wrapped.jsonl', [
      { message: { role: 'assistant', content: 'prior reply' } },
      { message: { role: 'user', content: 'wrapped question here' } },
    ]);
    expect(await scanTopic(p)).toBe('wrapped question here');
  });
});
