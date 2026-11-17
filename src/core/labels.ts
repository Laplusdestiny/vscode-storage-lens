import { DISABLED_MARKER_LABEL } from './policy';
import type { GroupId, Marker } from './types';

export const GROUP_LABELS: Record<GroupId, string> = {
  cache: 'キャッシュ',
  otherCache: 'その他のキャッシュ',
  workspaceStorage: 'ワークスペースの状態 ⚠',
  logs: 'ログ',
  history: 'ローカル履歴',
  oldServers: '古いサーバー本体',
  extensions: '拡張機能',
  extensionData: '拡張のデータ',
};

export const MARKER_LABELS: Record<Marker, string> = {
  disabled: DISABLED_MARKER_LABEL,
  otherProfile: '(他のプロファイルで使用)',
  obsolete: '(旧バージョン・次回起動時に VS Code が自動で掃除)',
  unlisted: '(未登録)',
  orphan: '(アンインストール済み)',
  missingSource: '(元フォルダなし)',
  inUse: '(使用中)',
  inUseUnknown: '(使用中か判定できません)',
};
