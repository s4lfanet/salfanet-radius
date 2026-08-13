import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import Teknisi from './Teknisi.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('teknisi-root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Teknisi />
    </ErrorBoundary>
  </React.StrictMode>,
)
