import { useState, useEffect } from 'react'

export function useNotifications({ authHeader, currentUser }) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [notifPageFilter, setNotifPageFilter] = useState('all')
  const [notifPageSearch, setNotifPageSearch] = useState('')
  const [notifVisibleCount, setNotifVisibleCount] = useState(20)
  const [pendingProofsCount, setPendingProofsCount] = useState(0)

  // ── Helpers ──────────────────────────────────────────────────────────
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
  }

  const subscribePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    try {
      const keyRes = await fetch('/api/notifications/vapid-key')
      const { vapidPublicKey } = await keyRes.json()
      if (!vapidPublicKey) return
      const reg = await navigator.serviceWorker.ready
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        })
      }
      const subJson = sub.toJSON()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys })
      })
    } catch (err) {
      console.warn('[PUSH] Subscribe error:', err.message)
    }
  }

  // ── Fetch ─────────────────────────────────────────────────────────────
  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications', { headers: authHeader() })
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread || 0)
    } catch (_) {}

    try {
      const r2 = await fetch('/api/admin/payment-proofs/pending-count', { headers: authHeader() })
      if (r2.ok) {
        const d2 = await r2.json()
        setPendingProofsCount(d2.count || 0)
      }
    } catch (_) {}
  }

  // ── Mark read ─────────────────────────────────────────────────────────
  const markNotifRead = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
    fetch(`/api/notifications/${id}/read`, { method: 'POST', headers: authHeader() }).catch(() => {})
  }

  const markAllNotifRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    setUnreadCount(0)
    fetch('/api/notifications/read-all', { method: 'POST', headers: authHeader() }).catch(() => {})
  }

  // ── Polling effect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return
    if (!['admin', 'collector', 'technician', 'noc'].includes(currentUser.role)) return

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000)

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('[SW] Registered:', reg.scope)
        subscribePush()
      }).catch(err => console.warn('[SW] Registration failed:', err.message))
    }

    return () => clearInterval(interval)
  }, [currentUser?.username])

  return {
    notifications, setNotifications,
    unreadCount, setUnreadCount,
    showNotifPanel, setShowNotifPanel,
    notifPageFilter, setNotifPageFilter,
    notifPageSearch, setNotifPageSearch,
    notifVisibleCount, setNotifVisibleCount,
    pendingProofsCount, setPendingProofsCount,
    fetchNotifications,
    markNotifRead,
    markAllNotifRead,
  }
}
