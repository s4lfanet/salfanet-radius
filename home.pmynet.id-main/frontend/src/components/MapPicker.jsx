import { useEffect, useRef } from 'react'

const MapPicker = ({ lat, lng, onChange, compact = false, gpsOnly = false }) => {
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const idRef = useRef('map-' + Math.random().toString(36).substr(2, 9))
  const gpsOnlyRef = useRef(gpsOnly)
  const onChangeRef = useRef(onChange)

  // Selalu update ref ke nilai terbaru tanpa re-run effect
  useEffect(() => { gpsOnlyRef.current = gpsOnly }, [gpsOnly])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // Init map — hanya sekali
  useEffect(() => {
    const L = window.L
    if (!L || mapInstanceRef.current) return

    const defaultLat = lat || -6.835
    const defaultLng = lng || 107.607
    const map = L.map(idRef.current, { zoomControl: true }).setView([defaultLat, defaultLng], lat ? 16 : 13)
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map)

    const mkIcon = L.divIcon({
      html: '<div style="background:#3b82f6;width:22px;height:22px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>',
      className: '', iconSize: [22, 22], iconAnchor: [11, 11],
    })

    if (lat && lng) {
      markerRef.current = L.marker([lat, lng], { icon: mkIcon, draggable: false }).addTo(map)
    }

    // Click handler — selalu cek gpsOnlyRef.current saat event terjadi
    map.on('click', e => {
      if (gpsOnlyRef.current) return  // blokir klik peta untuk teknisi
      const rLat = parseFloat(e.latlng.lat.toFixed(7))
      const rLng = parseFloat(e.latlng.lng.toFixed(7))
      if (markerRef.current) {
        markerRef.current.setLatLng([rLat, rLng])
      } else {
        markerRef.current = L.marker([rLat, rLng], { icon: mkIcon, draggable: false }).addTo(map)
      }
      onChangeRef.current(rLat, rLng)
    })

    return () => { map.remove(); mapInstanceRef.current = null; markerRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update marker posisi saat lat/lng berubah (misal setelah GPS)
  useEffect(() => {
    const map = mapInstanceRef.current
    const L = window.L
    if (!map || !L) return
    if (lat && lng) {
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng])
      } else {
        const mkIcon = L.divIcon({
          html: '<div style="background:#3b82f6;width:22px;height:22px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>',
          className: '', iconSize: [22, 22], iconAnchor: [11, 11],
        })
        markerRef.current = L.marker([lat, lng], { icon: mkIcon, draggable: false }).addTo(map)
      }
      map.setView([lat, lng], Math.max(map.getZoom(), 16))
    } else if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
  }, [lat, lng])

  const useGPS = () => {
    if (!navigator.geolocation) return alert('GPS tidak didukung browser ini')
    navigator.geolocation.getCurrentPosition(
      p => {
        const gl = parseFloat(p.coords.latitude.toFixed(7))
        const gg = parseFloat(p.coords.longitude.toFixed(7))
        onChange(gl, gg)
        if (mapInstanceRef.current) mapInstanceRef.current.setView([gl, gg], 17)
      },
      () => alert('Gagal mendapatkan lokasi. Aktifkan izin GPS di browser.'),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
        <div id={idRef.current} style={{
          width: '100%', height: compact ? '200px' : '260px',
          border: '1px solid var(--border)',
          zIndex: 0, background: '#1e2030',
        }} />
        {/* Overlay untuk blokir semua touch/click saat gpsOnly */}
        {gpsOnly && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1000,
            cursor: 'not-allowed', background: 'transparent',
          }}
            onClick={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={useGPS} style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '5px 11px', borderRadius: '6px',
          border: '1px solid var(--primary)', background: 'transparent',
          color: 'var(--primary)', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 500
        }}>📍 Pakai GPS Saya</button>
        {lat && lng ? (
          <>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'monospace', flex: 1 }}>
              {lat.toFixed(6)}, {lng.toFixed(6)}
            </span>
            <button type="button" onClick={() => onChange(null, null)} style={{
              padding: '4px 8px', borderRadius: '6px',
              border: '1px solid #ef4444', background: 'transparent',
              color: '#ef4444', fontSize: '0.74rem', cursor: 'pointer'
            }}>✕ Hapus</button>
            <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #10b981', color: '#10b981', fontSize: '0.74rem', textDecoration: 'none' }}>
              Maps ↗
            </a>
          </>
        ) : (
          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            {gpsOnly ? 'Tekan tombol GPS untuk menandai lokasi' : 'Klik pada peta untuk menandai lokasi pelanggan'}
          </span>
        )}
      </div>
    </div>
  )
}

export default MapPicker
