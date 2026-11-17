import { GROUP_LABELS } from './labels';
import type { Entry, GroupId } from './types';

export interface Group {
  id: GroupId;
  label: string;
  entries: Entry[];
  /** 計算済みの分の合計 */
  total: number;
  /** 全件計算済みか */
  complete: boolean;
}

function compareEntries(a: Entry, b: Entry): number {
  if (a.size === undefined && b.size !== undefined) return 1;
  if (a.size !== undefined && b.size === undefined) return -1;
  if (a.size !== undefined && b.size !== undefined && a.size !== b.size) return b.size - a.size;
  return a.label.localeCompare(b.label);
}

export function buildGroups(entries: Entry[]): Group[] {
  const byGroup = new Map<GroupId, Entry[]>();
  for (const entry of entries) {
    const list = byGroup.get(entry.group) ?? [];
    list.push(entry);
    byGroup.set(entry.group, list);
  }
  const groups: Group[] = [];
  for (const [id, list] of byGroup) {
    const sorted = [...list].sort(compareEntries);
    groups.push({
      id,
      label: GROUP_LABELS[id],
      entries: sorted,
      total: sorted.reduce((sum, e) => sum + (e.size ?? 0), 0),
      complete: sorted.every((e) => e.size !== undefined),
    });
  }
  return groups.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export function grandTotal(groups: Group[]): { bytes: number; complete: boolean } {
  return {
    bytes: groups.reduce((sum, g) => sum + g.total, 0),
    complete: groups.every((g) => g.complete),
  };
}
