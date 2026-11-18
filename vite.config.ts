import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Uploads source maps to Sentry, so crash reports show real file names and lines, then deletes
    // them so they aren't published (Vercel won't serve .map files anyway). Only on builds that
    // have SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT set (Vercel); others skip it. Keep last.
    process.env.SENTRY_AUTH_TOKEN
      ? sentryVitePlugin({
          sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
          telemetry: false,
        })
      : [],
  ],
  build: {
    // Generated for the upload above, without the comment that points browsers at them.
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // Third-party code changes rarely, so keep it cacheable across deploys.
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
