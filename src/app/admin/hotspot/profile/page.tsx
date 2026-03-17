"use client"

import { useEffect, useState } from "react"
import { Plus, Loader2, Trash2, Edit, Ticket, RefreshCw } from "lucide-react"
import { useTranslation } from '@/hooks/useTranslation'
import { showSuccess, showError } from '@/lib/sweetalert'
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalSelect,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk'

interface HotspotProfile {
  id: string
  name: string
  costPrice: number
  resellerFee: number
  sellingPrice: number
  speed: string
  groupProfile: string | null
  sharedUsers: number
  validityValue: number
  validityUnit: string
  usageQuota: number | null
  usageDuration: number | null
  usageDurationUnit: string
  agentAccess: boolean
  eVoucherAccess: boolean
  isActive: boolean
}

export default function HotspotProfilePage() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<HotspotProfile[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<HotspotProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: "",
    costPrice: "",
    resellerFee: "0",
    speed: "",
    groupProfile: "salfanetradius",
    sharedUsers: "1",
    validityValue: "",
    validityUnit: "HOURS",
    usageQuota: "",
    usageQuotaUnit: "MB",
    usageDuration: "",
    usageDurationUnit: "HOURS",
    agentAccess: true,
    eVoucherAccess: true,
  })

  useEffect(() => {
    loadProfiles()
  }, [])

  const loadProfiles = async () => {
    try {
      const res = await fetch('/api/hotspot/profiles')
      const data = await res.json()
      setProfiles(data.profiles || [])
    } catch (error) {
      console.error('Load profiles error:', error)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      costPrice: "",
      resellerFee: "0",
      speed: "",
      groupProfile: "salfanetradius",
      sharedUsers: "1",
      validityValue: "",
      validityUnit: "HOURS",
      usageQuota: "",
      usageQuotaUnit: "MB",
      usageDuration: "",
      usageDurationUnit: "HOURS",
      agentAccess: true,
      eVoucherAccess: true,
    })
    setEditingProfile(null)
  }

  const handleEdit = (profile: HotspotProfile) => {
    setEditingProfile(profile)

    // Convert bytes to appropriate unit for display
    let quotaValue = ""
    let quotaUnit = "MB"
    if (profile.usageQuota) {
      const quotaInMB = Number(profile.usageQuota) / (1024 * 1024)
      if (quotaInMB >= 1024) {
        quotaValue = (quotaInMB / 1024).toString()
        quotaUnit = "GB"
      } else {
        quotaValue = quotaInMB.toString()
        quotaUnit = "MB"
      }
    }

    setFormData({
      name: profile.name,
      costPrice: profile.costPrice.toString(),
      resellerFee: profile.resellerFee.toString(),
      speed: profile.speed,
      groupProfile: profile.groupProfile || "",
      sharedUsers: profile.sharedUsers.toString(),
      validityValue: profile.validityValue.toString(),
      validityUnit: profile.validityUnit,
      usageQuota: quotaValue,
      usageQuotaUnit: quotaUnit,
      usageDurationUnit: profile.usageDurationUnit || "HOURS",
      usageDuration: profile.usageDuration?.toString() || "",
      agentAccess: profile.agentAccess,
      eVoucherAccess: profile.eVoucherAccess,
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      // Convert quota to bytes
      let usageQuotaBytes = null
      if (formData.usageQuota && parseFloat(formData.usageQuota) > 0) {
        const quotaValue = parseFloat(formData.usageQuota)
        if (formData.usageQuotaUnit === 'GB') {
          usageQuotaBytes = Math.floor(quotaValue * 1024 * 1024 * 1024)
        } else {
          usageQuotaBytes = Math.floor(quotaValue * 1024 * 1024)
        }
      }

      // Convert duration to number or null
      const usageDurationMinutes = formData.usageDuration && parseInt(formData.usageDuration) > 0
        ? parseInt(formData.usageDuration)
        : null

      const url = '/api/hotspot/profiles'
      const method = editingProfile ? 'PUT' : 'POST'
      const body = {
        ...(editingProfile ? { id: editingProfile.id } : {}),
        ...formData,
        usageQuota: usageQuotaBytes,
        usageDuration: usageDurationMinutes,
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setIsDialogOpen(false)
        resetForm()
        loadProfiles()
        await showSuccess(t('hotspot.profileSavedSuccess'))
      } else {
        const error = await res.json()
        await showError(t('hotspot.failedPrefix', { error: error.error }))
      }
    } catch (error) {
      await showError(t('hotspot.failedSaveProfile'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteProfileId) return
    try {
      const res = await fetch(`/api/hotspot/profiles?id=${deleteProfileId}`, { method: 'DELETE' })
      if (res.ok) {
        loadProfiles()
        await showSuccess(t('hotspot.profileDeletedSuccess'))
      } else {
        const error = await res.json()
        await showError(t('hotspot.failedPrefix', { error: error.error }))
      }
    } catch (error) {
      await showError(t('hotspot.failedDeleteProfile'))
    } finally {
      setDeleteProfileId(null)
    }
  }

  const formatValidity = (value: number, unit: string) => {
    const unitMap: Record<string, string> = {
      MINUTES: t('hotspot.minutes'),
      HOURS: t('hotspot.hours'),
      DAYS: t('hotspot.days'),
      MONTHS: t('hotspot.months'),
    }
    return `${value} ${unitMap[unit] || unit}`
  }

  const formatQuota = (bytes: number | null) => {
    if (!bytes) return '∞';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const formatDuration = (value: number | null, unit?: string) => {
    if (!value) return '∞';

    const unitMap: Record<string, string> = {
      MINUTES: 'menit',
      HOURS: 'jam',
      DAYS: 'hari',
      MONTHS: 'bulan',
    }

    return `${value} ${unitMap[unit || 'HOURS'] || 'jam'}`;
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount)

  const sellingPrice = parseFloat(formData.costPrice || '0') + parseFloat(formData.resellerFee || '0')

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <Loader2 className="w-12 h-12 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    )
  }

  return (
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <Ticket className="w-5 h-5 text-[#00f7ff]" />
              {t('hotspot.profiles')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('hotspot.profilesSubtitle')}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadProfiles}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-card border border-border rounded-md hover:bg-muted"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { resetForm(); setIsDialogOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-white rounded-md hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('hotspot.addProfile')}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="bg-card p-2.5 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase">{t('common.total')}</div>
                <div className="text-lg font-bold text-foreground">{profiles.length}</div>
              </div>
              <Ticket className="w-4 h-4 text-info" />
            </div>
          </div>
          <div className="bg-card p-2.5 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase">{t('common.active')}</div>
                <div className="text-lg font-bold text-success">{profiles.filter(p => p.isActive).length}</div>
              </div>
              <Ticket className="w-4 h-4 text-success" />
            </div>
          </div>
          <div className="bg-card p-2.5 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.avgPrice')}</div>
                <div className="text-sm font-bold text-primary">
                  {profiles.length > 0 ? formatCurrency(profiles.reduce((sum, p) => sum + p.sellingPrice, 0) / profiles.length) : 'Rp 0'}
                </div>
              </div>
              <Ticket className="w-4 h-4 text-primary" />
            </div>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {profiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">{t('hotspot.noProfiles')}</div>
          ) : (
            profiles.map((profile) => (
              <div key={profile.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium text-sm text-foreground">{profile.name}</div>
                    {profile.groupProfile && (
                      <div className="text-[10px] text-muted-foreground">({profile.groupProfile})</div>
                    )}
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${profile.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {profile.isActive ? t('common.active') : t('common.inactive')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t('hotspot.speed')}</div>
                    <div className="font-mono text-xs">{profile.speed}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t('hotspot.validity')}</div>
                    <div>{formatValidity(profile.validityValue, profile.validityUnit)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Kuota</div>
                    <div>{formatQuota(profile.usageQuota)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Durasi</div>
                    <div>{formatDuration(profile.usageDuration, profile.usageDurationUnit)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t('hotspot.costPrice')}</div>
                    <div>{formatCurrency(profile.costPrice)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t('hotspot.sellingPrice')}</div>
                    <div className="font-medium text-success">{formatCurrency(profile.sellingPrice)}</div>
                  </div>
                </div>
                <div className="flex justify-end gap-1 border-t border-border pt-2">
                  <button onClick={() => handleEdit(profile)} className="p-2 text-muted-foreground hover:bg-muted rounded" title="Edit">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteProfileId(profile.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Table - Desktop */}
        <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.profile')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.speed')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.validity')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">Kuota</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">Durasi</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden sm:table-cell">{t('hotspot.costPrice')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.sellingPrice')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('common.status')}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {profiles.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground text-xs">
                      {t('hotspot.noProfiles')}
                    </td>
                  </tr>
                ) : (
                  profiles.map((profile) => (
                    <tr key={profile.id} className="hover:bg-muted">
                      <td className="px-3 py-2">
                        <span className="font-medium text-xs text-foreground">{profile.name}</span>
                        {profile.groupProfile && (
                          <span className="ml-1 text-[9px] text-muted-foreground">({profile.groupProfile})</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{profile.speed}</td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground">{formatValidity(profile.validityValue, profile.validityUnit)}</td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground hidden md:table-cell">{formatQuota(profile.usageQuota)}</td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground hidden md:table-cell">{formatDuration(profile.usageDuration, profile.usageDurationUnit)}</td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground hidden sm:table-cell">{formatCurrency(profile.costPrice)}</td>
                      <td className="px-3 py-2 text-xs font-medium text-success">{formatCurrency(profile.sellingPrice)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${profile.isActive
                            ? 'bg-success/10 text-success'
                            : 'bg-muted text-muted-foreground'
                          }`}>
                          {profile.isActive ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => handleEdit(profile)}
                            className="p-1 text-muted-foreground hover:bg-muted rounded"
                            title="Edit"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteProfileId(profile.id)}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add/Edit Dialog */}
        <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); resetForm(); }} size="xl">
          <ModalHeader>
            <ModalTitle>{editingProfile ? t('hotspot.editProfile') : t('hotspot.addProfile')}</ModalTitle>
            <ModalDescription>{editingProfile ? t('common.update') : t('common.create')}</ModalDescription>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Kolom Kiri */}
                <div className="space-y-3">
                  <div>
                    <ModalLabel required>{t('common.name')}</ModalLabel>
                    <ModalInput value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., 3Jam-5M" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <ModalLabel required>{t('hotspot.costPrice')}</ModalLabel>
                      <ModalInput type="number" min={0} value={formData.costPrice} onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })} placeholder="0" required />
                    </div>
                    <div>
                      <ModalLabel>{t('hotspot.resellerFee')}</ModalLabel>
                      <ModalInput type="number" min={0} value={formData.resellerFee} onChange={(e) => setFormData({ ...formData, resellerFee: e.target.value })} placeholder="0" />
                    </div>
                  </div>
                  <div className="bg-[#00ff88]/10 p-2 rounded-lg border border-[#00ff88]/30">
                    <div className="text-[10px] text-muted-foreground">{t('hotspot.sellingPrice')}</div>
                    <div className="text-base font-bold text-[#00ff88] drop-shadow-[0_0_10px_rgba(0,255,136,0.5)]">{formatCurrency(sellingPrice)}</div>
                  </div>
                  <div>
                    <ModalLabel>{t('hotspot.groupProfile')}</ModalLabel>
                    <ModalInput value={formData.groupProfile} onChange={(e) => setFormData({ ...formData, groupProfile: e.target.value })} placeholder={t('common.optional')} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <ModalLabel required>{t('hotspot.sharedUsers')}</ModalLabel>
                      <ModalInput type="number" min={1} value={formData.sharedUsers} onChange={(e) => setFormData({ ...formData, sharedUsers: e.target.value })} required />
                    </div>
                    <div>
                      <ModalLabel required>{t('hotspot.activePeriod')}</ModalLabel>
                      <ModalInput type="number" min={1} value={formData.validityValue} onChange={(e) => setFormData({ ...formData, validityValue: e.target.value })} required />
                    </div>
                    <div>
                      <ModalLabel>{t('common.type')}</ModalLabel>
                      <ModalSelect value={formData.validityUnit} onChange={(e) => setFormData({ ...formData, validityUnit: e.target.value })}>
                        <option value="MINUTES" className="bg-[#0a0520]">{t('hotspot.minutes')}</option>
                        <option value="HOURS" className="bg-[#0a0520]">{t('hotspot.hours')}</option>
                        <option value="DAYS" className="bg-[#0a0520]">{t('hotspot.days')}</option>
                        <option value="MONTHS" className="bg-[#0a0520]">{t('hotspot.months')}</option>
                      </ModalSelect>
                    </div>
                  </div>
                </div>
                {/* Kolom Kanan */}
                <div className="space-y-3">
                  <div>
                    <ModalLabel required>{t('hotspot.rateLimitMikrotik')}</ModalLabel>
                    <ModalInput value={formData.speed} onChange={(e) => setFormData({ ...formData, speed: e.target.value })} placeholder="1M/1500k 0/0 0/0 8 0/0" required className="font-mono" />
                    <p className="text-[9px] text-muted-foreground mt-1">Format: rx-rate[/tx-rate] [rx-burst-rate[/tx-burst-rate]]</p>
                    <p className="text-[9px] text-[#00f7ff] mt-0.5">Contoh: 1M/1500k 0/0 0/0 8 0/0 atau 5M/5M (simple)</p>
                  </div>
                  <div className="border border-[#00f7ff]/30 rounded-lg p-3 bg-[#00f7ff]/5">
                    <div className="text-[10px] font-medium text-[#00f7ff] mb-2">⏱️ Pembatasan Penggunaan</div>
                    <p className="text-[9px] text-muted-foreground mb-3">Masa aktif adalah waktu voucher berlaku sejak pertama kali digunakan. Kuota & Durasi adalah batasan penggunaan selama masa aktif tersebut.</p>
                    <div className="space-y-3">
                      <div>
                        <ModalLabel>{t('hotspot.dataQuotaLabel')}</ModalLabel>
                        <div className="flex gap-2">
                          <ModalInput type="number" min={0} step={0.1} value={formData.usageQuota} onChange={(e) => setFormData({ ...formData, usageQuota: e.target.value })} placeholder="0 = Unlimited" className="flex-1" />
                          <ModalSelect value={formData.usageQuotaUnit} onChange={(e) => setFormData({ ...formData, usageQuotaUnit: e.target.value })} className="w-20">
                            <option value="MB" className="bg-[#0a0520]">MB</option>
                            <option value="GB" className="bg-[#0a0520]">GB</option>
                          </ModalSelect>
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-1">Kosongkan untuk unlimited</p>
                      </div>
                      <div>
                        <ModalLabel>{t('hotspot.usageDurationLabel')}</ModalLabel>
                        <div className="flex gap-2">
                          <ModalInput type="number" min={0} value={formData.usageDuration} onChange={(e) => setFormData({ ...formData, usageDuration: e.target.value })} placeholder="0 = Unlimited" className="flex-1" />
                          <ModalSelect value={formData.usageDurationUnit} onChange={(e) => setFormData({ ...formData, usageDurationUnit: e.target.value })} className="w-20">
                            <option value="MINUTES" className="bg-[#0a0520]">Menit</option>
                            <option value="HOURS" className="bg-[#0a0520]">Jam</option>
                            <option value="DAYS" className="bg-[#0a0520]">Hari</option>
                            <option value="MONTHS" className="bg-[#0a0520]">Bulan</option>
                          </ModalSelect>
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-1">Total waktu penggunaan (kosongkan = unlimited)</p>
                      </div>
                    </div>
                  </div>
                  <div className="border border-[#bc13fe]/30 rounded-lg p-3 space-y-2 bg-[#bc13fe]/5">
                    <div className="text-[10px] font-medium text-[#bc13fe] mb-2">🔐 Access Control</div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.agentAccess} onChange={(e) => setFormData({ ...formData, agentAccess: e.target.checked })} className="rounded border-[#bc13fe]/50 bg-[#0a0520] text-[#00f7ff] focus:ring-[#00f7ff]" />
                      <span className="text-xs text-foreground">{t('hotspot.agentAccess')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.eVoucherAccess} onChange={(e) => setFormData({ ...formData, eVoucherAccess: e.target.checked })} className="rounded border-[#bc13fe]/50 bg-[#0a0520] text-[#00f7ff] focus:ring-[#00f7ff]" />
                      <span className="text-xs text-foreground">{t('hotspot.evoucherAccess')}</span>
                    </label>
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); resetForm(); }}>{t('common.cancel')}</ModalButton>
              <ModalButton type="submit" variant="primary" disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingProfile ? t('common.update') : t('common.create')}
              </ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>

        {/* Delete Confirmation */}
        <SimpleModal isOpen={!!deleteProfileId} onClose={() => setDeleteProfileId(null)} size="sm">
          <ModalBody className="text-center py-6">
            <div className="w-14 h-14 bg-[#ff4466]/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-[#ff4466]/50">
              <Trash2 className="w-7 h-7 text-[#ff6b8a]" />
            </div>
            <h2 className="text-base font-bold text-foreground mb-2">{t('hotspot.deleteProfile')}</h2>
            <p className="text-xs text-muted-foreground">{t('hotspot.confirmDeleteProfile')}</p>
          </ModalBody>
          <ModalFooter className="justify-center">
            <ModalButton variant="secondary" onClick={() => setDeleteProfileId(null)}>{t('common.cancel')}</ModalButton>
            <ModalButton variant="danger" onClick={handleDelete}>{t('common.delete')}</ModalButton>
          </ModalFooter>
        </SimpleModal>
      </div>
    </div>
  )
}
