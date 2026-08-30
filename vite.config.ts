import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';
import pkg from './package.json';

let gitCommit = '7909b37';
try {
  gitCommit = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '4.5.3'),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    __BUILD_TIMESTAMP__: Date.now(),
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  build: {
    rollupOptions: {
      external: [
        'better-sqlite3',
        'bcryptjs',
        'express',
        'jsonwebtoken',
      ],
    },
  },
  optimizeDeps: {
    exclude: ['better-sqlite3', 'bcryptjs', 'express', 'jsonwebtoken'],
  },
}));
