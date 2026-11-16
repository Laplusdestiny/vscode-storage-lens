import { join } from 'node:path';
import type { Entry, EnvInfo, Marker } from '../types';
import { listChildren, makeEntry, readJson } from './util';

export interface ListedExtension {
  /** 小文字 */
  id: string;
  folder: string;
}

function lastSegment(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/** extensions.json を読む。無い・壊れている場合は [] */
export async function readExtensionList(file: string): Promise<ListedExtension[]> {
  const json = await readJson(file);
  if (!Array.isArray(json)) return [];
  const result: ListedExtension[] = [];
  for (const item of json) {
    const id = item?.identifier?.id;
    if (typeof id !== 'string') continue;
    const folder =
      typeof item.relativeLocation === 'string'
        ? item.relativeLocation
        : typeof item.location?.path === 'string'
          ? lastSegment(item.location.path)
          : typeof item.location === 'string'
            ? lastSegment(item.location)
            : undefined;
    if (folder) result.push({ id: id.toLowerCase(), folder });
  }
  return result;
}

/** 今のプロファイルの一覧と、それ以外の一覧を読む */
async function readLists(env: EnvInfo): Promise<{ current: ListedExtension[]; others: ListedExtension[] }> {
  const defaultList = env.extensionsDir ? await readExtensionList(join(env.extensionsDir, 'extensions.json')) : [];
  const profilesDir = join(env.userDir, 'profiles');
  let current = env.profileId === undefined ? defaultList : [];
  const others: ListedExtension[] = env.profileId === undefined ? [] : [...defaultList];
  for (const child of await listChildren(profilesDir)) {
    if (!child.isDirectory()) continue;
    const items = await readExtensionList(join(profilesDir, child.name, 'extensions.json'));
    if (child.name === env.profileId) {
      current = items;
    } else {
      others.push(...items);
    }
  }
  return { current, others };
}

/** すべての一覧の id と、読み込まれている拡張の id */
export async function collectKnownExtensionIds(env: EnvInfo): Promise<Set<string>> {
  const { current, others } = await readLists(env);
  return new Set([...current, ...others].map((e) => e.id).concat(env.activeExtensionIds.map((id) => id.toLowerCase())));
}

export async function scanExtensions(env: EnvInfo): Promise<Entry[]> {
  if (!env.extensionsDir) return [];
  const { current, others } = await readLists(env);
  const obsoleteJson = await readJson(join(env.extensionsDir, '.obsolete'));
  const obsolete = new Set(
    obsoleteJson && typeof obsoleteJson === 'object' && !Array.isArray(obsoleteJson) ? Object.keys(obsoleteJson) : [],
  );
  const currentByFolder = new Map(current.map((e) => [e.folder, e]));
  const otherFolders = new Set(others.map((e) => e.folder));
  const active = new Set(env.activeExtensionIds.map((id) => id.toLowerCase()));

  const entries: Entry[] = [];
  for (const child of await listChildren(env.extensionsDir)) {
    if (!child.isDirectory() || child.name.startsWith('.')) continue;
    const p = join(env.extensionsDir, child.name);
    const markers: Marker[] = [];
    let extensionId: string | undefined;
    const listed = currentByFolder.get(child.name);
    if (obsolete.has(child.name)) {
      markers.push('obsolete');
    } else if (listed) {
      extensionId = listed.id;
      if (!active.has(listed.id)) markers.push('disabled');
    } else if (otherFolders.has(child.name)) {
      markers.push('otherProfile');
    } else {
      markers.push('unlisted');
    }
    entries.push(makeEntry('extensions', p, child.name, { markers, extensionId }));
  }
  return entries;
}
