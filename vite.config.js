import { defineConfig } from 'vite';

// Relative base so the build works from any path (GitHub Pages project sites live at /<repo>/)
export default defineConfig({
  base: './'
});
