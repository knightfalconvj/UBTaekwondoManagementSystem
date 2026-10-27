import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const redirect = new URLSearchParams(window.location.search).get('redirect')
if (redirect?.startsWith('/') && !redirect.startsWith('//')) {
  const redirectUrl = new URL(redirect, window.location.origin)
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
  const routePath = redirectUrl.pathname === '/' ? '' : redirectUrl.pathname
  window.history.replaceState(null, '', `${basePath}${routePath}${redirectUrl.search}${redirectUrl.hash}` || '/')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
