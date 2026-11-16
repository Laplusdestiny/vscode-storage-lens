import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { formatBytes } from './format';
import { findServerLayout, isInside, samePath } from './paths';
import { OTHER_WINDOW_WARNING } from './policy';
import type { Entry, EnvInfo } from './types';

/** 危険なパスなら Error を throw する。どの削除経路でも最後にこれを通す */
export function assertSafeToDelete(p: string, env: EnvInfo): void {
  const layout = env.isRemote ? findServerLayout(env.appRoot) : undefined;
  const roots = [env.dataDir, ...(layout ? [layout.serverHome] : [])];
  if (!roots.some((root) => isInside(p, root))) {
    throw new Error(`データフォルダの外は削除できません: ${p}`);
  }

  // 同一・祖先・内側のいずれも禁止
  const sealed = [
    join(env.dataDir, 'Backups'),
    join(env.userDir, 'settings.json'),
    join(env.userDir, 'keybindings.json'),
    join(env.userDir, 'snippets'),
    env.currentWorkspaceStorageDir,
    env.currentLogSessionDir,
    layout?.currentServerDir,
    env.extensionsDir,
  ];
  // 同一・祖先は禁止(内側は可)
  const containers = [env.userDir, join(env.userDir, 'profiles')];

  for (const guarded of sealed) {
    if (guarded && (samePath(p, guarded) || isInside(guarded, p) || isInside(p, guarded))) {
      throw new Error(`保護されたパスは削除できません: ${p}`);
    }
  }
  for (const guarded of containers) {
    if (samePath(p, guarded) || isInside(guarded, p)) {
      throw new Error(`保護されたパスは削除できません: ${p}`);
    }
  }
}

export function planDeletion(entries: Entry[]): { immediate: Entry[]; deferred: Entry[]; skipped: Entry[] } {
  const immediate: Entry[] = [];
  const deferred: Entry[] = [];
  const skipped: Entry[] = [];
  for (const entry of entries) {
    if (!entry.deletable) skipped.push(entry);
    else if (entry.deferUntilClosed) deferred.push(entry);
    else immediate.push(entry);
  }
  return { immediate, deferred, skipped };
}

const defaultRemove = (p: string) => rm(p, { recursive: true });

export async function deleteEntries(
  entries: Entry[],
  env: EnvInfo,
  remove: (p: string) => Promise<void> = defaultRemove,
): Promise<{ deleted: Entry[]; failed: Entry[]; freedBytes: number }> {
  const deleted: Entry[] = [];
  const failed: Entry[] = [];
  for (const entry of entries) {
    try {
      assertSafeToDelete(entry.path, env);
      await remove(entry.path);
      deleted.push(entry);
    } catch {
      failed.push(entry);
    }
  }
  return { deleted, failed, freedBytes: deleted.reduce((sum, e) => sum + (e.size ?? 0), 0) };
}

export function buildDeleteCommand(paths: string[], platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `Remove-Item -Recurse -Force -LiteralPath ${paths.map((p) => `'${p.replace(/'/g, "''")}'`).join(', ')}`;
  }
  return `rm -rf -- ${paths.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(' ')}`;
}

export function buildConfirmMessage(entries: Entry[]): string {
  const total = entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
  const lines = [`${entries.length} 件(${formatBytes(total)})を完全に削除します。元に戻せません。`];
  if (entries.some((e) => e.group === 'workspaceStorage')) {
    lines.push('ワークスペースの状態: 開いていたファイルなどの状態が消えます。' + OTHER_WINDOW_WARNING);
  }
  if (entries.some((e) => e.group === 'history')) {
    lines.push('ローカル履歴: タイムラインの編集履歴が消えます。');
  }
  const deferred = entries.filter((e) => e.deferUntilClosed).length;
  if (deferred > 0) {
    lines.push(`うち ${deferred} 件は VS Code を閉じてから削除が必要です。`);
  }
  return lines.join('\n');
}
