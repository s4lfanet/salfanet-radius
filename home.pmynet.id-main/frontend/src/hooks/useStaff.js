import { useState, useEffect } from 'react'

export function useStaff({ authHeader } = {}) {
  const [systemStaff, setSystemStaff] = useState([])
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
  const [currentStaff, setCurrentStaff] = useState(null)
  const [staffForm, setStaffForm] = useState({ username: '', password: '', role: 'technician', fullname: '' })
  const [tenantKode, setTenantKode] = useState(null)

  const fetchTenantKode = (tenantId) => {
    if (!authHeader) return
    const qs = tenantId ? `?tenant_id=${tenantId}` : ''
    fetch(`/api/tenant/kode${qs}`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.kode) setTenantKode(d.kode) })
      .catch(() => {})
  }

  // Fetch kode mitra saat pertama load
  useEffect(() => {
    fetchTenantKode(null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    systemStaff, setSystemStaff,
    isStaffModalOpen, setIsStaffModalOpen,
    currentStaff, setCurrentStaff,
    staffForm, setStaffForm,
    tenantKode,
    fetchTenantKode,
  }
}
