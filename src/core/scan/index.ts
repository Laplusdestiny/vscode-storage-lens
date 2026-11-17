import type { Entry, EnvInfo } from '../types';
import { scanCaches } from './caches';
import { scanExtensionData } from './extensionData';
import { scanExtensions } from './extensions';
import { scanLogs } from './logs';
import { scanOldServers } from './servers';
import { scanWorkspaceStorage } from './workspaceStorage';

export async function scanAll(env: EnvInfo): Promise<Entry[]> {
  const results = await Promise.all([
    scanCaches(env),
    scanWorkspaceStorage(env),
    scanLogs(env),
    scanExtensions(env),
    scanExtensionData(env),
    scanOldServers(env),
  ]);
  return results.flat();
}
