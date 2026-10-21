import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cwd, env as processEnvironment } from 'node:process'
import { assertFrontendEnvironment } from './scripts/check-frontend-env.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, cwd(), 'VITE_')
  if (command === 'build') assertFrontendEnvironment({ ...processEnvironment, ...env })
  const apiUrl = env.VITE_API_URL || 'http://localhost:8000'

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      proxy: {
        '/uploads': apiUrl,
      },
    },
  }
})
