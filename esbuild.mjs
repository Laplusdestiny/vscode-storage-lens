import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const smoke = process.argv.includes('--smoke');

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
};

if (smoke) {
  await esbuild.build({
    ...options,
    entryPoints: ['src/test/smoke.test.ts'],
    outfile: 'out/test/smoke.test.js',
    sourcemap: false,
  });
} else if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
