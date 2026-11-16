import { readFile, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { findServerLayout, isInside, samePath } from '../paths';
import { CHECK_SERVER_IN_USE } from '../policy';
import type { Entry, EnvInfo } from '../types';
import { listChildren, makeEntry } from './util';

function touches(p: string, candidate: string): boolean {
  return samePath(p, candidate) || isInside(p, candidate);
}

/** procRoot/<pid>/cmdline と exe を見て、候補のうち使用中のものを返す */
export async function pathsInUse(candidates: string[], procRoot: string): Promise<Set<string>> {
  const used = new Set<string>();
  for (const child of await listChildren(procRoot)) {
    if (!/^\d+$/.test(child.name)) continue;
    const pidDir = join(procRoot, child.name);
    const seen: string[] = [];
    try {
      seen.push(...(await readFile(join(pidDir, 'cmdline'), 'utf8')).split('\0').filter(Boolean));
    } catch {
      // 読めない pid は無視
    }
    try {
      seen.push(await readlink(join(pidDir, 'exe')));
    } catch {
      // 読めない pid は無視
    }
    for (const candidate of candidates) {
      if (seen.some((s) => touches(s, candidate))) used.add(candidate);
    }
  }
  return used;
}

export async function scanOldServers(env: EnvInfo, procRoot = '/proc'): Promise<Entry[]> {
  if (!env.isRemote) return [];
  const layout = findServerLayout(env.appRoot);
  if (!layout) return [];
  const { serverHome, currentServerDir, commit } = layout;

  const candidates: { path: string; label: string }[] = [];
  for (const sub of [join(serverHome, 'bin'), join(serverHome, 'cli', 'servers')]) {
    for (const child of await listChildren(sub)) {
      if (!child.isDirectory()) continue;
      const p = join(sub, child.name);
      if (!samePath(p, currentServerDir)) candidates.push({ path: p, label: child.name });
    }
  }
  for (const child of await listChildren(serverHome)) {
    if (child.isFile() && child.name.startsWith('code-') && !child.name.includes(commit)) {
      candidates.push({ path: join(serverHome, child.name), label: child.name });
    }
  }

  const used = CHECK_SERVER_IN_USE ? await pathsInUse(candidates.map((c) => c.path), procRoot) : new Set<string>();
  return candidates.map(({ path, label }) =>
    makeEntry('oldServers', path, label, {
      deletable: !used.has(path),
      markers: used.has(path) ? ['inUse'] : [],
    }),
  );
}
