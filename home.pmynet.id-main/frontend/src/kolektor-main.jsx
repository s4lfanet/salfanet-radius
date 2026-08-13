import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import Kolektor from './Kolektor.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('kolektor-root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Kolektor />
    </ErrorBoundary>
  </React.StrictMode>,
)
