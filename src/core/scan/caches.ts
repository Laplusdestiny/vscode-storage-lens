import { join } from 'node:path';
import { DEFER_WHILE_RUNNING } from '../policy';
import type { Entry, EnvInfo } from '../types';
import { isDirectory, makeEntry } from './util';

const CACHE_DIRS = ['Cache', 'CachedData', 'Code Cache', 'GPUCache', 'CachedExtensionVSIXs'];
const OTHER_CACHE_DIRS = ['Crashpad', join('Service Worker', 'CacheStorage'), 'CachedProfilesData'];

/** キャッシュ・その他のキャッシュ・ローカル履歴 */
export async function scanCaches(env: EnvInfo): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (const name of CACHE_DIRS) {
    const p = join(env.dataDir, name);
    if (await isDirectory(p)) {
      entries.push(
        makeEntry('cache', p, name, { deletable: true, deferUntilClosed: DEFER_WHILE_RUNNING.includes(name) }),
      );
    }
  }
  for (const name of OTHER_CACHE_DIRS) {
    const p = join(env.dataDir, name);
    if (await isDirectory(p)) {
      entries.push(makeEntry('otherCache', p, name, { deletable: true }));
    }
  }
  const history = join(env.userDir, 'History');
  if (await isDirectory(history)) {
    entries.push(makeEntry('history', history, 'History', { deletable: true, warn: true }));
  }
  return entries;
}
