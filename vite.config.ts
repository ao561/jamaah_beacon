import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Third-party code changes rarely, so keep it cacheable across deploys.
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
