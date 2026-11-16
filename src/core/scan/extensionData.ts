import { join } from 'node:path';
import type { Entry, EnvInfo } from '../types';
import { collectKnownExtensionIds } from './extensions';
import { listChildren, makeEntry } from './util';

const BUILTIN_PREFIXES = ['vscode.', 'ms-vscode.'];

export async function scanExtensionData(env: EnvInfo): Promise<Entry[]> {
  const known = await collectKnownExtensionIds(env);
  const roots: { dir: string; suffix: string }[] = [{ dir: join(env.userDir, 'globalStorage'), suffix: '' }];
  const profilesDir = join(env.userDir, 'profiles');
  for (const child of await listChildren(profilesDir)) {
    if (child.isDirectory()) {
      roots.push({ dir: join(profilesDir, child.name, 'globalStorage'), suffix: ` [プロファイル ${child.name}]` });
    }
  }

  const entries: Entry[] = [];
  for (const { dir, suffix } of roots) {
    for (const child of await listChildren(dir)) {
      if (!child.isDirectory()) continue;
      const id = child.name.toLowerCase();
      const orphan = !known.has(id) && !BUILTIN_PREFIXES.some((prefix) => id.startsWith(prefix));
      entries.push(
        makeEntry('extensionData', join(dir, child.name), child.name + suffix, {
          deletable: orphan,
          markers: orphan ? ['orphan'] : [],
        }),
      );
    }
  }
  return entries;
}
