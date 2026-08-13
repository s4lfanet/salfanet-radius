import { useState } from 'react'

export function useOntTasks({ authHeader, showToast, requestConfirm, fetchTechnicianList }) {
  const [ontTasks, setOntTasks] = useState([])
  const [showOntTaskModal, setShowOntTaskModal] = useState(false)
  const [adminOntTasks, setAdminOntTasks] = useState([])
  const [adminOntTasksLoading, setAdminOntTasksLoading] = useState(false)
  const [adminOntTasksFilter, setAdminOntTasksFilter] = useState('pending')
  const [ontTaskTarget, setOntTaskTarget] = useState(null) // user object
  const [ontTaskTechUsername, setOntTaskTechUsername] = useState('')
  const [ontTaskNotes, setOntTaskNotes] = useState('')
  const [ontTaskLoading, setOntTaskLoading] = useState(false)
  const [showOntCompleteModal, setShowOntCompleteModal] = useState(false)
  const [ontCompleteTarget, setOntCompleteTarget] = useState(null) // task object
  const [ontCompleteNotes, setOntCompleteNotes] = useState('')
  const [ontCompleteLoading, setOntCompleteLoading] = useState(false)
  const [rekapMonth, setRekapMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [rekapExpandedTech, setRekapExpandedTech] = useState(null)

  const fetchOntTasks = async () => {
    try {
      const res = await fetch('/api/ont-removal-tasks?status=pending', { headers: authHeader() })
      if (res.ok) setOntTasks(await res.json())
    } catch (_) {}
  }

  const fetchAdminOntTasks = async (status = adminOntTasksFilter) => {
    setAdminOntTasksLoading(true)
    try {
      const params = status && status !== 'all' ? `?status=${status}` : ''
      const res = await fetch(`/api/ont-removal-tasks${params}`, { headers: authHeader() })
      if (res.ok) setAdminOntTasks(await res.json())
    } catch (_) {}
    finally { setAdminOntTasksLoading(false) }
  }

  const openOntTaskModal = async (user) => {
    setOntTaskTarget(user)
    setOntTaskTechUsername('')
    setOntTaskNotes('')
    setShowOntTaskModal(true)
    await fetchTechnicianList()
  }

  const submitOntTask = async () => {
    if (!ontTaskTechUsername) return showToast('Pilih teknisi terlebih dahulu', 'warning')
    setOntTaskLoading(true)
    try {
      const res = await fetch('/api/ont-removal-tasks', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ontTaskTarget.username, technician_username: ontTaskTechUsername, notes: ontTaskNotes })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(data.message, 'success')
      setShowOntTaskModal(false)
    } catch (err) { showToast(err.message, 'error') }
    finally { setOntTaskLoading(false) }
  }

  const submitOntComplete = async () => {
    if (!ontCompleteTarget) return
    setOntCompleteLoading(true)
    try {
      const res = await fetch(`/api/ont-removal-tasks/${ontCompleteTarget.id}/complete`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: ontCompleteNotes })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(data.message, 'success')
      setShowOntCompleteModal(false)
      setOntCompleteTarget(null)
      setOntCompleteNotes('')
      fetchOntTasks()
    } catch (err) { showToast(err.message, 'error') }
    finally { setOntCompleteLoading(false) }
  }

  const cancelOntTask = async (id) => {
    requestConfirm('Batalkan Task', 'Batalkan task cabut ONT ini?', async () => {
      try {
        const res = await fetch(`/api/ont-removal-tasks/${id}`, { method: 'DELETE', headers: authHeader() })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        showToast('Task dibatalkan', 'success')
        fetchOntTasks()
      } catch (err) { showToast(err.message, 'error') }
    })
  }

  return {
    ontTasks, setOntTasks,
    showOntTaskModal, setShowOntTaskModal,
    adminOntTasks, setAdminOntTasks,
    adminOntTasksLoading, setAdminOntTasksLoading,
    adminOntTasksFilter, setAdminOntTasksFilter,
    ontTaskTarget, setOntTaskTarget,
    ontTaskTechUsername, setOntTaskTechUsername,
    ontTaskNotes, setOntTaskNotes,
    ontTaskLoading, setOntTaskLoading,
    showOntCompleteModal, setShowOntCompleteModal,
    ontCompleteTarget, setOntCompleteTarget,
    ontCompleteNotes, setOntCompleteNotes,
    ontCompleteLoading, setOntCompleteLoading,
    rekapMonth, setRekapMonth,
    rekapExpandedTech, setRekapExpandedTech,
    fetchOntTasks,
    fetchAdminOntTasks,
    openOntTaskModal,
    submitOntTask,
    submitOntComplete,
    cancelOntTask,
  }
}
