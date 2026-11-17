import { describe, expect, it } from 'vitest';
import { buildGroups, grandTotal } from '../../src/core/tree';
import type { Entry, GroupId } from '../../src/core/types';

const e = (group: GroupId, label: string, size?: number): Entry => ({
  id: `/${group}/${label}`,
  group,
  label,
  path: `/${group}/${label}`,
  deletable: true,
  deferUntilClosed: false,
  warn: false,
  markers: [],
  size,
});

describe('buildGroups', () => {
  it('sorts entries and groups by size', () => {
    const groups = buildGroups([e('cache', 'a', 10), e('cache', 'b', 30), e('cache', 'c'), e('logs', 'l', 100)]);
    expect(groups.map((g) => g.id)).toEqual(['logs', 'cache']);
    expect(groups[1].entries.map((x) => x.label)).toEqual(['b', 'a', 'c']);
    expect(groups[1].label).toBe('キャッシュ');
    expect(groups[1].total).toBe(40);
  });

  it('breaks size ties by label', () => {
    const groups = buildGroups([e('cache', 'z', 5), e('cache', 'a', 5)]);
    expect(groups[0].entries.map((x) => x.label)).toEqual(['a', 'z']);
  });

  it('incomplete total', () => {
    const groups = buildGroups([e('cache', 'a', 10), e('cache', 'c')]);
    expect(groups[0].complete).toBe(false);
    expect(grandTotal(groups)).toEqual({ bytes: 10, complete: false });
    expect(grandTotal(buildGroups([e('cache', 'a', 10)]))).toEqual({ bytes: 10, complete: true });
  });

  it('omits empty groups', () => {
    expect(buildGroups([e('history', 'h', 1)]).map((g) => g.id)).toEqual(['history']);
  });
});
