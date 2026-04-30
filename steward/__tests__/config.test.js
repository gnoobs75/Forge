/* @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, saveConfig, DEFAULTS } from '../config.js';

describe('steward/config', () => {
  let tmpDir;
  let configPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steward-config-test-'));
    configPath = path.join(tmpDir, '.steward', 'config.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates default config file when none exists', () => {
    expect(fs.existsSync(configPath)).toBe(false);
    const config = loadConfig(configPath);
    expect(fs.existsSync(configPath)).toBe(true);
    expect(config).toEqual(DEFAULTS);
  });

  it('loads existing config and merges with defaults', () => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ enabled: true, concurrency: 10 }));
    const config = loadConfig(configPath);
    expect(config.enabled).toBe(true);
    expect(config.concurrency).toBe(10);
    expect(config.paused).toEqual([]);                  // default merged
    expect(config.confidenceThreshold).toBe(0.75);      // default merged
    expect(config.heartbeatIntervalMs).toBe(30_000);    // default merged
  });

  it('falls back to defaults if existing config is corrupt JSON', () => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, '{ not valid json');
    const config = loadConfig(configPath);
    expect(config).toEqual(DEFAULTS);
  });

  it('saveConfig persists to disk and roundtrips', () => {
    saveConfig(configPath, { ...DEFAULTS, enabled: true, paused: ['arena'] });
    const reloaded = loadConfig(configPath);
    expect(reloaded.enabled).toBe(true);
    expect(reloaded.paused).toEqual(['arena']);
    expect(reloaded.concurrency).toBe(5);
  });

  it('saveConfig creates parent directory if missing', () => {
    const nestedPath = path.join(tmpDir, 'deep', 'nested', '.steward', 'config.json');
    saveConfig(nestedPath, { ...DEFAULTS, enabled: true });
    expect(fs.existsSync(nestedPath)).toBe(true);
  });
});
