import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths so the build works from any sub-path — GitHub Pages serves
  // a project site from /<repo>/, and an absolute base would 404 every asset there.
  base: './',
  plugins: [react()],
  server: { port: 5273, open: false },
})
