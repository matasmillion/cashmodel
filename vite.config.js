import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/cashmodel/',
  plugins: [react(), tailwindcss()],
  build: {
    // Emit source maps so production stack traces point at real files.
    sourcemap: true,
  },
})
