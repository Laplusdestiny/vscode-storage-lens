import { join } from 'node:path';
import type { Entry, EnvInfo, Marker } from '../types';
import { listChildren, makeEntry, pathExists as fileExists, readJson } from './util';

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
  return (await readExtensionListChecked(file)).items;
}

/** extensions.json を読み、読めたかどうかも返す(無い場合は ok: false) */
export async function readExtensionListChecked(file: string): Promise<{ items: ListedExtension[]; ok: boolean }> {
  const json = await readJson(file);
  if (!Array.isArray(json)) return { items: [], ok: false };
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
  return { items: result, ok: true };
}

/**
 * 今のプロファイルの一覧と、それ以外の一覧を読む。
 * complete は「すべての一覧を確実に読めたか」(既定の一覧が無い・どれかが壊れている場合は false)
 */
async function readLists(
  env: EnvInfo,
): Promise<{ current: ListedExtension[]; others: ListedExtension[]; complete: boolean }> {
  let complete = env.extensionsDir !== undefined;
  const defaultResult = env.extensionsDir
    ? await readExtensionListChecked(join(env.extensionsDir, 'extensions.json'))
    : { items: [], ok: false };
  if (!defaultResult.ok) complete = false;
  const defaultList = defaultResult.items;
  const profilesDir = join(env.userDir, 'profiles');
  let current = env.profileId === undefined ? defaultList : [];
  const others: ListedExtension[] = env.profileId === undefined ? [] : [...defaultList];
  for (const child of await listChildren(profilesDir)) {
    if (!child.isDirectory()) continue;
    const file = join(profilesDir, child.name, 'extensions.json');
    const result = await readExtensionListChecked(file);
    // プロファイルの一覧は無いこともある(拡張を入れていない)。あるのに壊れている場合だけ不完全とみなす
    if (!result.ok && (await fileExists(file))) complete = false;
    const items = result.items;
    if (child.name === env.profileId) {
      current = items;
    } else {
      others.push(...items);
    }
  }
  return { current, others, complete };
}

/** VS Code 本体に同梱の拡張の id(<appRoot>/extensions/<各フォルダ>/package.json の publisher.name) */
async function builtinExtensionIds(appRoot: string): Promise<string[]> {
  const dir = join(appRoot, 'extensions');
  const ids: string[] = [];
  for (const child of await listChildren(dir)) {
    if (!child.isDirectory()) continue;
    const pkg = (await readJson(join(dir, child.name, 'package.json'))) as { publisher?: unknown; name?: unknown } | undefined;
    if (typeof pkg?.publisher === 'string' && typeof pkg.name === 'string') {
      ids.push(`${pkg.publisher}.${pkg.name}`.toLowerCase());
    }
  }
  return ids;
}

/**
 * すべての一覧の id・読み込まれている拡張の id・同梱拡張の id。
 * complete が false のときは、一覧に無いからといってアンインストール済みとは言えない
 */
export async function collectKnownExtensionIds(env: EnvInfo): Promise<{ ids: Set<string>; complete: boolean }> {
  const { current, others, complete } = await readLists(env);
  const ids = new Set([
    ...[...current, ...others].map((e) => e.id),
    ...env.activeExtensionIds.map((id) => id.toLowerCase()),
    ...(await builtinExtensionIds(env.appRoot)),
  ]);
  return { ids, complete };
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
