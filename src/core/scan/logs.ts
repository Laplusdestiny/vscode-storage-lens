import { join } from 'node:path';
import { samePath } from '../paths';
import type { Entry, EnvInfo } from '../types';
import { listChildren, makeEntry } from './util';

export async function scanLogs(env: EnvInfo): Promise<Entry[]> {
  const logsDir = join(env.dataDir, 'logs');
  const entries: Entry[] = [];
  for (const child of await listChildren(logsDir)) {
    if (!child.isDirectory()) continue;
    const p = join(logsDir, child.name);
    const current = env.currentLogSessionDir !== undefined && samePath(p, env.currentLogSessionDir);
    entries.push(makeEntry('logs', p, child.name, { deletable: !current, markers: current ? ['inUse'] : [] }));
  }
  return entries;
}
