import { useState } from 'react'

export function usePromises({ authHeader, showToast, requestConfirm, silentRefreshUsers }) {
  const [showPromiseModal, setShowPromiseModal] = useState(false)
  const [promiseTarget, setPromiseTarget] = useState(null)
  const [promiseDate, setPromiseDate] = useState('')
  const [promiseNotes, setPromiseNotes] = useState('')
  const [promiseLoading, setPromiseLoading] = useState(false)
  const [activePromises, setActivePromises] = useState({}) // { username: promise_obj }

  const openPromise = (user) => {
    setPromiseTarget(user)
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    setPromiseDate(tomorrow.toISOString().slice(0, 10))
    setPromiseNotes('')
    setShowPromiseModal(true)
  }

  const handleCreatePromise = async () => {
    if (!promiseTarget || !promiseDate) return
    setPromiseLoading(true)
    try {
      const r = await fetch(`/api/users/${promiseTarget.username}/promise`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ promise_date: promiseDate, notes: promiseNotes })
      })
      const data = await r.json()
      if (!r.ok) return showToast(data.error || 'Gagal membuat janji', 'error')
      showToast(data.message, 'success')
      setShowPromiseModal(false)
      setActivePromises(prev => ({ ...prev, [promiseTarget.username]: { promise_date: promiseDate, notes: promiseNotes, status: 'active' } }))
      silentRefreshUsers()
    } catch (err) { showToast(err.message, 'error') }
    finally { setPromiseLoading(false) }
  }

  const handleCancelPromise = (username) => {
    requestConfirm('Batalkan Janji Bayar', `Batalkan janji bayar ${username}? Pelanggan akan diisolir kembali.`, async () => {
      try {
        const r = await fetch(`/api/users/${username}/promise`, { method: 'DELETE', headers: authHeader() })
        const data = await r.json()
        if (!r.ok) return showToast(data.error || 'Gagal membatalkan janji', 'error')
        showToast(data.message, 'warning')
        setActivePromises(prev => { const n = { ...prev }; delete n[username]; return n })
        silentRefreshUsers()
      } catch (err) { showToast(err.message, 'error') }
    }, 'warning')
  }

  return {
    showPromiseModal, setShowPromiseModal,
    promiseTarget, setPromiseTarget,
    promiseDate, setPromiseDate,
    promiseNotes, setPromiseNotes,
    promiseLoading, setPromiseLoading,
    activePromises, setActivePromises,
    openPromise,
    handleCreatePromise,
    handleCancelPromise,
  }
}
