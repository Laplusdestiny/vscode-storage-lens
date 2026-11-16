import * as vscode from 'vscode';
import { formatBytes } from '../core/format';
import { MARKER_LABELS } from '../core/labels';
import { scanAll } from '../core/scan';
import { SizeQueue } from '../core/size';
import { buildGroups, grandTotal, type Group } from '../core/tree';
import type { Entry, EnvInfo } from '../core/types';

export type Node = { kind: 'total' } | { kind: 'group'; group: Group } | { kind: 'entry'; entry: Entry };

const CALCULATING = '計算中…';
const FIRE_INTERVAL_MS = 200;

export class StorageTreeProvider implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  private entries: Entry[] = [];
  private readonly checked = new Set<string>();
  private controller: AbortController | undefined;
  private fireTimer: NodeJS.Timeout | undefined;
  private loaded = false;

  constructor(readonly env: EnvInfo) {}

  get hasLoaded(): boolean {
    return this.loaded;
  }

  async refresh(): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loaded = true;

    const entries = await scanAll(this.env);
    if (controller.signal.aborted) return;
    this.entries = entries;
    const ids = new Set(entries.map((e) => e.id));
    for (const id of [...this.checked]) if (!ids.has(id)) this.checked.delete(id);
    this.fireNow();

    await new SizeQueue().run(entries, () => this.scheduleFire(), controller.signal);
    if (!controller.signal.aborted) this.fireNow();
  }

  setChecked(entryId: string, checked: boolean): void {
    if (checked) this.checked.add(entryId);
    else this.checked.delete(entryId);
  }

  getChecked(): Entry[] {
    return this.entries.filter((e) => this.checked.has(e.id));
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'total') {
      const total = grandTotal(buildGroups(this.entries));
      const item = new vscode.TreeItem(
        `合計 ${formatBytes(total.bytes)}${total.complete ? '' : ` (${CALCULATING})`}`,
        vscode.TreeItemCollapsibleState.None,
      );
      item.id = 'total';
      item.iconPath = new vscode.ThemeIcon('database');
      return item;
    }
    if (node.kind === 'group') {
      const { group } = node;
      const item = new vscode.TreeItem(group.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `group:${group.id}`;
      item.description = `${formatBytes(group.total)}${group.complete ? '' : ` (${CALCULATING})`}`;
      item.contextValue = 'group';
      return item;
    }
    const { entry } = node;
    const item = new vscode.TreeItem(entry.label, vscode.TreeItemCollapsibleState.None);
    item.id = entry.id;
    const size = entry.size === undefined ? CALCULATING : formatBytes(entry.size);
    item.description = [size, ...entry.markers.map((m) => MARKER_LABELS[m])].join(' ');
    item.tooltip = entry.markers.includes('otherProfile')
      ? `${entry.path}\nアンインストールしても容量は空きません`
      : entry.path;
    if (entry.deletable || entry.extensionId) {
      item.checkboxState = this.checked.has(entry.id)
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked;
    }
    item.contextValue = `entry${entry.deletable ? '.deletable' : ''}${entry.extensionId ? '.extension' : ''}`;
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      if (this.entries.length === 0) return [];
      return [{ kind: 'total' }, ...buildGroups(this.entries).map((group): Node => ({ kind: 'group', group }))];
    }
    if (node.kind === 'group') {
      return node.group.entries.map((entry): Node => ({ kind: 'entry', entry }));
    }
    return [];
  }

  dispose(): void {
    this.controller?.abort();
    if (this.fireTimer) clearTimeout(this.fireTimer);
    this.emitter.dispose();
  }

  private scheduleFire(): void {
    if (this.fireTimer) return;
    this.fireTimer = setTimeout(() => this.fireNow(), FIRE_INTERVAL_MS);
  }

  private fireNow(): void {
    if (this.fireTimer) {
      clearTimeout(this.fireTimer);
      this.fireTimer = undefined;
    }
    this.emitter.fire(undefined);
  }
}
