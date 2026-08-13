import { useState } from 'react'

export function useInstallLog({ authHeader }) {
  const [installLogMode, setInstallLogMode] = useState('day')   // 'day' | 'month'
  const [installLogDate, setInstallLogDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [installLogMonth, setInstallLogMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [installLogData, setInstallLogData] = useState([])
  const [installLogLoading, setInstallLogLoading] = useState(false)
  const [installLogPage, setInstallLogPage] = useState(1)

  const fetchInstallLog = async (mode, date, month) => {
    setInstallLogLoading(true)
    setInstallLogPage(1)
    try {
      const param = mode === 'day' ? `date=${date}` : `month=${month}`
      const res = await fetch(`/api/installations?${param}`, { headers: authHeader() })
      if (res.ok) setInstallLogData(await res.json())
    } catch (err) { console.error(err) }
    finally { setInstallLogLoading(false) }
  }

  return {
    installLogMode, setInstallLogMode,
    installLogDate, setInstallLogDate,
    installLogMonth, setInstallLogMonth,
    installLogData, setInstallLogData,
    installLogLoading, setInstallLogLoading,
    installLogPage, setInstallLogPage,
    fetchInstallLog,
  }
}
