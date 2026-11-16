import { chmod, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SizeQueue, pathSize } from '../../src/core/size';
import type { Entry } from '../../src/core/types';
import { makeTree } from '../helpers/fixture';

const entry = (path: string): Entry => ({
  id: path,
  group: 'cache',
  label: path,
  path,
  deletable: true,
  deferUntilClosed: false,
  warn: false,
  markers: [],
});

const toRestore: string[] = [];
afterEach(async () => {
  for (const p of toRestore.splice(0)) await chmod(p, 0o755);
});

describe('pathSize', () => {
  it('sums nested files', async () => {
    const root = await makeTree({ 'a.txt': 'x'.repeat(10), 'd/b.txt': 'y'.repeat(20) });
    expect(await pathSize(root)).toBe(30);
  });

  it('returns file size for a file path', async () => {
    const root = await makeTree({ 'f.bin': 'z'.repeat(42) });
    expect(await pathSize(join(root, 'f.bin'))).toBe(42);
  });

  it('does not follow symlinks', async () => {
    const outside = await makeTree({ 'big.bin': 'b'.repeat(1000) });
    const root = await makeTree({ 'dir/small.txt': 's' });
    await symlink(join(outside, 'big.bin'), join(root, 'dir', 'link-to-big'));
    await symlink(outside, join(root, 'dir', 'link-to-outside-dir'));
    await symlink(root, join(root, 'dir', 'loop'));
    const size = await pathSize(root);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(1000);
  });

  it.skipIf(process.getuid?.() === 0)('skips unreadable entries', async () => {
    const root = await makeTree({ 'locked/secret.txt': 'x'.repeat(100), 'ok.txt': '12345' });
    await chmod(join(root, 'locked'), 0o000);
    toRestore.push(join(root, 'locked'));
    await expect(pathSize(root)).resolves.toBe(5);
  });

  it('missing path is 0', async () => {
    expect(await pathSize(join('/', 'definitely', 'not', 'here'))).toBe(0);
  });

  it('throws when aborted', async () => {
    const root = await makeTree({ 'a.txt': 'a' });
    const ac = new AbortController();
    ac.abort(new Error('stop'));
    await expect(pathSize(root, ac.signal)).rejects.toThrow('stop');
  });
});

describe('SizeQueue', () => {
  it('sets size and reports each entry', async () => {
    const root = await makeTree({ 'a/1': 'x', 'b/2': 'xx', 'c/3': 'xxx' });
    const entries = ['a', 'b', 'c'].map((n) => entry(join(root, n)));
    const reported: string[] = [];
    await new SizeQueue(2).run(entries, (e) => reported.push(e.id), new AbortController().signal);
    expect(reported).toHaveLength(3);
    expect(entries.map((e) => e.size)).toEqual([1, 2, 3]);
  });

  it('stops reporting after abort', async () => {
    const entries = ['a', 'b', 'c'].map((n) => entry(n));
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 20));
      return 7;
    };
    const ac = new AbortController();
    let calls = 0;
    const done = new SizeQueue(1, slow).run(
      entries,
      () => {
        calls++;
        ac.abort();
      },
      ac.signal,
    );
    await expect(done).resolves.toBeUndefined();
    expect(calls).toBe(1);
  });
});
