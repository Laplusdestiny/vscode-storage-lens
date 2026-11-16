import { join } from 'node:path';
import type { Entry, EnvInfo } from '../types';
import { collectKnownExtensionIds } from './extensions';
import { listChildren, makeEntry } from './util';

const BUILTIN_PREFIXES = ['vscode.', 'ms-vscode.'];
/** 拡張 ID の形(publisher.name)。VS Code 自身が置くフォルダ(emptyWindowChatSessions など)を除くため */
const EXTENSION_ID = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9._-]*$/;

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
      const orphan =
        known.complete &&
        EXTENSION_ID.test(id) &&
        !known.ids.has(id) &&
        !BUILTIN_PREFIXES.some((prefix) => id.startsWith(prefix));
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
