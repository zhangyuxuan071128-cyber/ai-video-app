import { configDefaults, defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
    plugins: [react()],
    server: {
      port: 4173,
      strictPort: true,
      proxy: controlProxy,
    },
    preview: {
      port: 4173,
      strictPort: true,
      proxy: controlProxy,
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) {
              return 'react-vendor';
            }
            if (id.includes('/node_modules/gsap/') || id.includes('/node_modules/@gsap/')) {
              return 'motion-vendor';
            }
            return undefined;
          }
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './tests/setup.ts',
      globals: true,
      exclude: [...configDefaults.exclude, 'tests/control-plane.test.mjs'],
    },
  };
});
