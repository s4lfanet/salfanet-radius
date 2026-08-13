// ─── Auth Utilities ───────────────────────────────────────────────────────────

export const authHeader = () => ({
  'Authorization': `Bearer ${localStorage.getItem('token')}`
})

export const getToken = () => localStorage.getItem('token')

export const setToken = (token) => localStorage.setItem('token', token)

export const removeToken = () => localStorage.removeItem('token')

export const isLoggedIn = () => !!localStorage.getItem('token')
