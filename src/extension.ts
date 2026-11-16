import * as vscode from 'vscode';
import { StorageTreeProvider, type Node } from './vscode/treeProvider';
import { collectEnv } from './vscode/env';

export const VIEW_ID = 'storageLens.view';

export function activate(context: vscode.ExtensionContext): { provider?: StorageTreeProvider } {
  const env = collectEnv(context);
  if (!env) {
    const view = vscode.window.createTreeView<Node>(VIEW_ID, {
      treeDataProvider: { getTreeItem: () => new vscode.TreeItem(''), getChildren: () => [] },
    });
    view.message = 'データフォルダが見つかりませんでした';
    context.subscriptions.push(view);
    return {};
  }

  const provider = new StorageTreeProvider(env);
  const view = vscode.window.createTreeView<Node>(VIEW_ID, {
    treeDataProvider: provider,
    manageCheckboxStateManually: true,
  });
  context.subscriptions.push(
    provider,
    view,
    view.onDidChangeCheckboxState((event) => {
      for (const [node, state] of event.items) {
        if (node.kind === 'entry') provider.setChecked(node.entry.id, state === vscode.TreeItemCheckboxState.Checked);
      }
    }),
    view.onDidChangeVisibility((event) => {
      if (event.visible && !provider.hasLoaded) void provider.refresh();
    }),
  );
  if (view.visible) void provider.refresh();
  return { provider };
}

export function deactivate(): void {}
