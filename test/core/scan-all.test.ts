import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanAll } from '../../src/core/scan';
import { makeTree } from '../helpers/fixture';
import { envFor } from '../helpers/env';

describe('scanAll', () => {
  it('combines every scanner', async () => {
    const root = await makeTree({
      'data/Cache': null,
      'data/logs/20261116T100000': null,
      'data/User/History': null,
      'data/User/workspaceStorage/h1': null,
      'data/User/globalStorage/gone.ext': null,
      'ext/a.one-1.0.0': null,
    });
    const entries = await scanAll(envFor(root, { extensionsDir: join(root, 'ext') }));
    expect(new Set(entries.map((e) => e.group))).toEqual(
      new Set(['cache', 'logs', 'history', 'workspaceStorage', 'extensionData', 'extensions']),
    );
  });
});
