import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * 一時ディレクトリにファイル構造を作る。
 * キー = 相対パス(`/` 区切り)、値 = ファイル内容。null なら空フォルダ。
 * 作成した一時ルートの絶対パスを返す。
 */
export async function makeTree(spec: Record<string, string | null>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'storage-lens-'));
  for (const [rel, content] of Object.entries(spec)) {
    const full = join(root, ...rel.split('/'));
    if (content === null) {
      await mkdir(full, { recursive: true });
    } else {
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content);
    }
  }
  return root;
}
