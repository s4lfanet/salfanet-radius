import { useState, useRef, useEffect } from 'react'

export function useUI({ portalRole }) {
  // ── Theme ────────────────────────────────────────────────────────────
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const isFirstThemeApplyRef = useRef(true)
  const themeTransitionTimerRef = useRef(null)

  useEffect(() => {
    const theme = isDarkMode ? 'dark' : 'light'
    const root = document.documentElement
    const bodyEl = document.body
    if (!isFirstThemeApplyRef.current) {
      root.classList.add('theme-switching')
      bodyEl.classList.add('theme-switching')
    }
    localStorage.setItem('theme', theme)
    bodyEl.setAttribute('data-theme', theme)
    root.setAttribute('data-theme', theme)
    if (!isFirstThemeApplyRef.current) {
      if (themeTransitionTimerRef.current) window.clearTimeout(themeTransitionTimerRef.current)
      themeTransitionTimerRef.current = window.setTimeout(() => {
        root.classList.remove('theme-switching')
        bodyEl.classList.remove('theme-switching')
      }, 340)
    } else {
      isFirstThemeApplyRef.current = false
    }
  }, [isDarkMode])

  useEffect(() => {
    return () => {
      if (themeTransitionTimerRef.current) window.clearTimeout(themeTransitionTimerRef.current)
      document.documentElement.classList.remove('theme-switching')
      document.body.classList.remove('theme-switching')
    }
  }, [])

  // ── Hide Amounts ─────────────────────────────────────────────────────
  const [hideAmounts, setHideAmounts] = useState(() => localStorage.getItem('hideAmounts') === 'true')
  const toggleHideAmounts = () => setHideAmounts(prev => {
    const next = !prev
    localStorage.setItem('hideAmounts', next)
    return next
  })

  // ── PWA Install Prompt ───────────────────────────────────────────────
  const [pwaPrompt, setPwaPrompt] = useState(null)
  const [showPwaBanner, setShowPwaBanner] = useState(false)
  const [pwaInstalled, setPwaInstalled] = useState(false)

  useEffect(() => {
    if (!['technician', 'collector'].includes(portalRole)) return
    if (localStorage.getItem('pwa_banner_dismissed')) return
    const handler = (e) => {
      e.preventDefault()
      setPwaPrompt(e)
      setShowPwaBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      setPwaInstalled(true)
      setShowPwaBanner(false)
    })
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [portalRole])

  const handlePwaInstall = async () => {
    if (!pwaPrompt) return
    pwaPrompt.prompt()
    const { outcome } = await pwaPrompt.userChoice
    if (outcome === 'accepted') {
      setShowPwaBanner(false)
      setPwaInstalled(true)
    }
    setPwaPrompt(null)
  }

  // ── Loading ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [isSilentRefetching, setIsSilentRefetching] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // ── Toast ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 4000)
  }

  // ── Confirm Modal ────────────────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null, type: 'danger' })
  const requestConfirm = (title, message, onConfirm, type = 'danger') => {
    setConfirmModal({ show: true, title, message, onConfirm, type })
  }

  // ── Critical Modal (password-gated) ─────────────────────────────────
  const [criticalModal, setCriticalModal] = useState({ show: false, title: '', message: '', password: '', loading: false, error: '', onConfirm: null })
  const requestCritical = (title, message, onConfirm) => {
    setCriticalModal({ show: true, title, message, password: '', loading: false, error: '', onConfirm })
  }
  const submitCritical = async () => {
    const { password, onConfirm } = criticalModal
    if (!password.trim()) {
      setCriticalModal(m => ({ ...m, error: 'Password tidak boleh kosong' }))
      return
    }
    setCriticalModal(m => ({ ...m, loading: true, error: '' }))
    try {
      await onConfirm(password.trim())
      document.activeElement?.blur()
      setCriticalModal(m => ({ ...m, show: false, loading: false }))
    } catch (err) {
      const msg = err.message || 'Terjadi kesalahan'
      setCriticalModal(m => ({ ...m, loading: false, error: msg }))
    }
  }

  // ── Sidebar ──────────────────────────────────────────────────────────
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const w = window.innerWidth
    // Mobile (< 1024px): selalu expanded — abaikan localStorage agar icon-only tidak terjadi di HP
    if (w < 1024) return false
    // Desktop/tablet: hormati preferensi tersimpan
    const saved = localStorage.getItem('sidebarCollapsed')
    if (saved !== null) return saved === 'true'
    // Default: tablet (1024–1439px) = collapsed, desktop ≥ 1440px = expanded
    return w < 1440
  })
  const toggleSidebar = () => setSidebarCollapsed(v => {
    localStorage.setItem('sidebarCollapsed', String(!v))
    return !v
  })

  // ── User Menu Dropdowns ──────────────────────────────────────────────
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserMenu && !event.target.closest('.user-profile-dropdown')) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

  return {
    // Theme
    isDarkMode, setIsDarkMode,
    // Hide amounts
    hideAmounts, setHideAmounts, toggleHideAmounts,
    // PWA
    pwaPrompt, showPwaBanner, setPwaPrompt, setShowPwaBanner, pwaInstalled, setPwaInstalled, handlePwaInstall,
    // Loading
    loading, setLoading, isSilentRefetching, setIsSilentRefetching,
    submitError, setSubmitError,
    // Toast
    toast, setToast, showToast,
    // Confirm
    confirmModal, setConfirmModal, requestConfirm,
    // Critical
    criticalModal, setCriticalModal, requestCritical, submitCritical,
    // Sidebar
    mobileSidebarOpen, setMobileSidebarOpen, sidebarCollapsed, setSidebarCollapsed, toggleSidebar,
    // User menu
    showUserMenu, setShowUserMenu, showUserDropdown, setShowUserDropdown,
  }
}
