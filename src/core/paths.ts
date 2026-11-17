import { basename, dirname, relative, isAbsolute, sep } from 'node:path';

export function findUserDir(
  globalStoragePath: string,
): { dataDir: string; userDir: string; profileId?: string } | undefined {
  let child: string | undefined;
  let grandChild: string | undefined;
  let current = globalStoragePath;
  while (true) {
    if (basename(current) === 'User') {
      const profileId = child !== undefined && basename(child) === 'profiles' && grandChild !== undefined
        ? basename(grandChild)
        : undefined;
      return { dataDir: dirname(current), userDir: current, profileId };
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    grandChild = child;
    child = current;
    current = parent;
  }
}

const CLI_SERVER_DIR = /^(?:Stable|Insiders|Exploration)-(.+)$/;

export function findServerLayout(
  appRoot: string,
): { serverHome: string; currentServerDir: string; commit: string } | undefined {
  // <home>/bin/<commit>
  const parent = dirname(appRoot);
  if (basename(parent) === 'bin') {
    return { serverHome: dirname(parent), currentServerDir: appRoot, commit: basename(appRoot) };
  }
  // <home>/cli/servers/Stable-<commit>/server
  if (basename(appRoot) === 'server') {
    const serverDir = parent;
    const servers = dirname(serverDir);
    const cli = dirname(servers);
    const match = CLI_SERVER_DIR.exec(basename(serverDir));
    if (match && basename(servers) === 'servers' && basename(cli) === 'cli') {
      return { serverHome: dirname(cli), currentServerDir: serverDir, commit: match[1] };
    }
  }
  return undefined;
}

/** child が parent の厳密に内側なら true(同一パスは false)。Windows では大文字小文字を無視する */
export function isInside(child: string, parent: string): boolean {
  const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const rel = relative(norm(parent), norm(child));
  return rel !== '' && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel);
}

/** a と b が同じパスなら true(Windows では大文字小文字を無視) */
export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p);
  return relative(norm(a), norm(b)) === '';
}
