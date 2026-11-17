# VS Code Storage Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 今開いている環境の VS Code のキャッシュ・拡張機能・ワークスペース状態などの容量をサイドバーのツリーに一覧し、消してよいものを削除、拡張をアンインストールしてリロードできる拡張機能を作る。

**Architecture:** `src/core/` は `vscode` を import しない純粋な Node モジュール(パス導出・走査・容量計算・並べ替え・削除計画)で、一時ディレクトリを使った vitest で検証する。`src/vscode/` は薄い接着層(環境情報の収集・TreeDataProvider・コマンド)。議論待ちの5つの判断は `src/core/policy.ts` に定数として集約する。

**Tech Stack:** TypeScript(strict)、Node 22、esbuild(バンドル)、vitest(core のテスト)、@vscode/test-cli + @vscode/test-electron(起動スモークテスト)、@vscode/vsce(.vsix 作成)。

**Spec:** `docs/superpowers/specs/2026-11-16-vscode-storage-lens-design.md`

## Global Constraints

- `package.json`: `name: "vscode-storage-lens"`, `displayName: "Storage Lens"`, `publisher: "laplusdestiny"`, `version: "0.1.0"`, `engines.vscode: "^1.85.0"`, `extensionKind: ["workspace"]`, `license: "MIT"`, `repository: https://github.com/Laplusdestiny/vscode-storage-lens`。
- `@types/vscode` は `~1.85.0`(engines を超えない)。実行時依存はゼロ(devDependencies のみ)。
- `src/core/**` は `vscode` を import しない。
- 画面の文言はすべて日本語。文言の定数は `src/core/labels.ts` と `src/core/policy.ts` に置く。
- OS ごとのパスを決め打ちしない。データフォルダは `context.globalStorageUri` から親をたどって `User` を見つけて求める(spec 5.1)。
- 削除は必ず確認ダイアログを経る。保護パス(spec 5.2「表示しないもの」と、今使っているワークスペースの状態・ログ・サーバー)は、どの経路でも削除しない。
- 削除はゴミ箱を使わない(`policy.DELETE_PERMANENTLY`)。
- 議論待ちの5点は `src/core/policy.ts` の定数だけで切り替えられるようにする(他ファイルに同じ値を書かない)。
- コミットは Conventional Commits。メッセージ末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **読めないファイル・フォルダ**(リモートの root 所有ファイル、`chmod 000`)を走査したとき → 例外にせずスキップし、残りの容量は出る。Task 3 のテスト `skips unreadable entries` で確認する。
2. **空白・`'`・日本語を含むパス**(`Code Cache`、Windows の日本語ユーザー名)→ コピーされる削除コマンドが正しくクォートされる。Task 7 のテスト `quotes paths with spaces, quotes and Japanese` で確認する。
3. **壊れた・存在しない JSON**(`extensions.json`、`workspace.json`、`.obsolete`)→ 走査は止まらず、印なしで一覧に出る。Task 4 と Task 5 の `tolerates malformed json` で確認する。
4. **容量計算中にもう一度「更新」を押した** → 古い計算は止まり、古い結果が新しいツリーに書き込まれない。Task 3 のテスト `stops reporting after abort` で確認する。
5. **シンボリックリンク**(開発中の拡張を extensions にリンク、リンクのループ)→ リンク先はたどらず、ループでも止まる。Task 3 のテスト `does not follow symlinks` で確認する。

---

## File Structure

```
package.json, tsconfig.json, esbuild.mjs, vitest.config.ts, .vscode-test.mjs, .vscodeignore
LICENSE (MIT), README.md, media/icon.svg
src/core/types.ts          Entry / Marker / GroupId / EnvInfo の型
src/core/policy.ts         議論待ちの5点(定数)
src/core/labels.ts         グループ名・印の日本語ラベル
src/core/format.ts         formatBytes
src/core/paths.ts          findUserDir / findServerLayout / isInside
src/core/size.ts           pathSize / SizeQueue
src/core/scan/caches.ts    キャッシュ・その他のキャッシュ・ローカル履歴
src/core/scan/workspaceStorage.ts
src/core/scan/logs.ts
src/core/scan/extensions.ts     拡張機能(+ 既知 ID の収集)
src/core/scan/extensionData.ts  拡張のデータ(globalStorage)
src/core/scan/servers.ts        古いサーバー本体 + /proc 使用中判定
src/core/scan/index.ts          scanAll
src/core/tree.ts           buildGroups / grandTotal
src/core/delete.ts         assertSafeToDelete / planDeletion / deleteEntries / buildDeleteCommand / buildConfirmMessage
src/vscode/env.ts          collectEnv(vscode API → EnvInfo)
src/vscode/treeProvider.ts StorageTreeProvider
src/vscode/commands.ts     コマンド登録
src/extension.ts           activate
test/core/*.test.ts        vitest
test/helpers/fixture.ts    一時ディレクトリにファイル構造を作るヘルパー
src/test/smoke.test.ts     VS Code 上の起動スモークテスト
```

---

### Task 1: プロジェクトの土台・型・方針定数・容量表記

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.mjs`, `vitest.config.ts`, `.gitignore` に `node_modules/`, `dist/`, `out/`, `*.vsix`, `.vscode-test/` を追記
- Create: `src/core/types.ts`, `src/core/policy.ts`, `src/core/labels.ts`, `src/core/format.ts`, `test/helpers/fixture.ts`
- Test: `test/core/format.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type GroupId = 'cache' | 'otherCache' | 'workspaceStorage' | 'logs' | 'history' | 'oldServers' | 'extensions' | 'extensionData';
  export type Marker = 'disabled' | 'otherProfile' | 'obsolete' | 'unlisted' | 'orphan' | 'missingSource' | 'inUse';
  export interface Entry {
    id: string;              // 絶対パス(一意キー)
    group: GroupId;
    label: string;
    path: string;
    deletable: boolean;
    deferUntilClosed: boolean;
    warn: boolean;           // 確認ダイアログで影響を説明する対象
    markers: Marker[];
    extensionId?: string;    // アンインストール可能な拡張のみ(小文字)
    size?: number;           // undefined = 計算中
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
    activeExtensionIds: string[];   // vscode.extensions.all の id(小文字、組み込み含む)
  }
  // policy.ts(各定数の上に「論点N: agent-council 議論待ち」とコメント)
  export const DEFER_WHILE_RUNNING: readonly string[] = ['Cache', 'CachedData', 'Code Cache', 'GPUCache']; // 論点1
  export const DELETE_PERMANENTLY = true;                                   // 論点2
  export const CHECK_SERVER_IN_USE = true;                                  // 論点3
  export const DISABLED_MARKER_LABEL = '(このウィンドウでは無効)';          // 論点4
  export const OTHER_WINDOW_WARNING = '他のウィンドウで開いているフォルダの状態も消えます。'; // 論点5
  // labels.ts
  export const GROUP_LABELS: Record<GroupId, string>;
  export const MARKER_LABELS: Record<Marker, string>;
  // format.ts
  export function formatBytes(n: number): string;
  // test/helpers/fixture.ts
  export async function makeTree(spec: Record<string, string | null>): Promise<string>; // キー=相対パス、値=ファイル内容 / null=空フォルダ。作成した一時ルートを返す
  ```
- `GROUP_LABELS`: cache `キャッシュ` / otherCache `その他のキャッシュ` / workspaceStorage `ワークスペースの状態 ⚠` / logs `ログ` / history `ローカル履歴` / oldServers `古いサーバー本体` / extensions `拡張機能` / extensionData `拡張のデータ`。
- `MARKER_LABELS`: disabled `DISABLED_MARKER_LABEL` / otherProfile `(他のプロファイルで使用)` / obsolete `(旧バージョン・次回起動時に VS Code が自動で掃除)` / unlisted `(未登録)` / orphan `(アンインストール済み)` / missingSource `(元フォルダなし)` / inUse `(使用中)`。

- [ ] **Step 1: 土台を作る**
  `package.json` に Global Constraints の値と scripts(`build`: `node esbuild.mjs`、`watch`、`test`: `vitest run`、`typecheck`: `tsc --noEmit`、`test:smoke`: `vscode-test`、`package`: `vsce package`)を入れる。`main` は `./dist/extension.js`。esbuild は `src/extension.ts` → `dist/extension.js`(cjs、platform node、external `vscode`)。devDependencies を `npm install -D` で入れる(バージョンはインストール時の最新、`@types/vscode` のみ `~1.85.0`)。
- [ ] **Step 2: 失敗するテストを書く** — `test/core/format.test.ts`
  ```ts
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(1023)).toBe('1023 B');
  expect(formatBytes(1536)).toBe('1.5 KB');
  expect(formatBytes(620 * 1024 ** 2)).toBe('620.0 MB');
  expect(formatBytes(8.2 * 1024 ** 3)).toBe('8.2 GB');
  ```
- [ ] **Step 3: 実行して失敗を確認** — `npx vitest run test/core/format.test.ts` → FAIL(未定義)
- [ ] **Step 4: `types.ts` / `policy.ts` / `labels.ts` / `format.ts` / `fixture.ts` を実装**(1024 進、B/KB/MB/GB/TB、KB 以上は小数1桁)
- [ ] **Step 5: 確認** — `npx vitest run` → PASS、`npm run typecheck` → エラーなし
- [ ] **Step 6: コミット** — `chore: scaffold extension project with core types and policy constants`

---

### Task 2: パスの導出

**Files:**
- Create: `src/core/paths.ts`
- Test: `test/core/paths.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function findUserDir(globalStoragePath: string): { dataDir: string; userDir: string; profileId?: string } | undefined;
  export function findServerLayout(appRoot: string): { serverHome: string; currentServerDir: string; commit: string } | undefined;
  export function isInside(child: string, parent: string): boolean; // 厳密に内側(同一パスは false)。Windows は大文字小文字を無視
  ```

- [ ] **Step 1: 失敗するテストを書く**(パスは `path.join` で組み立てる)
  - `findUserDir('<D>/User/globalStorage/laplusdestiny.vscode-storage-lens')` → `{ dataDir: '<D>', userDir: '<D>/User', profileId: undefined }`
  - `findUserDir('<D>/User/profiles/-6a1b/globalStorage/x.y')` → `profileId: '-6a1b'`、`dataDir: '<D>'`
  - `findUserDir('/no/user/here')` → `undefined`
  - `findServerLayout('<H>/bin/abc123')` → `{ serverHome: '<H>', currentServerDir: '<H>/bin/abc123', commit: 'abc123' }`
  - `findServerLayout('<H>/cli/servers/Stable-abc123/server')` → `currentServerDir: '<H>/cli/servers/Stable-abc123'`、`commit: 'abc123'`
  - `findServerLayout('<H>/cli/servers/Insiders-abc123/server')` → `commit: 'abc123'`
  - `findServerLayout('/usr/share/code/resources/app')` → `undefined`
  - `isInside('<D>/User/x', '<D>/User')` → true、`isInside('<D>/User', '<D>/User')` → false、`isInside('<D>/UserX', '<D>/User')` → false
- [ ] **Step 2: 失敗を確認** — `npx vitest run test/core/paths.test.ts` → FAIL
- [ ] **Step 3: 実装**(`findUserDir` は basename が `User` になるまで親へ。直下が `profiles` なら次の要素が profileId)
- [ ] **Step 4: 確認** — PASS
- [ ] **Step 5: コミット** — `feat(core): derive data, user and server directories`

---

### Task 3: 容量計算とキュー

**Files:**
- Create: `src/core/size.ts`
- Test: `test/core/size.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function pathSize(p: string, signal?: AbortSignal): Promise<number>; // ファイルならそのサイズ、フォルダなら再帰合計。lstat を使いリンクはたどらない(リンク自体のサイズを数える)。個々の EACCES/EPERM/ENOENT は 0 扱い。signal 中断時は signal.reason を throw
  export class SizeQueue {
    constructor(concurrency?: number /* 既定 4 */, sizer?: typeof pathSize);
    run(entries: Entry[], onSized: (e: Entry) => void, signal: AbortSignal): Promise<void>; // e.size を設定してから onSized。中断後は onSized を呼ばない
  }
  ```

- [ ] **Step 1: 失敗するテストを書く**
  - `sums nested files`: `a.txt`(10 バイト)+ `d/b.txt`(20 バイト)→ `30`
  - `returns file size for a file path`: 単体ファイル → その長さ
  - `does not follow symlinks`: 1000 バイトのファイルを外に置き、フォルダ内からリンク + 自分自身へのループリンク → 合計 < 1000、テストが終了する
  - `skips unreadable entries`: `locked/` を `chmod 000`(root で実行中なら `it.skipIf(process.getuid?.() === 0)`)、隣に 5 バイト → `5`、throw しない
  - `missing path is 0`: 存在しないパス → `0`
  - `SizeQueue sets size and reports each entry`: 3 件 → `onSized` が3回、全件 `size` が数値
  - `stops reporting after abort`: 遅延する fake sizer + 1件目の `onSized` で `abort()` → `onSized` 呼び出しは 1 回のみ、`run` は reject せず resolve
- [ ] **Step 2: 失敗を確認** — FAIL
- [ ] **Step 3: 実装**(フォルダは `readdir({ withFileTypes: true })` で並行度を抑えて再帰。キューは同時実行数 `concurrency`)
- [ ] **Step 4: 確認** — PASS
- [ ] **Step 5: コミット** — `feat(core): compute directory sizes with cancellation`

---

### Task 4: データフォルダの走査(キャッシュ・ワークスペースの状態・ログ・ローカル履歴)

**Files:**
- Create: `src/core/scan/caches.ts`, `src/core/scan/workspaceStorage.ts`, `src/core/scan/logs.ts`
- Test: `test/core/scan-datadir.test.ts`

**Interfaces:**
- Consumes: `EnvInfo`, `Entry`, `DEFER_WHILE_RUNNING`(Task 1)
- Produces:
  ```ts
  export async function scanCaches(env: EnvInfo): Promise<Entry[]>;          // group cache / otherCache / history
  export async function scanWorkspaceStorage(env: EnvInfo, exists?: (p: string) => Promise<boolean>): Promise<Entry[]>;
  export async function scanLogs(env: EnvInfo): Promise<Entry[]>;
  ```
- 対象と値:
  - cache: `dataDir` 直下の `Cache`, `CachedData`, `Code Cache`, `GPUCache`, `CachedExtensionVSIXs` のうち存在するフォルダ。`deletable: true`、`deferUntilClosed: DEFER_WHILE_RUNNING.includes(name)`。
  - otherCache: `Crashpad`, `Service Worker/CacheStorage`, `CachedProfilesData`。`deletable: true`、defer なし。
  - history: `User/History`。`deletable: true`、`warn: true`。
  - workspaceStorage: `User/workspaceStorage/*` のフォルダ1件ずつ。`warn: true`。`workspace.json` の `folder` か `workspace` の URI を読み、表示名はその basename、読めなければフォルダ名(ハッシュ)。存在確認は `file:` は `fileURLToPath`、`vscode-remote:` は `env.isRemote` のときだけ `decodeURIComponent(pathname)`、それ以外は確認しない。存在しなければ `missingSource`。`currentWorkspaceStorageDir` と一致するものは `deletable: false` + `inUse`。
  - logs: `dataDir/logs/*` のフォルダ1件ずつ。`currentLogSessionDir` と一致するものは `deletable: false` + `inUse`。
  - `Backups`、`User/settings.json` などは一切返さない。

- [ ] **Step 1: 失敗するテストを書く**(`makeTree` でデータフォルダを作る)
  - `lists existing cache dirs only`: `Cache`, `GPUCache`, `CachedExtensionVSIXs` のみ作成 → cache は3件。`Cache` と `GPUCache` は `deferUntilClosed: true`、`CachedExtensionVSIXs` は false
  - `never returns protected paths`: `Backups/`, `User/settings.json`, `User/snippets/` を作成 → どの scan 結果の `path` にも含まれない
  - `labels workspace storage from workspace.json`: `{"folder":"file:///<tmp>/proj"}` で `proj` が実在 → label `proj`、印なし。実在しない → `missingSource`
  - `protects current workspace storage`: `currentWorkspaceStorageDir` と同じもの → `deletable: false`, markers に `inUse`
  - `tolerates malformed json`: `workspace.json` が `{` → 例外にならず、label はハッシュ名
  - `protects current log session`: logs に2件、片方が current → current のみ `deletable: false`
  - `history is a warned entry`: `User/History` → group `history`、`warn: true`
- [ ] **Step 2: 失敗を確認** — FAIL
- [ ] **Step 3: 実装**
- [ ] **Step 4: 確認** — PASS
- [ ] **Step 5: コミット** — `feat(core): scan caches, workspace storage, logs and history`

---

### Task 5: 拡張機能と拡張のデータの走査

**Files:**
- Create: `src/core/scan/extensions.ts`, `src/core/scan/extensionData.ts`
- Test: `test/core/scan-extensions.test.ts`

**Interfaces:**
- Consumes: `EnvInfo`, `Entry`(Task 1)
- Produces:
  ```ts
  export interface ListedExtension { id: string; folder: string } // id は小文字
  export async function readExtensionList(file: string): Promise<ListedExtension[]>; // 無い・壊れている → []
  export async function collectKnownExtensionIds(env: EnvInfo): Promise<Set<string>>; // 全一覧の id ∪ activeExtensionIds
  export async function scanExtensions(env: EnvInfo): Promise<Entry[]>;
  export async function scanExtensionData(env: EnvInfo): Promise<Entry[]>;
  ```
- `extensions.json` の各要素: `identifier.id` と、`relativeLocation` があればそれ、なければ `location.path` の basename を `folder` にする。
- 一覧の場所: 今のプロファイル = `profileId` があれば `User/profiles/<profileId>/extensions.json`、なければ `<extensionsDir>/extensions.json`。他のプロファイル = それ以外の `User/profiles/*/extensions.json` と(プロファイル利用時は)既定の一覧。
- 拡張機能の印(`extensionsDir` 直下のフォルダごと、`.` 始まりとファイルは除外。上から順に最初に当てはまるもの):
  1. `.obsolete`(JSON オブジェクト、キー=フォルダ名)にある → `obsolete`、`extensionId` なし
  2. 今のプロファイルの一覧にある → `extensionId` を設定。`activeExtensionIds` に無ければ `disabled`
  3. 他のプロファイルの一覧にだけある → `otherProfile`、`extensionId` なし
  4. どこにも無い → `unlisted`、`extensionId` なし
  - すべて `deletable: false`。label はフォルダ名。
- 拡張のデータ: `User/globalStorage/*` と `User/profiles/*/globalStorage/*` のフォルダのみ(ファイルは除外)。名前を小文字にして `collectKnownExtensionIds` に無く、かつ `vscode.` と `ms-vscode.` で始まらない → `orphan` + `deletable: true`。それ以外は `deletable: false`。プロファイル配下のものは label に ` [プロファイル <id>]` を付ける。
- `extensionsDir` が undefined なら `scanExtensions` は `[]`。

- [ ] **Step 1: 失敗するテストを書く**
  - `marks disabled extensions`: 一覧に `a.one`, `b.two`、`activeExtensionIds: ['a.one']` → `b.two-1.0.0` は `disabled` + `extensionId: 'b.two'`、`a.one-1.0.0` は印なし + `extensionId: 'a.one'`
  - `marks obsolete folders`: `.obsolete` = `{"a.one-0.9.0": true}` → そのフォルダは `obsolete`、`extensionId` undefined
  - `marks other-profile extensions`: `profileId` なし、`User/profiles/p1/extensions.json` にだけ `c.three` → `otherProfile`
  - `uses profile list when profileId is set`: `profileId: 'p1'` → `p1` の一覧が「今のプロファイル」、既定の一覧にだけあるものは `otherProfile`
  - `tolerates malformed json`: `extensions.json` が `[` → 全フォルダ `unlisted`、throw しない
  - `orphan extension data is deletable`: globalStorage に `gone.ext/`, `a.one/`, `vscode.git/`, `state.vscdb`(ファイル)→ `gone.ext` のみ `orphan` + `deletable: true`。`a.one` と `vscode.git` は `deletable: false`。`state.vscdb` は出ない
  - `profile globalStorage is labelled`: `User/profiles/p1/globalStorage/gone.ext/` → label が ` [プロファイル p1]` で終わる
- [ ] **Step 2: 失敗を確認** — FAIL
- [ ] **Step 3: 実装**
- [ ] **Step 4: 確認** — PASS
- [ ] **Step 5: コミット** — `feat(core): scan extensions and extension data with markers`

---

### Task 6: 古いサーバー本体の走査

**Files:**
- Create: `src/core/scan/servers.ts`
- Test: `test/core/scan-servers.test.ts`

**Interfaces:**
- Consumes: `findServerLayout`, `isInside`(Task 2)、`CHECK_SERVER_IN_USE`(Task 1)
- Produces:
  ```ts
  export async function scanOldServers(env: EnvInfo, procRoot?: string /* 既定 '/proc' */): Promise<Entry[]>;
  export async function pathsInUse(candidates: string[], procRoot: string): Promise<Set<string>>;
  ```
- `env.isRemote` が false、または `findServerLayout(env.appRoot)` が undefined なら `[]`。
- 候補: `serverHome/bin/*`、`serverHome/cli/servers/*`(フォルダのみ)、`serverHome/code-*`(ファイル)。ただし `currentServerDir` と、名前に今の `commit` を含む `code-*` は除外(一覧に出さない)。
- 使用中判定(`CHECK_SERVER_IN_USE` が true のとき): `procRoot/<数字>/cmdline`(`\0` 区切り)の各要素と `procRoot/<数字>/exe` のリンク先のどれかが、候補と同じパスか候補の内側なら使用中。読めない pid は無視。使用中は `deletable: false` + `inUse`、それ以外は `deletable: true`。

- [ ] **Step 1: 失敗するテストを書く**(偽の `proc` フォルダを一時ディレクトリに作る)
  - `lists old servers except current`: `bin/old1`, `bin/cur`(appRoot)、`cli/servers/Stable-old2/`、`code-old3`、`code-cur` → `bin/old1`, `Stable-old2`, `code-old3` の3件
  - `marks in-use server`: `proc/123/cmdline` = `<H>/bin/old1/node\0--foo` → `bin/old1` は `deletable: false` + `inUse`
  - `local window has no servers`: `isRemote: false` → `[]`
  - `unknown layout has no servers`: appRoot が `/usr/share/code/resources/app` → `[]`
- [ ] **Step 2: 失敗を確認** — FAIL
- [ ] **Step 3: 実装**
- [ ] **Step 4: 確認** — PASS
- [ ] **Step 5: コミット** — `feat(core): list old remote server builds with in-use detection`

---

### Task 7: ツリーの組み立てと削除の中核

**Files:**
- Create: `src/core/scan/index.ts`, `src/core/tree.ts`, `src/core/delete.ts`
- Test: `test/core/tree.test.ts`, `test/core/delete.test.ts`

**Interfaces:**
- Consumes: Task 1〜6 のすべて
- Produces:
  ```ts
  // scan/index.ts
  export async function scanAll(env: EnvInfo): Promise<Entry[]>; // 各 scan を並行実行して連結
  // tree.ts
  export interface Group { id: GroupId; label: string; entries: Entry[]; total: number; complete: boolean }
  export function buildGroups(entries: Entry[]): Group[];
  export function grandTotal(groups: Group[]): { bytes: number; complete: boolean };
  // delete.ts
  export function assertSafeToDelete(p: string, env: EnvInfo): void; // 危険なら Error を throw
  export function planDeletion(entries: Entry[]): { immediate: Entry[]; deferred: Entry[]; skipped: Entry[] };
  export async function deleteEntries(entries: Entry[], env: EnvInfo, remove?: (p: string) => Promise<void>): Promise<{ deleted: Entry[]; failed: Entry[]; freedBytes: number }>;
  export function buildDeleteCommand(paths: string[], platform: NodeJS.Platform): string;
  export function buildConfirmMessage(entries: Entry[]): string;
  ```
- `buildGroups`: 空のグループは出さない。グループ内は `size` 降順(undefined は末尾、同じなら label 昇順)。`total` は分かっている分の合計、`complete` は全件計算済みか。グループ同士も `total` 降順。
- `assertSafeToDelete`: `p` が `dataDir` の厳密な内側、または(リモートで)`findServerLayout(appRoot).serverHome` の厳密な内側でなければ throw。次と同じ・その祖先・(Backups/settings 系は)その内側でも throw: `userDir`、`userDir/settings.json`、`userDir/keybindings.json`、`userDir/snippets`、`userDir/profiles`(祖先・同一のみ。内側の globalStorage は可)、`dataDir/Backups`、`currentWorkspaceStorageDir`、`currentLogSessionDir`、`currentServerDir`、`extensionsDir`。
- `planDeletion`: `deletable: false` → skipped、`deferUntilClosed` → deferred、残り → immediate。
- `deleteEntries`: 1件ずつ `assertSafeToDelete` → `remove`(既定 `fs.promises.rm(p, { recursive: true })`)。失敗(assert 含む)は failed。`freedBytes` は deleted の `size` 合計。
- `buildDeleteCommand`: win32 → `Remove-Item -Recurse -Force -LiteralPath 'p1', 'p2'`(`'` は `''` に)。それ以外 → `rm -rf -- 'p1' 'p2'`(`'` は `'\''` に)。
- `buildConfirmMessage`: 1行目 `<件数> 件(<formatBytes(合計)>)を完全に削除します。元に戻せません。`。workspaceStorage を含めば `ワークスペースの状態: 開いていたファイルなどの状態が消えます。` + `OTHER_WINDOW_WARNING`。history を含めば `ローカル履歴: タイムラインの編集履歴が消えます。`。deferred があれば `うち <n> 件は VS Code を閉じてから削除が必要です。`。

- [ ] **Step 1: 失敗するテストを書く**
  - tree: `sorts entries and groups by size`(cache: 10/30/undefined、logs: 100 → 先頭グループ logs、cache の並びは 30, 10, 未計算)、`incomplete total`(未計算を含む → `complete: false`)、`omits empty groups`
  - delete: `refuses protected paths`(`userDir`、`userDir/settings.json`、`dataDir/Backups/x`、`currentWorkspaceStorageDir`、`dataDir` 自体、`dataDir` の外 → すべて throw)、`allows orphan data under profiles`(`userDir/profiles/p1/globalStorage/gone.ext` → throw しない)、`plans deferred and skipped`、`collects failures`(`remove` が EBUSY を投げる → failed、`freedBytes` は成功分のみ)、`quotes paths with spaces, quotes and Japanese`(`C:\Users\山田\AppData\Roaming\Code\Code Cache` と `/home/o'neil/x` → 期待文字列と完全一致)、`confirm message mentions warnings`(workspaceStorage + history + deferred 1件 → 4種の文がすべて含まれる)
- [ ] **Step 2: 失敗を確認** — FAIL
- [ ] **Step 3: 実装**
- [ ] **Step 4: 確認** — `npx vitest run` 全体 → PASS
- [ ] **Step 5: コミット** — `feat(core): build tree groups and safe deletion core`

---

### Task 8: VS Code 接着層(環境収集・ツリー表示・起動)

**Files:**
- Create: `src/vscode/env.ts`, `src/vscode/treeProvider.ts`, `src/extension.ts`, `media/icon.svg`
- Modify: `package.json`(`contributes` と `activationEvents`)

**Interfaces:**
- Consumes: `findUserDir`, `scanAll`, `SizeQueue`, `buildGroups`, `grandTotal`, `formatBytes`, `GROUP_LABELS`, `MARKER_LABELS`
- Produces:
  ```ts
  // env.ts
  export function collectEnv(context: vscode.ExtensionContext): EnvInfo | undefined;
  // treeProvider.ts
  export type Node = { kind: 'total' } | { kind: 'group'; group: Group } | { kind: 'entry'; entry: Entry };
  export class StorageTreeProvider implements vscode.TreeDataProvider<Node> {
    constructor(env: EnvInfo);
    refresh(): Promise<void>;            // 前回の計算を abort → scanAll → SizeQueue。変更通知は 200ms 間隔にまとめる
    setChecked(entryId: string, checked: boolean): void;
    getChecked(): Entry[];
    readonly env: EnvInfo;
  }
  ```
- `collectEnv`:
  - `findUserDir(context.globalStorageUri.fsPath)` が undefined なら undefined を返す(ビューには「データフォルダが見つかりませんでした」と出す)。
  - `extensionsDir`: `extensionMode === Production` なら `dirname(context.extensionPath)`。それ以外は `vscode.extensions.all` から組み込みでも自分でもない最初の拡張の `extensionPath` の親。見つからなければ undefined。
  - `currentWorkspaceStorageDir` = `context.storageUri` の親。
  - `currentLogSessionDir` = `context.logUri.fsPath` から親をたどり、親が `dataDir/logs` になるフォルダ。
  - `isRemote` = `vscode.env.remoteName !== undefined`。`appRoot` = `vscode.env.appRoot`。`activeExtensionIds` = `vscode.extensions.all` の id(小文字)。
- ツリーの見た目:
  - 先頭は total ノード `合計 <formatBytes>`(未完了なら末尾に ` (計算中…)`)。
  - group ノードは label = `GROUP_LABELS`、description = 合計。初期状態は展開。
  - entry ノードは label、description = `<容量 or 計算中…> <印ラベルを空白区切り>`、tooltip = フルパス(`otherProfile` なら改行して `アンインストールしても容量は空きません`)。
  - `deletable` か `extensionId` を持つ entry に `checkboxState: Unchecked`。
  - `contextValue` = `entry` + (`deletable` なら `.deletable`)+ (`extensionId` なら `.extension`)。
- `package.json` の contributes:
  - `viewsContainers.activitybar`: `{ id: 'storageLens', title: 'Storage Lens', icon: 'media/icon.svg' }`
  - `views.storageLens`: `[{ id: 'storageLens.view', name: '容量' }]`
  - `createTreeView` は `manageCheckboxStateManually: true`、`onDidChangeCheckboxState` で `setChecked`。
  - 初回表示(`onDidChangeVisibility` で visible かつ未計算)で `refresh()`。

- [ ] **Step 1: 実装**
- [ ] **Step 2: 確認** — `npm run typecheck && npm run build` → エラーなし、`dist/extension.js` ができる。`npx vitest run` → PASS(core が壊れていない)
- [ ] **Step 3: コミット** — `feat: show storage tree in the activity bar`

---

### Task 9: コマンド(更新・削除・アンインストール・フォルダを開く・パスをコピー)

**Files:**
- Create: `src/vscode/commands.ts`
- Modify: `src/extension.ts`(登録)、`package.json`(`contributes.commands` と `menus`)

**Interfaces:**
- Consumes: `StorageTreeProvider`(Task 8)、`planDeletion`, `deleteEntries`, `buildConfirmMessage`, `buildDeleteCommand`, `DELETE_PERMANENTLY`
- Produces: `export function registerCommands(context: vscode.ExtensionContext, provider: StorageTreeProvider): void;`

| コマンド ID | タイトル | 置き場所 |
|---|---|---|
| `storageLens.refresh` | 更新 | `view/title` navigation、`$(refresh)` |
| `storageLens.deleteSelected` | 選んだものを削除 | `view/title` navigation、`$(trash)` |
| `storageLens.uninstallSelected` | 選んだ拡張をアンインストール | `view/title` の `...` メニュー |
| `storageLens.deleteEntry` | 削除 | `view/item/context` inline、`viewItem =~ /deletable/` |
| `storageLens.uninstall` | アンインストール | `view/item/context` inline、`viewItem =~ /extension/` |
| `storageLens.reveal` | フォルダを開く | `view/item/context` inline、`viewItem =~ /^entry/` |
| `storageLens.copyPath` | パスをコピー | `view/item/context`(右クリック)、`viewItem =~ /^entry/` |

- 削除(選択・1件共通):
  1. 対象 = `deletable` な entry。0 件なら `削除できる項目が選ばれていません。` と表示して終了。
  2. `showWarningMessage(buildConfirmMessage(対象), { modal: true }, '削除')`。`削除` 以外は終了。
  3. `planDeletion` → immediate を `deleteEntries` で削除。`remove` は `DELETE_PERMANENTLY` なら既定、false なら `vscode.workspace.fs.delete(uri, { recursive: true, useTrash: true })`。
  4. 閉じてから削除 = deferred + failed。1件以上なら `VS Code を閉じてから削除が必要なものが <n> 件あります(<合計>)。` をボタン `フォルダを開く` / `削除コマンドをコピー` 付きで表示。
  5. `freedBytes > 0` なら `<formatBytes> を空けました。` を表示し、`provider.refresh()`。
- フォルダを開く: ローカル(`!env.isRemote`)→ `revealFileInOS`(Uri.file(path))。リモート → `createTerminal({ cwd: dirname(path) })` を表示し、`sendText(buildDeleteCommand([path], 'linux'), false)`(未実行)。閉じてから削除の通知のボタンでは、先頭の項目に同じ処理を行う。
- 削除コマンドをコピー: `env.clipboard.writeText(buildDeleteCommand(paths, env.platform))`。
- アンインストール(選択・1件共通): 対象 = `extensionId` を持つ entry。`<n> 件の拡張機能をアンインストールします。` を modal で確認 → 1件ずつ `executeCommand('workbench.extensions.uninstallExtension', id)`。失敗は件数をまとめて通知。その後 `アンインストールしました。ウィンドウをリロードしますか?` を `リロード` ボタン付きで表示し、押されたら `workbench.action.reloadWindow`。

- [ ] **Step 1: 実装**
- [ ] **Step 2: 確認** — `npm run typecheck && npm run build` → エラーなし。`npx vitest run` → PASS
- [ ] **Step 3: コミット** — `feat: add delete, uninstall, reveal and copy commands`

---

### Task 10: 起動スモークテスト・README・.vsix

**Files:**
- Create: `.vscode-test.mjs`, `src/test/smoke.test.ts`, `.vscodeignore`, `README.md`, `LICENSE`
- Modify: `package.json`(`test:smoke` が smoke テストをビルドして実行するように)

**Interfaces:**
- Consumes: 拡張全体

- [ ] **Step 1: スモークテストを書く** — `src/test/smoke.test.ts`(mocha、`@vscode/test-cli` 形式)
  ```ts
  test('activates and registers commands', async () => {
    const ext = vscode.extensions.getExtension('laplusdestiny.vscode-storage-lens')!;
    await ext.activate();
    const cmds = await vscode.commands.getCommands(true);
    for (const id of ['storageLens.refresh', 'storageLens.deleteSelected', 'storageLens.uninstall', 'storageLens.reveal'])
      assert.ok(cmds.includes(id), id);
    await vscode.commands.executeCommand('storageLens.refresh'); // throw しない
  });
  ```
- [ ] **Step 2: 実行** — xvfb が無ければ `sudo apt-get install -y xvfb`。`xvfb-run -a npm run test:smoke` → `1 passing`。VS Code のダウンロードがネットワークで遮断された場合は、遮断された接続先を記録して「未実施(理由)」として報告し、先へ進む。
- [ ] **Step 3: README と LICENSE を書く**
  - README(日本語): できること、スクリーンショット枠、インストール(`npm ci && npm run package` → `code --install-extension vscode-storage-lens-0.1.0.vsix`)、リモートで使う手順(拡張機能画面で「SSH: <ホスト> にインストール」)、削除の扱い(閉じてから削除が必要なもの・完全削除であること)、表示しないもの。
  - LICENSE は MIT(著作者 Laplusdestiny)。`.vscodeignore` で `src/`, `test/`, `docs/`, `.claude/`, `apm*`, `node_modules/` を除外。
- [ ] **Step 4: パッケージ作成** — `npm run package` → `vscode-storage-lens-0.1.0.vsix` ができる。`npx vsce ls` の一覧に `dist/extension.js`, `media/icon.svg`, `README.md`, `LICENSE`, `package.json` があり、`src/` と `test/` が無い。
- [ ] **Step 5: 全体確認** — `npm run typecheck && npx vitest run && npm run build` → すべて成功
- [ ] **Step 6: コミット** — `chore: add smoke test, README and vsix packaging`

---

## 手元での手動確認(実装後にユーザーが行う)

Windows のローカルと SSH リモートのそれぞれで、次を確認する。
- ツリーにグループが容量順に出て、合計が表示される。
- `Cache` を選んで削除すると「閉じてから削除」の通知が出て、`フォルダを開く` でエクスプローラーが開く。
- 無効にした拡張に「(このウィンドウでは無効)」が出て、アンインストール後にリロードの確認が出る。
