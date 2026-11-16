import { dirname } from 'node:path';
import * as vscode from 'vscode';
import { buildConfirmMessage, buildDeleteCommand, deleteEntries, planDeletion } from '../core/delete';
import { formatBytes } from '../core/format';
import { DELETE_PERMANENTLY } from '../core/policy';
import type { Entry } from '../core/types';
import type { Node, StorageTreeProvider } from './treeProvider';

const OPEN_FOLDER = 'フォルダを開く';
const COPY_COMMAND = '削除コマンドをコピー';

function entryOf(node: unknown): Entry | undefined {
  const n = node as Node | undefined;
  return n?.kind === 'entry' ? n.entry : undefined;
}

async function trashRemove(p: string): Promise<void> {
  await vscode.workspace.fs.delete(vscode.Uri.file(p), { recursive: true, useTrash: true });
}

export function registerCommands(context: vscode.ExtensionContext, provider: StorageTreeProvider): void {
  const env = provider.env;

  const reveal = async (path: string) => {
    if (!env.isRemote) {
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path));
      return;
    }
    // リモートは OS のエクスプローラーで開けないので、ターミナルに削除コマンドを入力済み・未実行で用意する
    const terminal = vscode.window.createTerminal({ name: 'Storage Lens', cwd: dirname(path) });
    terminal.show();
    terminal.sendText(buildDeleteCommand([path], 'linux'), false);
  };

  const deleteTargets = async (candidates: Entry[]) => {
    const targets = candidates.filter((e) => e.deletable);
    if (targets.length === 0) {
      void vscode.window.showInformationMessage('削除できる項目が選ばれていません。');
      return;
    }
    const answer = await vscode.window.showWarningMessage(buildConfirmMessage(targets), { modal: true }, '削除');
    if (answer !== '削除') return;

    const { immediate, deferred } = planDeletion(targets);
    const result = await deleteEntries(immediate, env, DELETE_PERMANENTLY ? undefined : trashRemove);
    const closeLater = [...deferred, ...result.failed];

    if (closeLater.length > 0) {
      const size = formatBytes(closeLater.reduce((sum, e) => sum + (e.size ?? 0), 0));
      void vscode.window
        .showWarningMessage(
          `VS Code を閉じてから削除が必要なものが ${closeLater.length} 件あります(${size})。`,
          OPEN_FOLDER,
          COPY_COMMAND,
        )
        .then(async (choice) => {
          if (choice === OPEN_FOLDER) await reveal(closeLater[0].path);
          if (choice === COPY_COMMAND) {
            await vscode.env.clipboard.writeText(buildDeleteCommand(closeLater.map((e) => e.path), env.platform));
            void vscode.window.showInformationMessage('削除コマンドをコピーしました。VS Code を閉じてから実行してください。');
          }
        });
    }
    if (result.freedBytes > 0) {
      void vscode.window.showInformationMessage(`${formatBytes(result.freedBytes)} を空けました。`);
    }
    if (result.deleted.length > 0) await provider.refresh();
  };

  const uninstallTargets = async (candidates: Entry[]) => {
    const ids = [...new Set(candidates.flatMap((e) => (e.extensionId ? [e.extensionId] : [])))];
    if (ids.length === 0) {
      void vscode.window.showInformationMessage('アンインストールできる拡張機能が選ばれていません。');
      return;
    }
    const answer = await vscode.window.showWarningMessage(
      `${ids.length} 件の拡張機能をアンインストールします。\n${ids.join('\n')}`,
      { modal: true },
      'アンインストール',
    );
    if (answer !== 'アンインストール') return;

    let failed = 0;
    for (const id of ids) {
      try {
        await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', id);
      } catch {
        failed++;
      }
    }
    if (failed > 0) {
      void vscode.window.showErrorMessage(`${failed} 件の拡張機能をアンインストールできませんでした。`);
    }
    const reload = await vscode.window.showInformationMessage(
      'アンインストールしました。ウィンドウをリロードしますか?',
      'リロード',
    );
    if (reload === 'リロード') await vscode.commands.executeCommand('workbench.action.reloadWindow');
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('storageLens.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('storageLens.deleteSelected', () => deleteTargets(provider.getChecked())),
    vscode.commands.registerCommand('storageLens.uninstallSelected', () => uninstallTargets(provider.getChecked())),
    vscode.commands.registerCommand('storageLens.deleteEntry', (node: unknown) => {
      const entry = entryOf(node);
      return entry ? deleteTargets([entry]) : undefined;
    }),
    vscode.commands.registerCommand('storageLens.uninstall', (node: unknown) => {
      const entry = entryOf(node);
      return entry ? uninstallTargets([entry]) : undefined;
    }),
    vscode.commands.registerCommand('storageLens.reveal', (node: unknown) => {
      const entry = entryOf(node);
      return entry ? reveal(entry.path) : undefined;
    }),
    vscode.commands.registerCommand('storageLens.copyPath', async (node: unknown) => {
      const entry = entryOf(node);
      if (entry) await vscode.env.clipboard.writeText(entry.path);
    }),
  );
}
