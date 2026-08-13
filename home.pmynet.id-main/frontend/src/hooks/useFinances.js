import { useState } from 'react'

export function useFinances({ authHeader }) {
  const [financeInvoices, setFinanceInvoices] = useState([])
  const [financePeriod, setFinancePeriod] = useState(new Date().toISOString().substring(0, 7))
  const [financeRincianPage, setFinanceRincianPage] = useState(1)
  const [financeTrend, setFinanceTrend] = useState([])
  const [financeByDusun, setFinanceByDusun] = useState([])
  const [financeDiscounts, setFinanceDiscounts] = useState([])
  const [dusunPage, setDusunPage] = useState(1)

  const fetchFinances = async () => {
    try {
      const h = authHeader()
      const [invRes, trendRes, dusunRes, discRes] = await Promise.all([
        fetch(`/api/invoices?period=${financePeriod}&status=all`, { headers: h }),
        fetch('/api/finances/trend', { headers: h }),
        fetch(`/api/finances/by-dusun?period=${financePeriod}`, { headers: h }),
        fetch(`/api/finances/discounts?period=${financePeriod}`, { headers: h }),
      ])
      if (invRes.ok) setFinanceInvoices(await invRes.json())
      if (trendRes.ok) setFinanceTrend(await trendRes.json())
      if (dusunRes.ok) { setFinanceByDusun(await dusunRes.json()); setDusunPage(1) }
      if (discRes.ok) setFinanceDiscounts(await discRes.json())
    } catch (err) { console.error('Error fetching finances:', err) }
  }

  return {
    financeInvoices, setFinanceInvoices,
    financePeriod, setFinancePeriod,
    financeRincianPage, setFinanceRincianPage,
    financeTrend, setFinanceTrend,
    financeByDusun, setFinanceByDusun,
    financeDiscounts, setFinanceDiscounts,
    dusunPage, setDusunPage,
    fetchFinances,
  }
}
