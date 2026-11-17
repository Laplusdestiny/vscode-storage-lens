import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findServerLayout, findUserDir, isInside } from '../../src/core/paths';

const D = join('/', 'home', 'u', '.config', 'Code');
const H = join('/', 'home', 'u', '.vscode-server');

describe('findUserDir', () => {
  it('finds data and user dirs from the default profile', () => {
    expect(findUserDir(join(D, 'User', 'globalStorage', 'laplusdestiny.vscode-storage-lens'))).toEqual({
      dataDir: D,
      userDir: join(D, 'User'),
      profileId: undefined,
    });
  });

  it('detects the profile id', () => {
    const r = findUserDir(join(D, 'User', 'profiles', '-6a1b', 'globalStorage', 'x.y'));
    expect(r?.profileId).toBe('-6a1b');
    expect(r?.dataDir).toBe(D);
    expect(r?.userDir).toBe(join(D, 'User'));
  });

  it('returns undefined without a User folder', () => {
    expect(findUserDir(join('/', 'no', 'user', 'here'))).toBeUndefined();
  });
});

describe('findServerLayout', () => {
  it('handles the bin layout', () => {
    expect(findServerLayout(join(H, 'bin', 'abc123'))).toEqual({
      serverHome: H,
      currentServerDir: join(H, 'bin', 'abc123'),
      commit: 'abc123',
    });
  });

  it('handles the cli Stable layout', () => {
    const r = findServerLayout(join(H, 'cli', 'servers', 'Stable-abc123', 'server'));
    expect(r).toEqual({ serverHome: H, currentServerDir: join(H, 'cli', 'servers', 'Stable-abc123'), commit: 'abc123' });
  });

  it('handles the cli Insiders layout', () => {
    expect(findServerLayout(join(H, 'cli', 'servers', 'Insiders-abc123', 'server'))?.commit).toBe('abc123');
  });

  it('returns undefined for a desktop install', () => {
    expect(findServerLayout(join('/', 'usr', 'share', 'code', 'resources', 'app'))).toBeUndefined();
  });
});

describe('isInside', () => {
  it('is strict about containment', () => {
    expect(isInside(join(D, 'User', 'x'), join(D, 'User'))).toBe(true);
    expect(isInside(join(D, 'User'), join(D, 'User'))).toBe(false);
    expect(isInside(join(D, 'UserX'), join(D, 'User'))).toBe(false);
  });
});
