import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { samePath } from '../paths';
import type { Entry, EnvInfo, Marker } from '../types';
import { listChildren, makeEntry, pathExists, readJson } from './util';

/** workspace.json の URI から、このマシンで存在確認できるパスを返す。確認できない場合は undefined */
function localPathOf(uri: string, env: EnvInfo): string | undefined {
  try {
    const url = new URL(uri);
    if (url.protocol === 'file:') return fileURLToPath(url);
    if (url.protocol === 'vscode-remote:' && env.isRemote) return decodeURIComponent(url.pathname);
  } catch {
    // 不正な URI は確認しない
  }
  return undefined;
}

function displayName(uri: string): string | undefined {
  try {
    const name = basename(decodeURIComponent(new URL(uri).pathname));
    return name || undefined;
  } catch {
    return undefined;
  }
}

export async function scanWorkspaceStorage(
  env: EnvInfo,
  exists: (p: string) => Promise<boolean> = pathExists,
): Promise<Entry[]> {
  const dir = join(env.userDir, 'workspaceStorage');
  const entries: Entry[] = [];
  for (const child of await listChildren(dir)) {
    if (!child.isDirectory()) continue;
    const p = join(dir, child.name);
    const json = (await readJson(join(p, 'workspace.json'))) as { folder?: unknown; workspace?: unknown } | undefined;
    const uri = typeof json?.folder === 'string' ? json.folder : typeof json?.workspace === 'string' ? json.workspace : undefined;
    const label = (uri && displayName(uri)) || child.name;
    const markers: Marker[] = [];
    if (uri) {
      const local = localPathOf(uri, env);
      if (local !== undefined && !(await exists(local))) markers.push('missingSource');
    }
    const current = env.currentWorkspaceStorageDir !== undefined && samePath(p, env.currentWorkspaceStorageDir);
    if (current) markers.push('inUse');
    entries.push(makeEntry('workspaceStorage', p, label, { deletable: !current, warn: true, markers }));
  }
  return entries;
}
