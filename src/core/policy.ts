// agent-council での議論待ちの判断をここに集約する。
// 値を変えるときは、このファイルだけを書き換えれば挙動が切り替わるようにしておくこと。

/** 論点1: agent-council 議論待ち。OS を問わず、VS Code 起動中は消さずに「閉じてから削除」に回すフォルダ */
export const DEFER_WHILE_RUNNING: readonly string[] = ['Cache', 'CachedData', 'Code Cache', 'GPUCache'];

/** 論点2: agent-council 議論待ち。true ならゴミ箱を使わず完全に削除する */
export const DELETE_PERMANENTLY = true;

/** 論点3: agent-council 議論待ち。true ならリモートの古いサーバー本体を /proc で使用中判定する */
export const CHECK_SERVER_IN_USE = true;

/** 論点4: agent-council 議論待ち。「インストール済みだが読み込まれていない」拡張の印 */
export const DISABLED_MARKER_LABEL = '(このウィンドウでは無効)';

/** 論点5: agent-council 議論待ち。他のウィンドウのワークスペース状態は判別せず、確認文で注意するだけ */
export const OTHER_WINDOW_WARNING = '他のウィンドウで開いているフォルダの状態も消えます。';
