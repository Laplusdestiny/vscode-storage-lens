export type GroupId =
  | 'cache'
  | 'otherCache'
  | 'workspaceStorage'
  | 'logs'
  | 'history'
  | 'oldServers'
  | 'extensions'
  | 'extensionData';

export type Marker =
  | 'disabled'
  | 'otherProfile'
  | 'obsolete'
  | 'unlisted'
  | 'orphan'
  | 'missingSource'
  | 'inUse'
  | 'inUseUnknown';

export interface Entry {
  /** 絶対パス(一意キー) */
  id: string;
  group: GroupId;
  label: string;
  path: string;
  deletable: boolean;
  deferUntilClosed: boolean;
  /** 確認ダイアログで影響を説明する対象 */
  warn: boolean;
  markers: Marker[];
  /** アンインストール可能な拡張のみ(小文字) */
  extensionId?: string;
  /** undefined = 計算中 */
  size?: number;
}

export interface EnvInfo {
  platform: NodeJS.Platform;
  isRemote: boolean;
  dataDir: string;
  userDir: string;
  profileId?: string;
  extensionsDir?: string;
  currentWorkspaceStorageDir?: string;
  currentLogSessionDir?: string;
  appRoot: string;
  /** vscode.extensions.all の id(小文字、組み込み含む) */
  activeExtensionIds: string[];
}
