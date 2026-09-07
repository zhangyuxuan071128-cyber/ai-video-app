import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const adminHtmlEntry = resolve(projectRoot, 'admin.html');
const adminSourceEntry = resolve(projectRoot, 'src/admin/main.tsx');
const adminEntryReady = existsSync(adminHtmlEntry) && existsSync(adminSourceEntry);
function rewriteAdminRoot(): Plugin {
  const rewrite = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    if (request.url?.startsWith('/control')) {
      next();
      return;
    }

    if (!adminEntryReady) {
      response.writeHead(503, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end('Admin UI entry is not available yet.');
      return;
    }

    if (request.url === '/' || request.url?.startsWith('/?')) {
      const query = request.url.slice(1);
      request.url = `/admin.html${query}`;
    }
    next();
  };

  return {
    name: 'stellar-admin-entry-rewrite',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig(({ mode }) => {
  const controlTarget = loadEnv(mode, '.', 'CONTROL_PROXY_').CONTROL_PROXY_TARGET
    || 'http://127.0.0.1:8788';
  const controlProxy = {
    '/control': {
      target: controlTarget,
      changeOrigin: false,
      rewrite: (path: string) => path.replace(/^\/control(?=\/|$)/, '/api/control/v1'),
    },
  };

  return {
    appType: 'mpa',
    plugins: [react(), rewriteAdminRoot()],
    server: {
      host: '0.0.0.0',
      port: 3001,
      strictPort: true,
      proxy: controlProxy,
    },
    preview: {
      host: '0.0.0.0',
      port: 3001,
      strictPort: true,
      proxy: controlProxy,
    },
    optimizeDeps: {
      entries: adminEntryReady ? [adminHtmlEntry] : [],
    },
    build: {
      target: 'es2022',
      outDir: 'dist/admin',
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: adminHtmlEntry,
      },
    },
  };
});
