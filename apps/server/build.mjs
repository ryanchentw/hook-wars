import { build } from 'esbuild';

// One file with the workspace packages and every dependency inside, so the image needs Node and nothing installed.
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  // ws reaches for these optional native add-ons with `require`; it runs without them.
  external: ['bufferutil', 'utf-8-validate'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
