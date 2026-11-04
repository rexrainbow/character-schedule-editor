import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const html = () => readFileSync(new URL('./index.html', import.meta.url), 'utf8')
  .replace('</head>', '  <link rel="stylesheet" href="./app.css" />\n  </head>')
  .replace('<script type="module" src="./main.js"></script>', '<script defer src="./app.js"></script>');

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)), base: './',
  plugins: [{ name: 'runtime-demo-classic-html', generateBundle() { this.emitFile({ type: 'asset', fileName: 'index.html', source: html() }); } }],
  build: {
    outDir: '../dist-runtime-demo', emptyOutDir: true, cssCodeSplit: false,
    lib: { entry: fileURLToPath(new URL('./main.js', import.meta.url)), name: 'CharacterScheduleRuntimeDemo', formats: ['iife'], fileName: () => 'app.js', cssFileName: 'app' },
  },
});
