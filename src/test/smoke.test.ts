import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Storage Lens smoke', () => {
  test('activates and registers commands', async () => {
    const ext = vscode.extensions.getExtension('laplusdestiny.vscode-storage-lens');
    assert.ok(ext, 'extension is installed');
    await ext.activate();
    const cmds = await vscode.commands.getCommands(true);
    for (const id of ['storageLens.refresh', 'storageLens.deleteSelected', 'storageLens.uninstall', 'storageLens.reveal']) {
      assert.ok(cmds.includes(id), id);
    }
    await vscode.commands.executeCommand('storageLens.refresh');
  });

  test('finds the real data folder and lists groups', async () => {
    const ext = vscode.extensions.getExtension<{ provider?: { getChildren(): { kind: string; group?: { id: string } }[] } }>(
      'laplusdestiny.vscode-storage-lens',
    )!;
    const api = await ext.activate();
    assert.ok(api.provider, 'data folder was found');
    await vscode.commands.executeCommand('storageLens.refresh');
    const top = api.provider.getChildren();
    const groups = top.flatMap((n) => (n.kind === 'group' && n.group ? [n.group.id] : []));
    console.log('groups:', groups.join(', '));
    assert.strictEqual(top[0].kind, 'total');
    assert.ok(groups.includes('logs'), 'logs group is listed');
  });
});
