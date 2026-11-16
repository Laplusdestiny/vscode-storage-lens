import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectKnownExtensionIds, readExtensionList, scanExtensions } from '../../src/core/scan/extensions';
import { scanExtensionData } from '../../src/core/scan/extensionData';
import { makeTree } from '../helpers/fixture';
import { envFor } from '../helpers/env';

const list = (...items: [string, string][]) =>
  JSON.stringify(items.map(([id, folder]) => ({ identifier: { id }, version: '1.0.0', relativeLocation: folder })));

async function setup(files: Record<string, string | null>) {
  const root = await makeTree(files);
  return { root, extensionsDir: join(root, 'ext') };
}

describe('readExtensionList', () => {
  it('reads relativeLocation and location.path, lowercasing ids', async () => {
    const root = await makeTree({
      'l.json': JSON.stringify([
        { identifier: { id: 'Pub.One' }, relativeLocation: 'pub.one-1.0.0' },
        { identifier: { id: 'pub.two' }, location: { path: '/x/ext/pub.two-2.0.0', scheme: 'file' } },
      ]),
    });
    expect(await readExtensionList(join(root, 'l.json'))).toEqual([
      { id: 'pub.one', folder: 'pub.one-1.0.0' },
      { id: 'pub.two', folder: 'pub.two-2.0.0' },
    ]);
  });
});

describe('scanExtensions', () => {
  it('marks disabled extensions', async () => {
    const { root, extensionsDir } = await setup({
      'ext/extensions.json': list(['a.one', 'a.one-1.0.0'], ['b.two', 'b.two-1.0.0']),
      'ext/a.one-1.0.0/package.json': '{}',
      'ext/b.two-1.0.0/package.json': '{}',
    });
    const entries = await scanExtensions(envFor(root, { extensionsDir, activeExtensionIds: ['a.one'] }));
    const a = entries.find((e) => e.label === 'a.one-1.0.0')!;
    const b = entries.find((e) => e.label === 'b.two-1.0.0')!;
    expect(a.markers).toEqual([]);
    expect(a.extensionId).toBe('a.one');
    expect(b.markers).toEqual(['disabled']);
    expect(b.extensionId).toBe('b.two');
    expect(entries.every((e) => !e.deletable)).toBe(true);
    expect(entries.map((e) => e.label)).not.toContain('extensions.json');
  });

  it('marks obsolete folders', async () => {
    const { root, extensionsDir } = await setup({
      'ext/extensions.json': list(['a.one', 'a.one-1.0.0']),
      'ext/.obsolete': JSON.stringify({ 'a.one-0.9.0': true }),
      'ext/a.one-1.0.0': null,
      'ext/a.one-0.9.0': null,
    });
    const entries = await scanExtensions(envFor(root, { extensionsDir, activeExtensionIds: ['a.one'] }));
    const old = entries.find((e) => e.label === 'a.one-0.9.0')!;
    expect(old.markers).toEqual(['obsolete']);
    expect(old.extensionId).toBeUndefined();
  });

  it('marks other-profile extensions', async () => {
    const { root, extensionsDir } = await setup({
      'ext/extensions.json': list(['a.one', 'a.one-1.0.0']),
      'ext/a.one-1.0.0': null,
      'ext/c.three-1.0.0': null,
      'data/User/profiles/p1/extensions.json': list(['c.three', 'c.three-1.0.0']),
    });
    const entries = await scanExtensions(envFor(root, { extensionsDir, activeExtensionIds: ['a.one'] }));
    const c = entries.find((e) => e.label === 'c.three-1.0.0')!;
    expect(c.markers).toEqual(['otherProfile']);
    expect(c.extensionId).toBeUndefined();
  });

  it('uses profile list when profileId is set', async () => {
    const { root, extensionsDir } = await setup({
      'ext/extensions.json': list(['a.one', 'a.one-1.0.0']),
      'ext/a.one-1.0.0': null,
      'ext/c.three-1.0.0': null,
      'data/User/profiles/p1/extensions.json': list(['c.three', 'c.three-1.0.0']),
    });
    const entries = await scanExtensions(
      envFor(root, { extensionsDir, profileId: 'p1', activeExtensionIds: ['c.three'] }),
    );
    expect(entries.find((e) => e.label === 'c.three-1.0.0')!.extensionId).toBe('c.three');
    expect(entries.find((e) => e.label === 'a.one-1.0.0')!.markers).toEqual(['otherProfile']);
  });

  it('tolerates malformed json', async () => {
    const { root, extensionsDir } = await setup({
      'ext/extensions.json': '[',
      'ext/.obsolete': '{',
      'ext/a.one-1.0.0': null,
    });
    const entries = await scanExtensions(envFor(root, { extensionsDir }));
    expect(entries).toHaveLength(1);
    expect(entries[0].markers).toEqual(['unlisted']);
  });

  it('returns nothing without an extensions dir', async () => {
    const root = await makeTree({});
    expect(await scanExtensions(envFor(root))).toEqual([]);
  });
});

describe('scanExtensionData', () => {
  it('orphan extension data is deletable', async () => {
    const { root, extensionsDir } = await setup({
      'ext/extensions.json': list(['a.one', 'a.one-1.0.0']),
      'ext/a.one-1.0.0': null,
      'data/User/globalStorage/gone.ext/x': 'x',
      'data/User/globalStorage/a.one/x': 'x',
      'data/User/globalStorage/vscode.git/x': 'x',
      'data/User/globalStorage/ms-vscode.cpptools/x': 'x',
      'data/User/globalStorage/state.vscdb': 'db',
    });
    const entries = await scanExtensionData(envFor(root, { extensionsDir, activeExtensionIds: ['a.one'] }));
    const byLabel = Object.fromEntries(entries.map((e) => [e.label, e]));
    expect(byLabel['gone.ext'].markers).toEqual(['orphan']);
    expect(byLabel['gone.ext'].deletable).toBe(true);
    expect(byLabel['a.one'].deletable).toBe(false);
    expect(byLabel['vscode.git'].deletable).toBe(false);
    expect(byLabel['ms-vscode.cpptools'].deletable).toBe(false);
    expect(byLabel['state.vscdb']).toBeUndefined();
  });

  it('profile globalStorage is labelled', async () => {
    const root = await makeTree({ 'data/User/profiles/p1/globalStorage/gone.ext/x': 'x' });
    const entries = await scanExtensionData(envFor(root));
    expect(entries).toHaveLength(1);
    expect(entries[0].label.endsWith(' [プロファイル p1]')).toBe(true);
    expect(entries[0].deletable).toBe(true);
  });

  it('known ids include every profile list', async () => {
    const { root, extensionsDir } = await setup({
      'ext/extensions.json': list(['a.one', 'a.one-1.0.0']),
      'data/User/profiles/p1/extensions.json': list(['c.three', 'c.three-1.0.0']),
    });
    const ids = await collectKnownExtensionIds(envFor(root, { extensionsDir, activeExtensionIds: ['vscode.git'] }));
    expect([...ids].sort()).toEqual(['a.one', 'c.three', 'vscode.git']);
  });
});
