import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertSafeToDelete,
  buildConfirmMessage,
  buildDeleteCommand,
  deleteEntries,
  revealCommand,
  planDeletion,
} from '../../src/core/delete';
import { OTHER_WINDOW_WARNING } from '../../src/core/policy';
import type { Entry, EnvInfo, GroupId } from '../../src/core/types';

const D = join('/', 'home', 'u', '.config', 'Code');
const U = join(D, 'User');
const env: EnvInfo = {
  platform: 'linux',
  isRemote: false,
  dataDir: D,
  userDir: U,
  extensionsDir: join('/', 'home', 'u', '.vscode', 'extensions'),
  currentWorkspaceStorageDir: join(U, 'workspaceStorage', 'cur'),
  currentLogSessionDir: join(D, 'logs', 'now'),
  appRoot: '/usr/share/code/resources/app',
  activeExtensionIds: [],
};

const entry = (group: GroupId, path: string, opts: Partial<Entry> = {}): Entry => ({
  id: path,
  group,
  label: path,
  path,
  deletable: true,
  deferUntilClosed: false,
  warn: false,
  markers: [],
  ...opts,
});

describe('assertSafeToDelete', () => {
  it('refuses protected paths', () => {
    for (const p of [
      U,
      join(U, 'settings.json'),
      join(U, 'keybindings.json'),
      join(U, 'snippets'),
      join(U, 'profiles'),
      join(D, 'Backups'),
      join(D, 'Backups', 'x'),
      join(U, 'workspaceStorage', 'cur'),
      join(D, 'logs', 'now'),
      D,
      join('/', 'home', 'u', 'Documents'),
      env.extensionsDir!,
    ]) {
      expect(() => assertSafeToDelete(p, env), p).toThrow();
    }
  });

  it('allows orphan data under profiles', () => {
    expect(() => assertSafeToDelete(join(U, 'profiles', 'p1', 'globalStorage', 'gone.ext'), env)).not.toThrow();
    expect(() => assertSafeToDelete(join(D, 'Cache'), env)).not.toThrow();
    expect(() => assertSafeToDelete(join(U, 'workspaceStorage', 'old'), env)).not.toThrow();
  });

  it('allows old servers inside the remote server home only', () => {
    const H = join('/', 'home', 'u', '.vscode-server');
    const remote: EnvInfo = { ...env, isRemote: true, dataDir: join(H, 'data'), userDir: join(H, 'data', 'User'), appRoot: join(H, 'bin', 'cur') };
    expect(() => assertSafeToDelete(join(H, 'bin', 'old'), remote)).not.toThrow();
    expect(() => assertSafeToDelete(join(H, 'bin', 'cur'), remote)).toThrow();
    expect(() => assertSafeToDelete(join(H, 'bin', 'old'), { ...remote, isRemote: false })).toThrow();
  });
});

describe('planDeletion', () => {
  it('plans deferred and skipped', () => {
    const a = entry('cache', join(D, 'Cache'), { deferUntilClosed: true });
    const b = entry('cache', join(D, 'CachedExtensionVSIXs'));
    const c = entry('extensions', join(D, 'x'), { deletable: false });
    expect(planDeletion([a, b, c])).toEqual({ immediate: [b], deferred: [a], skipped: [c] });
  });
});

describe('deleteEntries', () => {
  it('collects failures', async () => {
    const ok = entry('cache', join(D, 'CachedExtensionVSIXs'), { size: 100 });
    const busy = entry('logs', join(D, 'logs', 'old'), { size: 50 });
    const unsafe = entry('cache', join(U, 'settings.json'), { size: 1 });
    const removed: string[] = [];
    const result = await deleteEntries([ok, busy, unsafe], env, async (p) => {
      if (p === busy.path) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      removed.push(p);
    });
    expect(result.deleted).toEqual([ok]);
    expect(result.failed).toEqual([busy]);
    expect(result.refused).toEqual([unsafe]);
    expect(result.freedBytes).toBe(100);
    expect(removed).toEqual([ok.path]);
  });
});

describe('revealCommand', () => {
  it('pre-types a delete command only for deletable, safe entries', () => {
    expect(revealCommand(entry('logs', join(D, 'logs', 'old')), env)).toBe(`rm -rf -- '${join(D, 'logs', 'old')}'`);
    expect(revealCommand(entry('logs', join(D, 'logs', 'now'), { deletable: false, markers: ['inUse'] }), env)).toBeUndefined();
    expect(revealCommand(entry('extensions', join(env.extensionsDir!, 'a.one-1.0.0'), { deletable: false }), env)).toBeUndefined();
    expect(revealCommand(entry('cache', join(U, 'settings.json')), env)).toBeUndefined();
  });
});

describe('buildDeleteCommand', () => {
  it('quotes paths with spaces, quotes and Japanese', () => {
    expect(
      buildDeleteCommand(['C:\\Users\\山田\\AppData\\Roaming\\Code\\Code Cache', "C:\\x\\o'neil"], 'win32'),
    ).toBe("Remove-Item -Recurse -Force -LiteralPath 'C:\\Users\\山田\\AppData\\Roaming\\Code\\Code Cache', 'C:\\x\\o''neil'");
    expect(buildDeleteCommand(["/home/o'neil/x", '/a b/日本語'], 'linux')).toBe(
      "rm -rf -- '/home/o'\\''neil/x' '/a b/日本語'",
    );
  });
});

describe('buildConfirmMessage', () => {
  it('confirm message mentions warnings', () => {
    const msg = buildConfirmMessage([
      entry('workspaceStorage', join(U, 'workspaceStorage', 'h'), { size: 1024, warn: true }),
      entry('history', join(U, 'History'), { size: 1024, warn: true }),
      entry('cache', join(D, 'Cache'), { size: 1024, deferUntilClosed: true }),
    ]);
    expect(msg).toContain('3 件(3.0 KB)を完全に削除します。元に戻せません。');
    expect(msg).toContain('ワークスペースの状態: 開いていたファイルなどの状態が消えます。');
    expect(msg).toContain(OTHER_WINDOW_WARNING);
    expect(msg).toContain('ローカル履歴: タイムラインの編集履歴が消えます。');
    expect(msg).toContain('うち 1 件は VS Code を閉じてから削除が必要です。');
  });

  it('plain message has no warnings', () => {
    const msg = buildConfirmMessage([entry('cache', join(D, 'CachedExtensionVSIXs'), { size: 0 })]);
    expect(msg).toBe('1 件(0 B)を完全に削除します。元に戻せません。');
  });
});
