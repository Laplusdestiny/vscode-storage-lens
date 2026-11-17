import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanCaches } from '../../src/core/scan/caches';
import { scanLogs } from '../../src/core/scan/logs';
import { scanWorkspaceStorage } from '../../src/core/scan/workspaceStorage';
import { makeTree, writeFiles as makeTreeAt } from '../helpers/fixture';
import { envFor } from '../helpers/env';

describe('scanCaches', () => {
  it('lists existing cache dirs only', async () => {
    const root = await makeTree({ 'data/Cache': null, 'data/GPUCache': null, 'data/CachedExtensionVSIXs': null });
    const caches = (await scanCaches(envFor(root))).filter((e) => e.group === 'cache');
    expect(caches.map((e) => e.label).sort()).toEqual(['Cache', 'CachedExtensionVSIXs', 'GPUCache']);
    const byName = Object.fromEntries(caches.map((e) => [e.label, e]));
    expect(byName.Cache.deferUntilClosed).toBe(true);
    expect(byName.GPUCache.deferUntilClosed).toBe(true);
    expect(byName.CachedExtensionVSIXs.deferUntilClosed).toBe(false);
    expect(caches.every((e) => e.deletable)).toBe(true);
  });

  it('lists other caches without deferring', async () => {
    const root = await makeTree({ 'data/Crashpad': null, 'data/Service Worker/CacheStorage': null, 'data/CachedProfilesData': null });
    const other = (await scanCaches(envFor(root))).filter((e) => e.group === 'otherCache');
    expect(other).toHaveLength(3);
    expect(other.every((e) => e.deletable && !e.deferUntilClosed)).toBe(true);
  });

  it('history is a warned entry', async () => {
    const root = await makeTree({ 'data/User/History/abc/entries.json': '{}' });
    const history = (await scanCaches(envFor(root))).filter((e) => e.group === 'history');
    expect(history).toHaveLength(1);
    expect(history[0].warn).toBe(true);
    expect(history[0].path).toBe(join(root, 'data', 'User', 'History'));
  });
});

describe('never returns protected paths', () => {
  it('skips Backups and user settings', async () => {
    const root = await makeTree({
      'data/Backups/x': 'unsaved',
      'data/User/settings.json': '{}',
      'data/User/keybindings.json': '[]',
      'data/User/snippets/a.json': '{}',
      'data/Cache': null,
      'data/logs/20261116T100000': null,
      'data/User/workspaceStorage/h1/workspace.json': '{}',
    });
    const env = envFor(root);
    const all = [...(await scanCaches(env)), ...(await scanLogs(env)), ...(await scanWorkspaceStorage(env))];
    const paths = all.map((e) => e.path);
    for (const bad of ['Backups', join('User', 'settings.json'), join('User', 'keybindings.json'), join('User', 'snippets')]) {
      expect(paths.some((p) => p === join(root, 'data', bad) || p.startsWith(join(root, 'data', bad)))).toBe(false);
    }
  });
});

describe('scanWorkspaceStorage', () => {
  it('labels workspace storage from workspace.json', async () => {
    const root = await makeTree({ 'proj/readme.md': 'x' });
    const uri = pathToFileURL(join(root, 'proj')).href;
    const gone = pathToFileURL(join(root, 'gone')).href;
    await makeTreeAt(root, {
      'data/User/workspaceStorage/h1/workspace.json': JSON.stringify({ folder: uri }),
      'data/User/workspaceStorage/h2/workspace.json': JSON.stringify({ folder: gone }),
    });
    const entries = await scanWorkspaceStorage(envFor(root));
    const h1 = entries.find((e) => e.path.endsWith('h1'))!;
    const h2 = entries.find((e) => e.path.endsWith('h2'))!;
    expect(h1.label).toBe('proj');
    expect(h1.markers).toEqual([]);
    expect(h1.warn).toBe(true);
    expect(h1.deletable).toBe(true);
    expect(h2.label).toBe('gone');
    expect(h2.markers).toContain('missingSource');
  });

  it('protects current workspace storage', async () => {
    const root = await makeTree({ 'data/User/workspaceStorage/cur/workspace.json': '{}', 'data/User/workspaceStorage/old': null });
    const env = envFor(root, { currentWorkspaceStorageDir: join(root, 'data', 'User', 'workspaceStorage', 'cur') });
    const entries = await scanWorkspaceStorage(env);
    const cur = entries.find((e) => e.path.endsWith('cur'))!;
    expect(cur.deletable).toBe(false);
    expect(cur.markers).toContain('inUse');
    expect(entries.find((e) => e.path.endsWith('old'))!.deletable).toBe(true);
  });

  it('tolerates malformed json', async () => {
    const root = await makeTree({ 'data/User/workspaceStorage/abc123/workspace.json': '{' });
    const entries = await scanWorkspaceStorage(envFor(root));
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('abc123');
    expect(entries[0].markers).toEqual([]);
  });

  it('does not touch network paths', async () => {
    const root = await makeTree({
      'data/User/workspaceStorage/n1/workspace.json': JSON.stringify({ folder: 'file://server/share/proj' }),
      'data/User/workspaceStorage/n2/workspace.json': JSON.stringify({ folder: 'file://wsl.localhost/Ubuntu/home/u/proj' }),
    });
    const checked: string[] = [];
    const entries = await scanWorkspaceStorage(envFor(root, { platform: 'win32' }), async (p) => {
      checked.push(p);
      return false;
    });
    expect(checked).toEqual([]);
    expect(entries.map((e) => e.label).sort()).toEqual(['proj', 'proj']);
    expect(entries.every((e) => e.markers.length === 0)).toBe(true);
  });

  it('checks vscode-remote paths only when remote', async () => {
    const root = await makeTree({ 'srv/proj': null });
    const remoteUri = `vscode-remote://ssh-remote%2Bhost${encodeURI(join(root, 'srv', 'missing').split('\\').join('/'))}`;
    await makeTreeAt(root, { 'data/User/workspaceStorage/r1/workspace.json': JSON.stringify({ folder: remoteUri }) });
    expect((await scanWorkspaceStorage(envFor(root, { isRemote: true })))[0].markers).toContain('missingSource');
    expect((await scanWorkspaceStorage(envFor(root, { isRemote: false })))[0].markers).toEqual([]);
  });
});

describe('scanLogs', () => {
  it('protects current log session', async () => {
    const root = await makeTree({ 'data/logs/20261101T000000': null, 'data/logs/20261116T100000': null });
    const env = envFor(root, { currentLogSessionDir: join(root, 'data', 'logs', '20261116T100000') });
    const logs = await scanLogs(env);
    expect(logs).toHaveLength(2);
    expect(logs.find((e) => e.label === '20261116T100000')!.deletable).toBe(false);
    expect(logs.find((e) => e.label === '20261101T000000')!.deletable).toBe(true);
  });
});
