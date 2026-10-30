import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({ plugins: [react()], base: './', build: { rolldownOptions: { input: {
  editor: fileURLToPath(new URL('./index.html', import.meta.url)),
  runtimeDemo: fileURLToPath(new URL('./runtime-demo/index.html', import.meta.url)),
} } } });
