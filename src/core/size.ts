import type { Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Entry } from './types';

const IGNORABLE = new Set(['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'ELOOP', 'EBUSY']);

function isIgnorable(err: unknown): boolean {
  return typeof err === 'object' && err !== null && IGNORABLE.has((err as NodeJS.ErrnoException).code ?? '');
}

/**
 * ファイルならそのサイズ、フォルダなら中身の合計を返す。
 * lstat を使い、シンボリックリンクはたどらない(リンク自体のサイズを数える)。
 * 読めない・消えたエントリは 0 として扱う。signal が中断されたら signal.reason を throw する。
 */
export async function pathSize(p: string, signal?: AbortSignal): Promise<number> {
  signal?.throwIfAborted();
  let stat;
  try {
    stat = await lstat(p);
  } catch (err) {
    if (isIgnorable(err)) return 0;
    throw err;
  }
  if (!stat.isDirectory()) {
    return stat.size;
  }
  let children: Dirent[];
  try {
    children = await readdir(p, { withFileTypes: true });
  } catch (err) {
    if (isIgnorable(err)) return 0;
    throw err;
  }
  let total = 0;
  // フォルダは順番に、ファイルはまとめて lstat する(同時に開くファイル数を抑える)
  const files: string[] = [];
  for (const child of children) {
    const full = join(p, child.name);
    if (child.isDirectory()) {
      total += await pathSize(full, signal);
    } else {
      files.push(full);
    }
  }
  for (let i = 0; i < files.length; i += 64) {
    signal?.throwIfAborted();
    const sizes = await Promise.all(
      files.slice(i, i + 64).map(async (f) => {
        try {
          return (await lstat(f)).size;
        } catch (err) {
          if (isIgnorable(err)) return 0;
          throw err;
        }
      }),
    );
    for (const s of sizes) total += s;
  }
  return total;
}

export class SizeQueue {
  constructor(
    private readonly concurrency = 4,
    private readonly sizer: typeof pathSize = pathSize,
  ) {}

  /** 各 entry の size を設定してから onSized を呼ぶ。中断後は onSized を呼ばずに resolve する */
  async run(entries: Entry[], onSized: (e: Entry) => void, signal: AbortSignal): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (!signal.aborted && next < entries.length) {
        const e = entries[next++];
        let size: number;
        try {
          size = await this.sizer(e.path, signal);
        } catch {
          if (signal.aborted) return;
          size = 0;
        }
        if (signal.aborted) return;
        e.size = size;
        onSized(e);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, this.concurrency) }, worker));
  }
}
