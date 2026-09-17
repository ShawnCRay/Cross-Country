import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built site works from any path (GitHub Pages, a subfolder, or file://).
export default defineConfig({
  plugins: [react()],
  base: './',
});
