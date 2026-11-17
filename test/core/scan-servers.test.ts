import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathsInUse, scanOldServers } from '../../src/core/scan/servers';
import { makeTree, writeFiles } from '../helpers/fixture';
import { envFor } from '../helpers/env';

async function serverHome() {
  const root = await makeTree({
    'home/bin/old1/node': 'n',
    'home/bin/cur/node': 'n',
    'home/cli/servers/Stable-old2/server/node': 'n',
    'home/cli/servers/lru.json': '[]',
    'home/code-old3': 'cli',
    'home/code-cur': 'cli',
    'home/data/User': null,
    'proc/1/cmdline': '/sbin/init\0',
  });
  const H = join(root, 'home');
  const env = envFor(root, {
    isRemote: true,
    dataDir: join(H, 'data'),
    userDir: join(H, 'data', 'User'),
    appRoot: join(H, 'bin', 'cur'),
  });
  return { root, H, env, proc: join(root, 'proc') };
}

describe('scanOldServers', () => {
  it('lists old servers except current', async () => {
    const { H, env, proc } = await serverHome();
    const entries = await scanOldServers(env, proc);
    expect(entries.map((e) => e.path).sort()).toEqual(
      [join(H, 'bin', 'old1'), join(H, 'cli', 'servers', 'Stable-old2'), join(H, 'code-old3')].sort(),
    );
    expect(entries.every((e) => e.group === 'oldServers' && e.deletable)).toBe(true);
  });

  it('marks in-use server', async () => {
    const { root, H, env, proc } = await serverHome();
    await writeFiles(root, { 'proc/123/cmdline': `${join(H, 'bin', 'old1', 'node')}\0--foo\0` });
    const entries = await scanOldServers(env, proc);
    const old1 = entries.find((e) => e.path === join(H, 'bin', 'old1'))!;
    expect(old1.deletable).toBe(false);
    expect(old1.markers).toContain('inUse');
    expect(entries.find((e) => e.path === join(H, 'code-old3'))!.deletable).toBe(true);
  });

  it('cannot tell usage without /proc', async () => {
    const { root, env } = await serverHome();
    const entries = await scanOldServers(env, join(root, 'no-proc'));
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => !e.deletable && e.markers.includes('inUseUnknown'))).toBe(true);
  });

  it('cannot tell usage on non-linux hosts', async () => {
    const { env, proc } = await serverHome();
    const entries = await scanOldServers({ ...env, platform: 'darwin' }, proc);
    expect(entries.every((e) => !e.deletable && e.markers.includes('inUseUnknown'))).toBe(true);
  });

  it('local window has no servers', async () => {
    const { env, proc } = await serverHome();
    expect(await scanOldServers({ ...env, isRemote: false }, proc)).toEqual([]);
  });

  it('unknown layout has no servers', async () => {
    const { env, proc } = await serverHome();
    expect(await scanOldServers({ ...env, appRoot: join('/', 'usr', 'share', 'code', 'resources', 'app') }, proc)).toEqual([]);
  });
});

describe('pathsInUse', () => {
  it('detects exe links and ignores unreadable pids', async () => {
    const root = await makeTree({ 'srv/a/node': 'n', 'srv/b': null, 'proc/7': null, 'proc/self-ish': null });
    await symlink(join(root, 'srv', 'a', 'node'), join(root, 'proc', '7', 'exe'));
    const used = await pathsInUse([join(root, 'srv', 'a'), join(root, 'srv', 'b')], join(root, 'proc'));
    expect([...(used ?? [])]).toEqual([join(root, 'srv', 'a')]);
  });
});
