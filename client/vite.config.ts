import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const repoName = env.GITHUB_REPOSITORY?.split('/')[1] ?? 'UBTaekwondoManagementSystem'
  const isUserSiteRepo = repoName.toLowerCase().endsWith('.github.io')
  const base = env.VITE_BASE_PATH || (env.GITHUB_ACTIONS === 'true' && !isUserSiteRepo ? `/${repoName}/` : '/')

  return {
    plugins: [react()],
    base,
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  }
})
