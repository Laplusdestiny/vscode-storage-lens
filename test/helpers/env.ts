import { join } from 'node:path';
import type { EnvInfo } from '../../src/core/types';

/** 一時ルート直下の `data` をデータフォルダとする EnvInfo を作る */
export function envFor(root: string, overrides: Partial<EnvInfo> = {}): EnvInfo {
  const dataDir = join(root, 'data');
  return {
    platform: process.platform,
    isRemote: false,
    dataDir,
    userDir: join(dataDir, 'User'),
    appRoot: join(root, 'app'),
    activeExtensionIds: [],
    ...overrides,
  };
}
