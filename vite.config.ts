import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    /* heic2any is ~1.3MB raw / ~340KB gzipped and trips the default
     * 500KB warning. It is dynamically imported and only fetched when
     * someone actually uploads a HEIC, so it never touches the initial
     * load — the warning would be noise on every build. */
    chunkSizeWarningLimit: 1500,
  },
});
