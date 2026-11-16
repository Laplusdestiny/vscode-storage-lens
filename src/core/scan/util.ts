import type { Dirent } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import type { Entry, GroupId } from '../types';

export function makeEntry(group: GroupId, path: string, label: string, opts: Partial<Entry> = {}): Entry {
  return {
    id: path,
    group,
    label,
    path,
    deletable: false,
    deferUntilClosed: false,
    warn: false,
    markers: [],
    ...opts,
  };
}

/** フォルダ直下の子を返す。読めなければ [] */
export async function listChildren(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** JSON を読む。無い・壊れている場合は undefined */
export async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}
