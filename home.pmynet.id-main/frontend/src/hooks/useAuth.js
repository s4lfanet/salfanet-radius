import { useState } from 'react'

export function useAuth(portalRole) {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    const token = localStorage.getItem('token')
    if (!token) return false
    if (portalRole) {
      try {
        const savedUser = JSON.parse(localStorage.getItem('user') || 'null')
        if (savedUser && savedUser.role !== portalRole) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          return false
        }
      } catch { return false }
    }
    return true
  })

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('user')
      if (!savedUser) return null
      const parsed = JSON.parse(savedUser)
      if (portalRole && parsed?.role !== portalRole) return null
      return parsed
    } catch { return null }
  })

  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [backendInfo, setBackendInfo] = useState({ version: '...', boot_id: '...' })

  const authHeader = () => ({ 'Authorization': `Bearer ${localStorage.getItem('token')}` })

  return {
    isLoggedIn, setIsLoggedIn,
    currentUser, setCurrentUser,
    loginForm, setLoginForm,
    backendInfo, setBackendInfo,
    authHeader,
  }
}
