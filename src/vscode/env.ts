import { basename, dirname, join } from 'node:path';
import * as vscode from 'vscode';
import { findUserDir, samePath } from '../core/paths';
import type { EnvInfo } from '../core/types';

function findExtensionsDir(context: vscode.ExtensionContext): string | undefined {
  if (context.extensionMode === vscode.ExtensionMode.Production) {
    return dirname(context.extensionPath);
  }
  // 開発・テスト時は自分がリポジトリから読み込まれているので、他のインストール済み拡張から求める
  const other = vscode.extensions.all.find(
    (e) => e.id !== context.extension.id && !(e.packageJSON as { isBuiltin?: boolean }).isBuiltin && !e.extensionPath.startsWith(vscode.env.appRoot),
  );
  return other ? dirname(other.extensionPath) : undefined;
}

function findLogSessionDir(logPath: string, dataDir: string): string | undefined {
  const logsDir = join(dataDir, 'logs');
  let current = logPath;
  while (true) {
    const parent = dirname(current);
    if (samePath(parent, logsDir)) return current;
    if (parent === current || basename(parent) === '') return undefined;
    current = parent;
  }
}

export function collectEnv(context: vscode.ExtensionContext): EnvInfo | undefined {
  const found = findUserDir(context.globalStorageUri.fsPath);
  if (!found) return undefined;
  return {
    platform: process.platform,
    isRemote: vscode.env.remoteName !== undefined,
    dataDir: found.dataDir,
    userDir: found.userDir,
    profileId: found.profileId,
    extensionsDir: findExtensionsDir(context),
    currentWorkspaceStorageDir: context.storageUri ? dirname(context.storageUri.fsPath) : undefined,
    currentLogSessionDir: findLogSessionDir(context.logUri.fsPath, found.dataDir),
    appRoot: vscode.env.appRoot,
    activeExtensionIds: vscode.extensions.all.map((e) => e.id.toLowerCase()),
  };
}
