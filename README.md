# Storage Lens

VS Code が使ううちに溜め込むファイル(キャッシュ・拡張機能・ワークスペースの状態など)の容量を、サイドバーに大きい順で一覧し、消してよいものをその場で掃除する拡張機能です。

対象は「今開いている環境」だけです。ローカルで開いていれば手元の PC、SSH / WSL / Dev Container に接続中なら接続先を表示します。

<!-- スクリーンショット: media/screenshot.png を追加予定 -->

## できること

- 次のグループを、容量の大きい順に表示します。最上部に合計を出します。
  - **キャッシュ**: `Cache`, `CachedData`, `Code Cache`, `GPUCache`, `CachedExtensionVSIXs`
  - **その他のキャッシュ**: `Crashpad`, `Service Worker/CacheStorage`, `CachedProfilesData`
  - **ワークスペースの状態 ⚠**: `User/workspaceStorage` をフォルダごとに表示します。元のフォルダが無くなったものには「(元フォルダなし)」と出ます。
  - **ログ**: `logs` をセッションごとに表示します。
  - **ローカル履歴**: `User/History`(タイムラインの編集履歴)
  - **古いサーバー本体**: リモートのみ。今使っていない古いバージョンの VS Code Server
  - **拡張機能**: 拡張ごとの容量。無効になっている拡張には「(このウィンドウでは無効)」と出ます。
  - **拡張のデータ**: `User/globalStorage` を拡張ごとに表示します。アンインストール済みの拡張が残したデータには「(アンインストール済み)」と出て、削除できます。
- チェックを付けて「選んだものを削除」、または行ごとのボタンで削除できます。
- 拡張機能はフォルダを直接消さず、VS Code 標準のアンインストールを呼びます。終わったらリロードするか確認します。
- 「フォルダを開く」で OS のエクスプローラーを開きます。リモートでは、ターミナルに削除コマンドを入力した状態(未実行)で開きます。

## 削除の扱い

- 削除の前には必ず確認ダイアログが出ます。**ゴミ箱を使わず完全に削除**します(ディスクを空けるのが目的のため)。
- `Cache`, `CachedData`, `Code Cache`, `GPUCache` は VS Code 本体が使用中のため、その場では消しません。通知の「フォルダを開く」か「削除コマンドをコピー」を使い、**VS Code を完全に終了してから**削除してください。
- Windows で使用中のため消せなかったものも、同じ通知に出ます。
- 今開いているワークスペースの状態、今のセッションのログ、今使っているサーバー本体は削除できません。

## 表示しないもの

誤って消さないよう、次のものは一覧に出しません。

- `User/settings.json`, `keybindings.json`, `snippets`, `User/profiles`
- `Backups`(未保存の編集の控え)
- `User` フォルダそのもの、データフォルダそのもの、`~/.vscode-server` そのもの

## インストール

Marketplace には公開していません。`.vsix` を作って入れます。

```bash
npm ci
npm run package
code --install-extension vscode-storage-lens-0.1.0.vsix
```

### PR のビルドを試す

PR を作ったり更新したりすると、GitHub Actions(`.github/workflows/pr-vsix.yml`)が型チェック・テストのあと `.vsix` を作ります。
PR の Checks から「PR build (.vsix)」の実行を開き、Summary にあるリンクから `vscode-storage-lens-<版>-pr<番号>-<コミット>` (`.vsix` そのもの)をダウンロードし、上と同じ手順で入れてください(14 日間保存)。

### リモートで使う

この拡張は「ワークスペース側」で動くため、リモートでは接続先にも入れる必要があります。

1. リモート(SSH / WSL / Dev Container)に接続します。
2. 拡張機能ビューで Storage Lens を探し、「SSH: <ホスト名> にインストール」(WSL なら「WSL: … にインストール」)を押します。

## 開発

```bash
npm ci
npm test              # core のユニットテスト(vitest)
npm run typecheck
npm run build
xvfb-run -a npm run test:smoke   # VS Code 上の起動テスト(Linux では xvfb が必要)
```

設計書と実装計画は `docs/superpowers/` にあります。議論中の判断は `src/core/policy.ts` にまとめてあります。

## ライセンス

[MIT](./LICENSE)
