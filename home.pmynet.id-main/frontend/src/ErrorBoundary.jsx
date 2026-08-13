import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('[ErrorBoundary] Caught error:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { error, info } = this.state
    const stack = info?.componentStack || ''
    const firstLine = stack.split('\n').filter(Boolean)[0] || ''

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0f172a', fontFamily: 'Inter, sans-serif', padding: '2rem'
      }}>
        <div style={{
          background: '#1e293b', border: '1px solid #334155', borderRadius: '16px',
          padding: '2rem', maxWidth: '560px', width: '100%', color: '#f1f5f9'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '2rem' }}>⚠️</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#f87171' }}>
                Terjadi Error pada Aplikasi
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                Silakan screenshot halaman ini dan laporkan ke developer.
              </p>
            </div>
          </div>

          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px', fontWeight: '600', letterSpacing: '0.05em' }}>
              ERROR MESSAGE
            </div>
            <div style={{ fontSize: '0.85rem', color: '#fca5a5', fontFamily: 'monospace', wordBreak: 'break-word' }}>
              {error?.message || String(error)}
            </div>
          </div>

          {firstLine && (
            <div style={{ background: '#0f172a', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px', fontWeight: '600', letterSpacing: '0.05em' }}>
                LOCATION
              </div>
              <div style={{ fontSize: '0.78rem', color: '#93c5fd', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                {firstLine.trim()}
              </div>
            </div>
          )}

          <button
            onClick={() => { this.setState({ hasError: false, error: null, info: null }); window.location.reload() }}
            style={{
              background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px',
              padding: '10px 20px', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', width: '100%'
            }}
          >
            🔄 Muat Ulang Halaman
          </button>
        </div>
      </div>
    )
  }
}
