'use client';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import * as XLSX from 'xlsx';
import { usePermissions } from '@/hooks/usePermissions';
import { PERMISSIONS } from '@/lib/permissions';
import { useTranslation } from '@/hooks/useTranslation';
import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApiQuery, useQueryClient, buildQueryKey } from '@/lib/api/hooks';
import type {
  PppoeUserListResponse,
  PppoeProfileListResponse,
  PppoeAreaListResponse,
  PppoeOnlineStatusResponse,
  RouterListResponse,
} from '@/types/api';
import {
  Plus, Pencil, Trash2, Users, CheckCircle2, MapPin, Map, MoreVertical,
  Shield, ShieldOff, Ban, Download, Upload, Search, Filter, X, Eye, EyeOff, RefreshCcw, DollarSign, Loader2, Zap,
  UserPlus, RefreshCw, Clock, Bell, Send, Mail, ArrowUpDown, Printer, FileText,
  Calendar, CreditCard, Camera, ImageIcon, Info, AlertTriangle, Wrench, CheckCircle, XCircle, Hand,
  GitCompareArrows, AlertCircle, CheckCheck, ChevronDown, ChevronRight, BookOpen,
} from 'lucide-react';
import { Pagination } from '@/components/Pagination';
import MapPicker from '@/components/MapPicker';
import { CameraPhotoInput } from '@/components/CameraPhotoInput';
import { CameraViewfinder } from '@/components/CameraViewfinder';
import UserDetailModal from '@/components/UserDetailModal';
import { formatWIB, isExpiredWIB as isExpired, endOfDayWIBtoUTC, nowWIB, todayWIBStr } from '@/lib/timezone';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalSelect,
  ModalTextarea,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';
import { pppoeApi, invoiceApi, apiAdmin, buildUrl } from '@/lib/api';

interface PppoeUser {
  id: string; username: string; name: string; phone: string; email: string | null;
  address: string | null; latitude: number | null; longitude: number | null;
  status: string; ipAddress: string | null; expiredAt: string | null;
  customerId: string | null;
  pppoeCustomerId?: string | null;
  pppoeCustomer?: { id: string; customerId: string; name: string; phone: string; email: string | null } | null;
  syncedToRadius: boolean; createdAt: string; updatedAt: string;
  subscriptionType?: 'PREPAID' | 'POSTPAID';
  billingDay?: number | null;
  macAddress?: string | null;
  comment?: string | null;
  idCardNumber?: string | null;
  idCardPhoto?: string | null;
  installationPhotos?: string[] | null;
  followRoad?: boolean;
  isOnline?: boolean;
  profile: { id: string; name: string; groupName: string };
  router?: { id: string; name: string; nasname: string; ipAddress: string } | null;
  routerId?: string | null;
  areaId?: string | null;
  area?: { id: string; name: string } | null;
  discount?: number | null;
  discountNote?: string | null;
  connectionType?: 'PPPOE' | 'STATIC_IP' | 'HOTSPOT' | null;
  registeredByTechnician?: { id: string; name: string } | null;
  balance?: number;
}

interface Profile { id: string; name: string; groupName: string; price: number; }
interface Router { id: string; name: string; nasname: string; ipAddress: string; }
interface Area { id: string; name: string; }

// Inline types for API responses not fully covered by @/types/api
interface FileUploadResponse { url: string; success?: boolean; error?: string; }
interface InvoiceCountsResponse { success: boolean; counts?: Record<string, number>; }
interface InvoicePrintData {
  company: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    logo?: string;
    poweredBy?: string;
    bankAccounts?: Array<{ bankName: string; accountNumber: string; accountName: string }>;
  };
  invoice: { number: string; status: string; date: string; dueDate: string; paidAt?: string };
  customer: { name: string; customerId?: string; phone?: string; username?: string; area?: string };
  items: Array<{ description: string; quantity: number; price: number; total: number }>;
  additionalFees?: Array<{ name: string; amount: number }>;
  tax?: { hasTax: boolean; taxRate: number; baseAmount: number; taxAmount: number };
  amountFormatted: string;
  paymentLink?: string;
  paidVia?: string;
}
interface InvoicePrintApiResponse { success: boolean; data: InvoicePrintData; }
interface ExportPdfResponse {
  pdfData?: {
    title: string;
    subtitle?: string;
    generatedAt: string;
    headers: string[];
    rows: string[][];
    summary?: Array<{ label: string; value: string }>;
  };
}
interface MarkPaidResult { success: boolean; message?: string; invoicesCount?: number; totalAmount?: number; }
interface ExtendResult { success: boolean; message?: string; profileChanged?: boolean; extended?: string; amount?: number; }
interface SyncPreviewSecretExtended {
  username: string;
  password: string;
  isNew: boolean;
  disabled: boolean;
  profile?: string;
  remoteAddress?: string;
}
interface SyncPreviewResult {
  success: boolean;
  error?: string;
  router?: { id: string; name: string; ipAddress: string };
  data: { total: number; new: number; existing: number; secrets: SyncPreviewSecretExtended[] };
}
interface SyncImportResult {
  success: boolean;
  message: string;
  error?: string;
  stats: { total: number; imported: number; skipped: number; failed: number };
  errors?: Array<{ username: string; error: string }>;
}
interface ImportResult {
  success: number;
  updated: number;
  failed: number;
  errors: Array<{ line: number; username?: string; error: string }>;
}
interface SyncAuditDiff {
  username: string;
  routerId: string;
  routerName: string;
  type: 'missing_in_mikrotik' | 'missing_in_db' | 'password_mismatch' | 'profile_mismatch' | 'status_mismatch';
  db: { password?: string; profile?: string; status?: string };
  mikrotik: { password?: string; profile?: string; disabled?: string };
  message: string;
}
interface SyncAuditResult {
  success: boolean;
  router: { id: string; name: string; ipAddress: string; authMode: string };
  stats: { dbCount: number; mtCount: number; matched: number; missingInMikrotik: number; missingInDb: number; passwordMismatch: number; profileMismatch: number; statusMismatch: number };
  differences: SyncAuditDiff[];
  error?: string;
}
interface SyncAuditFixResult {
  success: boolean;
  message: string;
  results: Array<{ username: string; action: string; success: boolean; message: string }>;
  stats: { success: number; failed: number; total: number };
}
interface BulkUploadResponse {
  success: boolean;
  results: ImportResult;
  message?: string;
}

// Isolated form component — formData state lives here so typing only re-renders
// this component, not the entire PppoeUsersPage (which has 100+ state variables).
// This prevents mobile virtual keyboard dismissal caused by parent re-renders.
function AddPppoeUserModal({ isOpen, onClose, onSuccess, profiles, routers, areas }: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  profiles: Profile[];
  routers: Router[];
  areas: Area[];
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    username: '', password: '', profileId: '', routerId: '', areaId: '', name: '', phone: '',
    email: '', address: '', latitude: '', longitude: '', ipAddress: '', expiredAt: '',
    subscriptionType: 'POSTPAID' as 'POSTPAID' | 'PREPAID',
    billingDay: '1',
    macAddress: '', comment: '', referralCode: '',
    idCardNumber: '', idCardPhoto: '',
    installationPhotos: [] as string[],
    followRoad: false,
    registeredAt: todayWIBStr(),
  });
  const [showPassword, setShowPassword] = useState(false);
  const [uploadingIdCard, setUploadingIdCard] = useState(false);
  const [uploadingInstallation, setUploadingInstallation] = useState(false);
  const [installCameraOpen, setInstallCameraOpen] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Reset form whenever the modal closes
  const prevIsOpen = useRef(isOpen);
  useEffect(() => {
    if (prevIsOpen.current && !isOpen) {
      setFormData({ username: '', password: '', profileId: '', routerId: '', areaId: '', name: '', phone: '', email: '', address: '', latitude: '', longitude: '', ipAddress: '', expiredAt: '', subscriptionType: 'POSTPAID', billingDay: '1', macAddress: '', comment: '', referralCode: '', idCardNumber: '', idCardPhoto: '', installationPhotos: [], followRoad: false, registeredAt: todayWIBStr() });
      setShowPassword(false);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        ...(formData.expiredAt && { expiredAt: endOfDayWIBtoUTC(formData.expiredAt).toISOString() }),
      };
      await pppoeApi.createUser(payload);
      onClose();
      onSuccess();
      await showSuccess(t('management.userCreated'));
    } catch (error: unknown) { console.error('Submit error:', error); await showError(error instanceof Error ? error.message : t('management.failedSaveUser')); }
  };

  const handleUploadInstallation = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingInstallation(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'installation');
      const result = await pppoeApi.uploadFile(fd) as FileUploadResponse;
      if (result.success) { setFormData(prev => ({ ...prev, installationPhotos: [...prev.installationPhotos, result.url] })); }
      else { await showError(result.error || 'Upload foto instalasi gagal'); }
    } catch (e: unknown) { await showError(e instanceof Error ? e.message : 'Upload foto instalasi gagal'); }
    finally { setUploadingInstallation(false); }
  };

  const handleCameraInstallation = async (file: File) => {
    setUploadingInstallation(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'installation');
      const result = await pppoeApi.uploadFile(fd) as FileUploadResponse;
      if (result.success) {
        setFormData(prev => ({ ...prev, installationPhotos: [...prev.installationPhotos, result.url] }));
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((p) => {
            setFormData(prev => ({ ...prev, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }));
          }, () => {}, { enableHighAccuracy: true, timeout: 10000 });
        }
      } else { await showError(result.error || 'Upload foto instalasi gagal'); }
    } catch { await showError('Upload foto instalasi gagal'); }
    finally { setUploadingInstallation(false); }
  };

  const handleRemoveInstallationPhoto = (index: number) => {
    setFormData(prev => ({ ...prev, installationPhotos: prev.installationPhotos.filter((_, i) => i !== index) }));
  };

  return (
    <>
      <SimpleModal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalHeader>
          <ModalTitle>{t('pppoe.addUser')}</ModalTitle>
          <ModalDescription>{t('pppoe.createPppoe')}</ModalDescription>
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div><ModalLabel required>{t('pppoe.username')}</ModalLabel><ModalInput type="text" value={formData.username} onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))} required /></div>
              <div><ModalLabel required>{t('pppoe.password')}</ModalLabel>
                <div className="relative"><ModalInput type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))} required className="pr-8" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-brand-500">{showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</button>
                </div>
              </div>
            </div>
            <div><ModalLabel required>{t('pppoe.profile')}</ModalLabel><ModalSelect value={formData.profileId} onChange={(e) => setFormData(prev => ({ ...prev, profileId: e.target.value }))} required><option value="" className="dark:bg-card">{t('common.select')}</option>{profiles.map((p) => <option key={p.id} value={p.id} className="dark:bg-card">{p.name} - Rp {p.price.toLocaleString('id-ID')}</option>)}</ModalSelect></div>
            <div><ModalLabel>NAS ({t('common.optional')})</ModalLabel><ModalSelect value={formData.routerId} onChange={(e) => setFormData(prev => ({ ...prev, routerId: e.target.value }))}><option value="" className="dark:bg-card">{t('pppoe.global')}</option>{routers.map((r) => <option key={r.id} value={r.id} className="dark:bg-card">{r.name} ({r.ipAddress})</option>)}</ModalSelect></div>
            <div><ModalLabel>Area <span className="text-muted-foreground text-[10px]">({t('common.optional')})</span></ModalLabel><ModalSelect value={formData.areaId} onChange={(e) => setFormData(prev => ({ ...prev, areaId: e.target.value }))}><option value="" className="dark:bg-card">-- Pilih Area --</option>{areas.map((a) => <option key={a.id} value={a.id} className="dark:bg-card">{a.name}</option>)}</ModalSelect></div>
            <div className="grid grid-cols-2 gap-3">
              <div><ModalLabel required>{t('common.name')}</ModalLabel><ModalInput type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} required /></div>
              <div><ModalLabel required>{t('common.phone')}</ModalLabel><ModalInput type="tel" value={formData.phone} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} required /></div>
            </div>
            <div><ModalLabel required>{t('common.email')}</ModalLabel><ModalInput type="email" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} required /></div>
            <div><ModalLabel>{t('common.address')}</ModalLabel><ModalInput type="text" value={formData.address} onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))} /></div>
            <div>
              <div className="flex items-center justify-between mb-1"><ModalLabel>{t('pppoe.gpsLocation')}</ModalLabel>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setShowMapPicker(true)} className="inline-flex items-center px-2 py-0.5 text-[10px] bg-primary/10 text-primary border border-primary/50 rounded hover:bg-primary/20 dark:bg-brand-500/20 dark:text-brand-500 dark:border-brand-500/50 dark:hover:bg-brand-500/30"><Map className="h-2.5 w-2.5 mr-1" />{t('pppoe.openMap')}</button>
                  <button type="button" onClick={async () => { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition((p) => { setFormData(prev => ({ ...prev, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })); }, async () => { await showError(t('pppoe.gpsFailed')); }, { enableHighAccuracy: true, timeout: 10000 }); } }} className="inline-flex items-center px-2 py-0.5 text-[10px] bg-green-100 text-green-600 border border-green-300 rounded hover:bg-green-200 dark:bg-green-500/20 dark:text-green-500 dark:border-green-500/50 dark:hover:bg-green-500/30"><MapPin className="h-2.5 w-2.5 mr-1" />{t('pppoe.autoGps')}</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ModalInput type="number" step="any" value={formData.latitude} onChange={(e) => setFormData(prev => ({ ...prev, latitude: e.target.value }))} placeholder={t('pppoe.latitude')} />
                <ModalInput type="number" step="any" value={formData.longitude} onChange={(e) => setFormData(prev => ({ ...prev, longitude: e.target.value }))} placeholder={t('pppoe.longitude')} />
              </div>
            </div>
            <div>
              <ModalLabel required>{t('pppoe.subscriptionType')}</ModalLabel>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex items-center p-2 border-2 rounded-lg cursor-pointer transition-all ${formData.subscriptionType === 'POSTPAID' ? 'border-primary bg-primary/10 dark:border-brand-500 dark:bg-brand-500/10 dark:shadow-[0_0_10px_rgba(6,182,212,0.3)]' : 'border-border hover:border-primary/50 dark:border-violet-500/30 dark:hover:border-brand-500/50'}`}>
                  <input type="radio" name="subscriptionType" value="POSTPAID" checked={formData.subscriptionType === 'POSTPAID'} onChange={(e) => setFormData(prev => ({ ...prev, subscriptionType: e.target.value as 'POSTPAID' }))} className="w-3 h-3 accent-primary dark:text-brand-500 border-border dark:border-violet-500/50 focus:ring-primary dark:focus:ring-brand-500" />
                  <div className="ml-2 flex-1"><div className="text-[10px] font-medium text-foreground"><Calendar className="w-3 h-3 inline mr-0.5" />{t('pppoe.postpaid')}</div><div className="text-[9px] text-muted-foreground">{t('pppoe.fixedDueDate')}</div></div>
                </label>
                <label className={`flex items-center p-2 border-2 rounded-lg cursor-pointer transition-all ${formData.subscriptionType === 'PREPAID' ? 'border-primary bg-primary/10 dark:border-violet-500 dark:bg-violet-500/10 dark:shadow-[0_0_10px_rgba(139,92,246,0.3)]' : 'border-border hover:border-primary/50 dark:border-violet-500/30 dark:hover:border-violet-500/50'}`}>
                  <input type="radio" name="subscriptionType" value="PREPAID" checked={formData.subscriptionType === 'PREPAID'} onChange={(e) => setFormData(prev => ({ ...prev, subscriptionType: e.target.value as 'PREPAID' }))} className="w-3 h-3 accent-primary dark:text-violet-500 border-border dark:border-violet-500/50 focus:ring-primary dark:focus:ring-violet-500" />
                  <div className="ml-2 flex-1"><div className="text-[10px] font-medium text-foreground">⏰ {t('pppoe.prepaid')}</div><div className="text-[9px] text-muted-foreground">{t('pppoe.followsPayment')}</div></div>
                </label>
              </div>
            </div>
            {formData.subscriptionType === 'POSTPAID' && (
              <div><ModalLabel><Calendar className="w-3 h-3 inline mr-0.5" />{t('pppoe.billingDate')}</ModalLabel><ModalSelect value={formData.billingDay} onChange={(e) => setFormData(prev => ({ ...prev, billingDay: e.target.value }))}>{Array.from({ length: 31 }, (_, i) => i + 1).map(day => (<option key={day} value={day} className="dark:bg-card">{t('pppoe.dayOf')} {day}</option>))}</ModalSelect><p className="text-[10px] text-muted-foreground mt-1">{t('pppoe.monthlyDueDateDesc')}</p></div>
            )}
            {formData.subscriptionType === 'PREPAID' && (
              <div>
                <ModalLabel>{t('pppoe.expiredAt')} (opsional)</ModalLabel>
                <ModalInput type="date" value={formData.expiredAt} onChange={(e) => setFormData(prev => ({ ...prev, expiredAt: e.target.value }))} />
                <p className="text-[10px] text-muted-foreground mt-1">{t('pppoe.leaveEmptyForAuto')}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><ModalLabel>{t('pppoe.staticIp')}</ModalLabel><ModalInput type="text" value={formData.ipAddress} onChange={(e) => setFormData(prev => ({ ...prev, ipAddress: e.target.value }))} placeholder="10.10.10.2" /></div>
              <div><ModalLabel>MAC Address</ModalLabel><ModalInput type="text" value={formData.macAddress} onChange={(e) => setFormData(prev => ({ ...prev, macAddress: e.target.value }))} placeholder="AA:BB:CC:DD:EE:FF" /></div>
            </div>
            {formData.subscriptionType === 'POSTPAID' && (
              <div><ModalLabel>{t('pppoe.expiryDate')}</ModalLabel><ModalInput type="date" value={formData.expiredAt} onChange={(e) => setFormData(prev => ({ ...prev, expiredAt: e.target.value }))} /></div>
            )}
            <div><ModalLabel>Komentar / Catatan</ModalLabel><ModalTextarea value={formData.comment} onChange={(e) => setFormData(prev => ({ ...prev, comment: e.target.value }))} placeholder="Catatan tambahan tentang pelanggan ini..." rows={2} /></div>
            <div><ModalLabel>Tanggal Register</ModalLabel><ModalInput type="date" value={formData.registeredAt} onChange={(e) => setFormData(prev => ({ ...prev, registeredAt: e.target.value }))} /><p className="text-[10px] text-muted-foreground mt-1">Tanggal pelanggan terdaftar. Default hari ini, bisa diubah untuk data historis.</p></div>
            <div><ModalLabel>Kode Referral <span className="text-muted-foreground text-[10px]">(opsional)</span></ModalLabel><ModalInput type="text" value={formData.referralCode} onChange={(e) => setFormData(prev => ({ ...prev, referralCode: e.target.value }))} placeholder="Masukkan kode referral" /></div>

            {/* Dokumen Pelanggan */}
            <div className="border border-border dark:border-violet-500/30 rounded-lg p-3 space-y-3">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span><CreditCard className="w-3.5 h-3.5" /></span> Dokumen Identitas (KTP)
              </div>
              <div>
                <ModalLabel>No. NIK KTP</ModalLabel>
                <ModalInput type="text" value={formData.idCardNumber} onChange={(e) => setFormData(prev => ({ ...prev, idCardNumber: e.target.value }))} placeholder="3201234567890123" maxLength={16} />
              </div>
              <div>
                <ModalLabel>Foto KTP</ModalLabel>
                <CameraPhotoInput
                  photoUrl={formData.idCardPhoto}
                  onRemove={() => setFormData(prev => ({ ...prev, idCardPhoto: '' }))}
                  uploading={uploadingIdCard}
                  onUploadFile={async (file) => {
                    setUploadingIdCard(true);
                    try {
                      const fd = new FormData(); fd.append('file', file); fd.append('type', 'idCard');
                      const result = await pppoeApi.uploadFile(fd) as FileUploadResponse;
                      if (result.success) { setFormData(prev => ({ ...prev, idCardPhoto: result.url })); return result.url; }
                      await showError(result.error || 'Upload KTP gagal'); return null;
                    } catch (e: unknown) { await showError(e instanceof Error ? e.message : 'Upload KTP gagal'); return null; }
                    finally { setUploadingIdCard(false); }
                  }}
                  theme="light"
                />
              </div>
            </div>

            {/* Foto Instalasi */}
            <div className="border border-border dark:border-brand-500/20 rounded-lg p-3 space-y-3">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span><Camera className="w-3.5 h-3.5" /></span> Foto Instalasi
              </div>
              <div>
                <input type="file" accept="image/*" onChange={handleUploadInstallation} disabled={uploadingInstallation} className="sr-only" id="installationUploadAdd" />
                {installCameraOpen ? (
                  <CameraViewfinder
                    onCapture={handleCameraInstallation}
                    onClose={() => setInstallCameraOpen(false)}
                  />
                ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label htmlFor={uploadingInstallation ? undefined : 'installationUploadAdd'} className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs border border-border dark:border-brand-500/30 rounded hover:bg-muted dark:hover:bg-brand-500/10 text-muted-foreground ${uploadingInstallation ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}>
                    <ImageIcon className="w-3 h-3" /> {uploadingInstallation ? '⏳ Mengupload...' : 'Galeri'}
                  </label>
                  <button type="button" onClick={() => setInstallCameraOpen(true)} disabled={uploadingInstallation} className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs border border-primary/30 dark:border-brand-500/40 rounded hover:bg-primary/5 dark:hover:bg-brand-500/10 text-primary/70 dark:text-brand-500/70 ${uploadingInstallation ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <Camera className="w-3 h-3" /> Kamera
                  </button>
                </div>
                )}
                <p className="text-[9px] text-muted-foreground mt-1">Bisa upload beberapa foto. Maks. 5MB per foto. Kamera otomatis mengambil GPS.</p>
              </div>
              {formData.installationPhotos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {formData.installationPhotos.map((photo, index) => (
                    <div key={index} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt={`Instalasi ${index + 1}`} className="w-full h-20 object-cover rounded border border-border dark:border-brand-500/20" loading="lazy" />
                      <button type="button" onClick={() => handleRemoveInstallationPhoto(index)} className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] hover:bg-red-600"><X className="w-2.5 h-2.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalButton type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</ModalButton>
            <ModalButton type="submit" variant="primary">{t('common.create')}</ModalButton>
          </ModalFooter>
        </form>
      </SimpleModal>
      <MapPicker
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onSelect={(lat, lng) => { setFormData(prev => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6) })); }}
        initialLat={formData.latitude ? parseFloat(formData.latitude) : undefined}
        initialLng={formData.longitude ? parseFloat(formData.longitude) : undefined}
      />
    </>
  );
}

export default function PppoeUsersPage() {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PppoeUser | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [bulkDeletePassword, setBulkDeletePassword] = useState('');
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [modalLatLng, setModalLatLng] = useState<{ lat: string; lng: string } | undefined>();
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [mapPickerLat, setMapPickerLat] = useState('');
  const [mapPickerLon, setMapPickerLon] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterProfile, setFilterProfile] = useState('');
  const [filterRouter, setFilterRouter] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSession, setFilterSession] = useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importPreview, setImportPreview] = useState<Record<string, string>[]>([]);
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const [showImportGuide, setShowImportGuide] = useState(false);

  // Sync from MikroTik states
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [syncRouterId, setSyncRouterId] = useState('');
  const [syncProfileId, setSyncProfileId] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncPreview, setSyncPreview] = useState<SyncPreviewResult | null>(null);
  const [syncSelectedUsers, setSyncSelectedUsers] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncImportResult | null>(null);
  // Sync Audit states
  const [isSyncAuditOpen, setIsSyncAuditOpen] = useState(false);
  const [auditRouterId, setAuditRouterId] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditData, setAuditData] = useState<SyncAuditResult | null>(null);
  const [auditFixing, setAuditFixing] = useState(false);
  const [auditFixResult, setAuditFixResult] = useState<SyncAuditFixResult | null>(null);
  const [auditSelectedFixes, setAuditSelectedFixes] = useState<Set<string>>(new Set());

  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [extending, setExtending] = useState<string | null>(null);
  const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
  const [selectedUserForExtend, setSelectedUserForExtend] = useState<PppoeUser | null>(null);
  const [selectedProfileForExtend, setSelectedProfileForExtend] = useState('');

  // Broadcast notification states
  const [isBroadcastDialogOpen, setIsBroadcastDialogOpen] = useState(false);
  const [notificationType, setNotificationType] = useState<'outage' | 'invoice' | 'payment'>('outage');
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);
  const [broadcastData, setBroadcastData] = useState({
    issueType: 'Gangguan Jaringan',
    description: '',
    estimatedTime: '',
    affectedArea: '',
    status: 'in_progress',
    notificationMethod: 'both',
  });
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [printDialogUser, setPrintDialogUser] = useState<PppoeUser | null>(null);

  // ─── React Query data fetching ──────────────────────────────────────
  const queryClient = useQueryClient();

  // Read search param from URL (e.g. from header global search)
  useEffect(() => {
    const urlSearch = searchParams.get('search');
    if (urlSearch) setSearchQuery(urlSearch);
  }, [searchParams]);

  // Debounce search input (300ms) to avoid request on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset to first page when filters change
  useEffect(() => { setCurrentPage(1); }, [filterProfile, filterRouter, filterStatus]);

  // Users list — server-side pagination, search, filter, sort
  const serverParams: Record<string, string> = {
    page: String(currentPage),
    limit: String(pageSize),
    sortBy,
    sortOrder,
  };
  if (debouncedSearch) serverParams.search = debouncedSearch;
  if (filterProfile) serverParams.profileId = filterProfile;
  if (filterRouter && filterRouter !== 'global') serverParams.routerId = filterRouter;
  if (filterStatus) serverParams.status = filterStatus;

  const usersQuery = useApiQuery<PppoeUserListResponse>('/api/pppoe/users', {
    params: serverParams,
    staleTime: 30000,
    placeholderData: 'keepPreviousData',
  });
  // API PppoeUser uses pppoe_profiles/nas/pppoe_areas; local PppoeUser uses profile/router/area
  const users = (usersQuery.data?.users as unknown as PppoeUser[]) || [];
  const totalCount = usersQuery.data?.total || 0;
  const totalPages = usersQuery.data?.totalPages || 1;

  // Realtime online/offline + status polling — refresh every 10 seconds
  // without reloading the entire page. Fetches online username set + status map
  // (isolated/active/stop/blocked) so status changes from cron auto-isolir
  // or manual actions by other admins are reflected in realtime.
  const usernames = useMemo(() => users.map(u => u.username).join(','), [users]);
  const onlineQuery = useApiQuery<PppoeOnlineStatusResponse>(
    '/api/pppoe/users/online-status',
    {
      params: { usernames },
      refetchInterval: 10000,
      enabled: users.length > 0,
    },
  );
  const onlineSet = useMemo(
    () => new Set(onlineQuery.data?.online || []),
    [onlineQuery.data],
  );
  const statusMap = useMemo(
    () => onlineQuery.data?.statusMap || {},
    [onlineQuery.data],
  );
  // Merge online status AND user status (isolated/active/stop) into users
  // — only updates if there's an actual change to avoid unnecessary re-renders
  const usersWithOnline = useMemo(() => {
    let changed = false;
    const next = users.map(u => {
      const isOnline = onlineSet.has(u.username);
      const newStatus = statusMap[u.username];
      const statusChanged = newStatus && newStatus !== u.status;
      if (u.isOnline !== isOnline || statusChanged) {
        changed = true;
        return { ...u, isOnline, status: statusChanged ? newStatus : u.status };
      }
      return u;
    });
    return changed ? next : users;
  }, [users, onlineSet, statusMap]);

  // Profiles — rarely changes, cache for 5 minutes
  const profilesQuery = useApiQuery<PppoeProfileListResponse>('/api/pppoe/profiles', {
    staleTime: 300000,
  });
  const profiles: Profile[] = (profilesQuery.data?.profiles as unknown as Profile[]) || [];

  // Routers/NAS — rarely changes, cache for 5 minutes
  const routersQuery = useApiQuery<RouterListResponse>('/api/network/routers', {
    staleTime: 300000,
  });
  const routers: Router[] = (routersQuery.data?.routers as unknown as Router[]) || [];

  // Areas — rarely changes, cache for 5 minutes
  const areasQuery = useApiQuery<PppoeAreaListResponse>('/api/pppoe/areas', {
    staleTime: 300000,
  });
  const areas: Area[] = (areasQuery.data?.areas as unknown as Area[]) || [];

  // Invoice counts for all users — enabled only when users are loaded
  const userIds = useMemo(() => users.map(u => u.id).join(','), [users]);
  const invoiceCountsQuery = useApiQuery<InvoiceCountsResponse>(
    '/api/invoices/counts',
    {
      params: { userIds },
      enabled: users.length > 0,
    },
  );
  const invoiceCounts: Record<string, number> = invoiceCountsQuery.data?.counts || {};

  // Sync loading state with queries
  useEffect(() => {
    if (!usersQuery.isLoading) setLoading(false);
  }, [usersQuery.isLoading]);

  // Helper to invalidate all user-related queries (replaces loadData)
  const invalidateUserData = () => {
    queryClient.refetchQueries({ queryKey: buildQueryKey('/api/pppoe/users') });
    queryClient.invalidateQueries({ queryKey: buildQueryKey('/api/invoices/counts') });
  };

  const handleSaveUser = async (data: Record<string, unknown>) => {
    try {
      await pppoeApi.updateUser(data as { id: string; [key: string]: unknown });
      invalidateUserData(); await showSuccess(t('management.userUpdated'));
    } catch (error: unknown) { console.error('Save user error:', error); await showError(error instanceof Error ? error.message : t('management.failedSaveUser')); throw error; }
  };

  const handlePrintStandard = async (invoice: { id: string }) => {
    try {
      const data = await apiAdmin<InvoicePrintApiResponse>(`/api/invoices/${invoice.id}/pdf`);
      if (!data.success || !data.data) { await showError('Gagal mengambil data tagihan'); return; }
      const inv = data.data;
      const fmtCurr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
      const win = window.open('', '_blank', 'width=850,height=1100');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Invoice ${inv.invoice.number}</title>
      <style>
        @media print {
          @page { size: A4; margin: 10mm; }
          html, body { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
          body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .topbar { display: none !important; }
          .sheet { border: none !important; border-radius: 0 !important; box-shadow: none !important; overflow: visible !important; max-width: 100% !important; width: 100% !important; margin: 0 !important; }
          .content { padding: 6mm 8mm !important; }
          .header-right { padding-top: 0 !important; overflow: visible !important; }
          .inv-title { overflow: visible !important; padding-top: 0 !important; line-height: 1.3 !important; }
          .inv-number { overflow: visible !important; line-height: 1.4 !important; }
          .meta-card, .payment-card, .paid-stamp { break-inside: avoid; page-break-inside: avoid; }
          table { table-layout: fixed; }
          th, td { word-break: break-word; }
        }
        * { box-sizing: border-box; }
        body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; color: #1f2937; margin: 0; padding: 24px 24px 80px; background: #f8fafc; }
        .sheet { background: #fff; border: 1px solid #dbe7e4; border-radius: 18px; overflow: visible; box-shadow: 0 18px 50px rgba(15, 118, 110, 0.08); max-width: 980px; margin: 0 auto; }
        .topbar { height: 7px; background: linear-gradient(90deg, #0d9488, #14b8a6, #5eead4); }
        .content { padding: 24px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; gap: 20px; }
        .brand-wrap { display:flex; align-items:center; gap:14px; }
        .header-right { text-align:right; padding-top: 2px; }
        .logo-box { width: 78px; height: 78px; border-radius: 16px; background: linear-gradient(180deg, #ecfeff, #f0fdfa); border: 1px solid #c7f9f1; display:flex; align-items:center; justify-content:center; padding: 10px; }
        .company-name { font-size: 20px; font-weight: bold; color: #0d9488; }
        .company-sub { color: #555; margin-top: 3px; font-size: 10px; line-height: 1.6; }
        .inv-title { font-size: 26px; font-weight: bold; color: #111; letter-spacing: 2px; line-height: 1.25; padding-top: 1px; }
        .inv-number { font-size: 13px; font-weight: bold; color: #0d9488; margin: 4px 0; line-height: 1.35; }
        .status-badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; }
        .paid-badge { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
        .pending-badge { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
        .divider { border: none; border-top: 2px solid #0d9488; margin: 14px 0; }
        .section-title { font-weight: bold; font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
        .bill-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 18px; }
        .meta-card { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; }
        .info-row { margin-bottom: 3px; }
        .info-label { color: #555; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #0d9488; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
        td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
        .td-right { text-align: right; }
        .total-row td { font-weight: bold; font-size: 13px; background: #f0fdfa; border-top: 2px solid #0d9488; }
        .actions-grid { display:grid; grid-template-columns: 1.2fr 1fr; gap: 14px; margin: 18px 0 6px; }
        .payment-card { padding: 16px; border-radius: 14px; border: 1px solid #99f6e4; background: linear-gradient(180deg, #f0fdfa, #ffffff); }
        .payment-card-title { font-size: 13px; font-weight: 700; color: #0f766e; margin-bottom: 6px; }
        .payment-cta { display:inline-block; margin-top: 10px; padding: 8px 14px; border-radius: 999px; background: #0d9488; color: #fff; text-decoration: none; font-size: 11px; font-weight: 700; }
        .payment-link { display:block; margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: #0f172a; color: #fff; text-decoration: none; font-size: 11px; line-height: 1.5; word-break: break-all; }
        .payment-note { margin: 0; color: #475569; font-size: 11px; line-height: 1.6; }
        .paid-stamp { display: block; margin: 20px auto; padding: 12px 28px; border: 4px solid #10b981; border-radius: 10px; text-align: center; width: fit-content; }
        .paid-stamp-text { font-size: 24px; font-weight: bold; color: #10b981; letter-spacing: 6px; }
        .paid-stamp-sub { font-size: 11px; color: #555; margin-top: 2px; }
        .footer { margin-top: 28px; text-align: center; color: #aaa; font-size: 10px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
        .action-bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 10px; padding: 12px 16px; background: #fff; border-top: 1px solid #e5e7eb; box-shadow: 0 -4px 12px rgba(0,0,0,0.08); z-index: 100; }
        .btn-print { flex: 1; padding: 12px; background: #0d9488; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .btn-close { flex: 1; padding: 12px; background: #6b7280; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
        @media (max-width: 640px) {
          body { padding: 8px 8px 80px !important; }
          .sheet { border-radius: 10px !important; max-width: 100% !important; }
          .content { padding: 14px !important; }
          .header { flex-direction: column; gap: 10px; }
          .header-right { text-align: left; padding-top: 0; }
          .inv-title { font-size: 20px; }
          .inv-number { font-size: 12px; }
          .bill-grid { grid-template-columns: 1fr; gap: 12px; }
          .meta-card { padding: 10px 12px; }
          .actions-grid { grid-template-columns: 1fr; }
          table { font-size: 10px; }
          th, td { padding: 5px 6px; }
          .paid-stamp-text { font-size: 18px; }
        }
      </style></head><body>
      <div class="sheet">
      <div class="topbar"></div>
      <div class="content">
      <div class="header">
        <div class="brand-wrap">
          ${inv.company.logo ? `<div class="logo-box"><img src="${inv.company.logo}" style="max-height:58px;max-width:58px;width:auto;object-fit:contain" alt="Logo" loading="lazy"></div>` : ''}
          <div>
            <div class="company-name">${inv.company.name}</div>
            <div class="company-sub">
              ${inv.company.address ? `${inv.company.address}<br>` : ''}
              ${inv.company.phone ? `Telp: ${inv.company.phone}<br>` : ''}
              ${inv.company.email ? `${inv.company.email}` : ''}
            </div>
          </div>
        </div>
        <div class="header-right">
          <div class="inv-title">INVOICE</div>
          <div class="inv-number">${inv.invoice.number}</div>
          <div>${inv.invoice.status === 'PAID' ? '<span class="status-badge paid-badge">&#10003; SUDAH BAYAR</span>' : '<span class="status-badge pending-badge">BELUM BAYAR</span>'}</div>
        </div>
      </div>
      <hr class="divider">
      <div class="bill-grid">
        <div class="meta-card">
          <div class="section-title">Dari</div>
          <div class="info-row"><strong>${inv.company.name}</strong></div>
          ${inv.company.address ? `<div class="info-row">${inv.company.address}</div>` : ''}
          ${inv.company.phone ? `<div class="info-row">Telp: ${inv.company.phone}</div>` : ''}
        </div>
        <div class="meta-card">
          <div class="section-title">Kepada</div>
          <div class="info-row"><strong>${inv.customer.name}</strong></div>
          ${inv.customer.customerId ? `<div class="info-row"><span class="info-label">ID Pelanggan: </span>${inv.customer.customerId}</div>` : ''}
          ${inv.customer.phone ? `<div class="info-row"><span class="info-label">Telp: </span>${inv.customer.phone}</div>` : ''}
          ${inv.customer.username ? `<div class="info-row"><span class="info-label">Username: </span>${inv.customer.username}</div>` : ''}
          ${inv.customer.area ? `<div class="info-row"><span class="info-label">Area: </span>${inv.customer.area}</div>` : ''}
        </div>
      </div>
      <div class="bill-grid">
        <div class="meta-card">
          <div class="section-title">Detail Invoice</div>
          <div class="info-row"><span class="info-label">No Invoice: </span><strong>${inv.invoice.number}</strong></div>
          <div class="info-row"><span class="info-label">Tanggal: </span>${inv.invoice.date}</div>
          <div class="info-row"><span class="info-label">Jatuh Tempo: </span>${inv.invoice.dueDate}</div>
          ${inv.invoice.paidAt ? `<div class="info-row"><span class="info-label">Tgl Bayar: </span>${inv.invoice.paidAt}</div>` : ''}
        </div>
        <div class="meta-card">
          <div class="section-title">Status Pembayaran</div>
          <div class="info-row"><span class="info-label">Status: </span><strong>${inv.invoice.status === 'PAID' ? '&#10003; LUNAS' : inv.invoice.status === 'OVERDUE' ? '&#9888; TERLAMBAT' : '&#9203; BELUM BAYAR'}</strong></div>
          ${inv.invoice.paidAt ? `<div class="info-row"><span class="info-label">Dibayar pada: </span>${inv.invoice.paidAt}</div><div class="info-row"><span class="info-label">Via: </span>${inv.paidVia === 'gateway' ? 'Payment Gateway' : inv.paidVia === 'transfer' ? 'Transfer Manual' : 'Dikonfirmasi Admin'}</div>` : ''}
        </div>
      </div>
      <div class="section-title">Rincian Layanan</div>
      <table>
        <thead><tr><th>Deskripsi</th><th style="width:60px;text-align:center">Qty</th><th style="width:130px;text-align:right">Harga</th><th style="width:130px;text-align:right">Total</th></tr></thead>
        <tbody>
          ${inv.items.map((item: { description: string; quantity: number; price: number; total: number }) => `
            <tr><td>${item.description}</td><td style="text-align:center">${item.quantity}</td><td class="td-right">${fmtCurr(item.price)}</td><td class="td-right">${fmtCurr(item.total)}</td></tr>
          `).join('')}
          ${(inv.additionalFees || []).map((fee: { name: string; amount: number }) => `
            <tr><td>${fee.name}</td><td style="text-align:center">1</td><td class="td-right">${fmtCurr(fee.amount)}</td><td class="td-right">${fmtCurr(fee.amount)}</td></tr>
          `).join('')}
          ${inv.tax && inv.tax.hasTax ? `
            <tr style="background:#f9fafb"><td colspan="3" style="text-align:right;font-size:11px;color:#555;padding:5px 10px">Subtotal</td><td class="td-right" style="color:#555;font-size:11px;padding:5px 10px">${fmtCurr(inv.tax.baseAmount)}</td></tr>
            <tr style="background:#fffbeb"><td colspan="3" style="text-align:right;font-size:11px;color:#d97706;padding:5px 10px">PPN ${inv.tax.taxRate}%</td><td class="td-right" style="color:#d97706;font-size:11px;padding:5px 10px">${fmtCurr(inv.tax.taxAmount)}</td></tr>
          ` : ''}
          <tr class="total-row"><td colspan="3" class="td-right">TOTAL</td><td class="td-right">${inv.amountFormatted}</td></tr>
        </tbody>
      </table>
      ${!inv.invoice.paidAt && inv.paymentLink ? `
        <div class="actions-grid">
          <div class="payment-card">
            <div class="payment-card-title">Link Pembayaran Online</div>
            <p class="payment-note">Pelanggan dapat membuka link berikut untuk melakukan pembayaran langsung.</p>
            <a class="payment-cta" href="${inv.paymentLink}" target="_blank" rel="noopener noreferrer">Buka Halaman Bayar</a>
            <a class="payment-link" href="${inv.paymentLink}" target="_blank" rel="noopener noreferrer">${inv.paymentLink}</a>
          </div>
          <div class="payment-card">
            <div class="payment-card-title">Petunjuk Pembayaran</div>
            <p class="payment-note">Arahkan pelanggan untuk menggunakan link pembayaran online di samping atau transfer manual.</p>
          </div>
        </div>
      ` : ''}
      ${inv.invoice.paidAt ? `<div class="paid-stamp"><div class="paid-stamp-text">LUNAS</div><div class="paid-stamp-sub">Dibayar pada ${inv.invoice.paidAt}</div></div>` :
        (inv.company.bankAccounts && inv.company.bankAccounts.length > 0 ? `
        <div style="margin:18px 0;padding:16px;border:1px solid #6ee7b7;border-radius:8px;background:#f0fdfa">
          <div class="section-title" style="margin-bottom:10px">Pembayaran Manual</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">
            ${inv.company.bankAccounts.map((ba: { bankName: string; accountNumber: string; accountName: string }) => `
              <div style="border:1px solid #0d948840;border-radius:8px;padding:10px 14px;background:#fff">
                <div style="font-weight:bold;font-size:12px;color:#0d9488;margin-bottom:4px">${ba.bankName}</div>
                <div style="font-size:14px;font-weight:bold;letter-spacing:1px">${ba.accountNumber}</div>
                <div style="font-size:11px;color:#555;margin-top:2px">a/n ${ba.accountName}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : '')}
      <div class="footer">Terima kasih atas kepercayaan Anda &mdash; ${inv.company.name}${inv.company.poweredBy ? `<br><span style="font-size:9px">Support by ${inv.company.poweredBy}</span>` : ''}</div>
      </div>
      </div>
      <div class="action-bar no-print">
        <button class="btn-print" onclick="window.print()">&#128438; Cetak</button>
        <button class="btn-close" onclick="window.close()">&#10005; Tutup</button>
      </div>
      </body></html>`);
      win.document.close();
    } catch (error) { console.error('Print standard error:', error); await showError('Gagal mencetak invoice'); }
  };

  const handlePrintThermal = async (invoice: { id: string }) => {
    try {
      const data = await apiAdmin<InvoicePrintApiResponse>(`/api/invoices/${invoice.id}/pdf`);
      if (!data.success || !data.data) { await showError('Gagal mengambil data tagihan'); return; }
      const inv = data.data;
      const fmtCurr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
      const win = window.open('', '_blank', 'width=400,height=650');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Struk ${inv.invoice.number}</title>
      <style>
        @media print { @page { margin: 0; width: 80mm; } body { padding: 0 !important; } .no-print { display: none !important; } }
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 80mm; max-width: 100%; padding: 0 0 70px; margin: 0 auto; color: #000; background: #fff; }
        .receipt { border-top: 4px solid #0d9488; padding: 5mm 4mm; }
        .logo { display:block; max-width: 34mm; max-height: 14mm; margin: 0 auto 3px; object-fit: contain; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .big { font-size: 14px; }
        .dashed { border-top: 1px dashed #000; margin: 5px 0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .row span:first-child { color: #444; flex-shrink: 0; margin-right: 8px; }
        .row span:last-child { text-align: right; }
        .total-row { font-weight: bold; font-size: 13px; }
        .lunas-stamp { display: block; text-align: center; font-size: 17px; font-weight: bold; border: 3px double #000; padding: 4px 14px; margin: 8px auto; width: fit-content; letter-spacing: 3px; }
        .sm { font-size: 10px; color: #555; }
        .bank-box { border: 1px dashed #000; padding: 5px; margin: 4px 0; }
        .pay-box { border: 1px solid #0d9488; background: #f0fdfa; padding: 6px; margin: 6px 0; }
        .pay-link { display:block; color:#0f172a; text-decoration:none; word-break:break-all; margin-top:4px; }
        .action-bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 8px; padding: 10px 12px; background: #fff; border-top: 1px solid #e5e7eb; box-shadow: 0 -4px 12px rgba(0,0,0,0.08); z-index: 100; }
        .btn-print { flex: 1; padding: 10px; background: #0d9488; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; }
        .btn-close { flex: 1; padding: 10px; background: #6b7280; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; }
      </style></head><body>
      <div class="receipt">
      ${inv.company.logo ? `<img class="logo" src="${inv.company.logo}" alt="Logo" loading="lazy">` : ''}
      <div class="center bold big">${inv.company.name}</div>
      ${inv.company.address ? `<div class="center sm">${inv.company.address}</div>` : ''}
      ${inv.company.phone ? `<div class="center sm">Telp: ${inv.company.phone}</div>` : ''}
      <div class="dashed"></div>
      <div class="row"><span>No</span><span>${inv.invoice.number}</span></div>
      <div class="row"><span>Tgl</span><span>${inv.invoice.date}</span></div>
      <div class="row"><span>Kasir</span><span>Administrator</span></div>
      <div class="dashed"></div>
      <div class="row"><span>Pelanggan</span><span>${inv.customer.name}</span></div>
      ${inv.customer.customerId ? `<div class="row"><span>ID</span><span>${inv.customer.customerId}</span></div>` : ''}
      ${inv.customer.phone ? `<div class="row"><span>Telp</span><span>${inv.customer.phone}</span></div>` : ''}
      ${inv.customer.area ? `<div class="row"><span>Area</span><span>${inv.customer.area}</span></div>` : ''}
      <div class="dashed"></div>
      ${inv.items.map((item: { description: string; quantity: number; price: number }) => `
        <div style="margin-bottom:3px">${item.description}</div>
        <div class="row"><span>&nbsp;&nbsp;${item.quantity} x</span><span>${fmtCurr(item.price)}</span></div>
      `).join('')}
      ${(inv.additionalFees || []).map((fee: { name: string; amount: number }) => `
        <div style="margin-bottom:3px">${fee.name}</div>
        <div class="row"><span>&nbsp;&nbsp;1 x</span><span>${fmtCurr(fee.amount)}</span></div>
      `).join('')}
      <div class="dashed"></div>
      ${inv.tax && inv.tax.hasTax ? `<div class="row"><span>Subtotal</span><span>${fmtCurr(inv.tax.baseAmount)}</span></div><div class="row"><span>PPN ${inv.tax.taxRate}%</span><span>${fmtCurr(inv.tax.taxAmount)}</span></div><div class="dashed"></div>` : ''}
      <div class="row total-row"><span>TOTAL</span><span>${inv.amountFormatted}</span></div>
      <div class="dashed"></div>
      <div class="row"><span>Jatuh Tempo</span><span>${inv.invoice.dueDate}</span></div>
      ${inv.invoice.paidAt ? `
        <div class="dashed"></div>
        <div class="row"><span>Tgl Bayar</span><span>${inv.invoice.paidAt}</span></div>
        <div class="row"><span>Metode</span><span>${inv.paidVia === 'gateway' ? 'Gateway' : inv.paidVia === 'transfer' ? 'Transfer' : 'Admin'}</span></div>
        <div class="lunas-stamp">** LUNAS **</div>
      ` : `${inv.paymentLink ? `<div class="pay-box"><div class="center bold">Link Pembayaran</div><a class="pay-link" href="${inv.paymentLink}" target="_blank" rel="noopener noreferrer">${inv.paymentLink}</a></div>` : ''}${inv.company.bankAccounts && inv.company.bankAccounts.length > 0 ? `<div style="margin:6px 0"><div class="center bold">Transfer Manual</div>${inv.company.bankAccounts.map((ba: { bankName: string; accountNumber: string; accountName: string }) => `<div class="bank-box"><div class="bold">${ba.bankName}</div><div>${ba.accountNumber}</div><div class="sm">a/n ${ba.accountName}</div></div>`).join('')}</div>` : `<div class="center sm" style="margin:6px 0">Harap bayar sebelum jatuh tempo</div>`}`}
      <div class="dashed"></div>
      <div class="center sm" style="margin-top:4px">Terima kasih</div>
      ${inv.company.poweredBy ? `<div class="center sm" style="margin-top:2px">Support by ${inv.company.poweredBy}</div>` : ''}
      </div>
      <div class="action-bar no-print">
        <button class="btn-print" onclick="window.print()">&#128438; Cetak</button>
        <button class="btn-close" onclick="window.close()">&#10005; Tutup</button>
      </div>
      </body></html>`);
      win.document.close();
    } catch (error) { console.error('Print thermal error:', error); await showError('Gagal mencetak struk'); }
  };

  const handlePrintFromUser = async (user: PppoeUser, type: 'standard' | 'thermal') => {
    try {
      const data = await invoiceApi.list({ userId: user.id, limit: '1' });
      if (data.invoices?.length > 0) {
        setPrintDialogUser(null);
        const inv = data.invoices[0];
        if (type === 'standard') handlePrintStandard({ id: inv.id });
        else handlePrintThermal({ id: inv.id });
      } else {
        await showError('Tidak ada tagihan untuk pelanggan ini');
      }
    } catch (e: unknown) { await showError(e instanceof Error ? e.message : 'Gagal memuat data tagihan'); }
  };

  const handleEdit = (user: PppoeUser) => {
    setEditingUser(user);
    setMapPickerLat(user.latitude?.toString() || '');
    setMapPickerLon(user.longitude?.toString() || '');
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteUserId) return;
    if (!deletePassword.trim()) { await showError('Masukkan password superadmin untuk konfirmasi hapus pelanggan.'); return; }
    setDeleting(true);
    try {
      await pppoeApi.deleteUser(deleteUserId, deletePassword);
      await showSuccess(t('management.userDeleted'));
      invalidateUserData();
    } catch (error: unknown) {
      console.error('Delete error:', error);
      await showError(error instanceof Error ? error.message : t('common.failed'));
    } finally {
      setDeleting(false);
      setDeleteUserId(null);
      setDeletePassword('');
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    try {
      await pppoeApi.updateStatus(userId, newStatus);
      // Optimistic update: update user status in list immediately
      queryClient.setQueryData(buildQueryKey('/api/pppoe/users'), (old: PppoeUserListResponse | undefined) => {
        if (!old) return old;
        return { ...old, users: (old.users as unknown as PppoeUser[]).map(u => u.id === userId ? { ...u, status: newStatus } : u) };
      });
      await showSuccess(`Status: ${newStatus}`);
      invalidateUserData();
      setActionMenuOpen(null);
    } catch (error: unknown) { console.error('Status error:', error); await showError(error instanceof Error ? error.message : t('common.failed')); }
  };

  const handleSyncToRadius = async (user: PppoeUser) => {
    try {
      await pppoeApi.syncRadius(user.id);
      await showSuccess(`${user.username} berhasil di-sync ke RADIUS`); invalidateUserData();
    } catch (e: unknown) { await showError(e instanceof Error ? e.message : 'Gagal sync ke RADIUS'); }
  };

  const handleMarkAllPaid = async (userId: string, userName: string) => {
    const confirmed = await showConfirm(
      t('pppoe.markAllInvoicesPaid').replace('{name}', userName),
      t('pppoe.confirmPayment')
    );
    if (!confirmed) return;

    setMarkingPaid(userId);
    try {
      const result = await pppoeApi.markPaid(userId) as MarkPaidResult;
      await showSuccess(
        t('pppoe.invoicesMarkedPaid').replace('{count}', String(result.invoicesCount)).replace('{amount}', String(result.totalAmount?.toLocaleString('id-ID'))),
        t('common.success')
      );
      invalidateUserData();
    } catch (error: unknown) {
      console.error('Mark paid error:', error);
      await showError(error instanceof Error ? error.message : t('pppoe.failedMarkPaid'));
    } finally {
      setMarkingPaid(null);
    }
  };

  const handleManualExtend = (user: PppoeUser) => {
    setSelectedUserForExtend(user);
    setSelectedProfileForExtend(user.profile?.id || '');
    setIsExtendModalOpen(true);
  };

  const handleConfirmExtend = async () => {
    if (!selectedUserForExtend || !selectedProfileForExtend) return;

    setExtending(selectedUserForExtend.id);
    try {
      const result = await pppoeApi.extend(selectedUserForExtend.id, { profileId: selectedProfileForExtend }) as ExtendResult;
      const profileChanged = result.profileChanged ? t('pppoe.profileChanged') : '';
      await showSuccess(
        `${t('pppoe.validityExtended').replace('{period}', result.extended || '')}${profileChanged}\n${t('pppoe.paymentRecorded').replace('{amount}', String(result.amount?.toLocaleString('id-ID')))}`,
        t('common.success')
      );
      setIsExtendModalOpen(false);
      invalidateUserData();
    } catch (error: unknown) {
      await showError(error instanceof Error ? error.message : t('pppoe.failedExtendValidity'));
    } finally {
      setExtending(null);
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedUsers.size === 0) return;
    const confirmed = await showConfirm(t('pppoe.updateConfirmUsers').replace('{count}', String(selectedUsers.size)).replace('{status}', newStatus));
    if (!confirmed) return;
    try {
      await pppoeApi.bulkUpdateStatus(Array.from(selectedUsers), newStatus);
      await showSuccess(t('pppoe.usersUpdated').replace('{count}', String(selectedUsers.size))); setSelectedUsers(new Set()); invalidateUserData();
    } catch (error: unknown) { console.error('Bulk error:', error); await showError(error instanceof Error ? error.message : t('common.failed')); }
  };

  const toggleSelectUser = (userId: string) => { const n = new Set(selectedUsers); if (n.has(userId)) { n.delete(userId); } else { n.add(userId); } setSelectedUsers(n); };
  const toggleSelectAll = () => { if (selectedUsers.size === filteredUsers.length && filteredUsers.length > 0) { setSelectedUsers(new Set()); } else { setSelectedUsers(new Set(filteredUsers.map(u => u.id))); } };

  const handleStopSubscription = async (user: PppoeUser) => {
    const confirmed = await showConfirm(
      `Stop berlangganan dan HAPUS ${user.name} (${user.username})?\nPelanggan akan dihapus permanen dari sistem.`,
      t('pppoe.stop')
    );
    if (!confirmed) return;
    setDeleteUserId(user.id);
  };

  const handleBulkDelete = async () => {
    if (selectedUsers.size === 0) return;
    setBulkDeletePassword('');
    setBulkDeleteModalOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (!bulkDeletePassword.trim()) { await showError('Masukkan password superadmin untuk konfirmasi hapus pelanggan.'); return; }
    setBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedUsers).map(id => pppoeApi.deleteUser(id, bulkDeletePassword)));
      await showSuccess(t('pppoe.usersDeleted').replace('{count}', String(selectedUsers.size))); setSelectedUsers(new Set()); invalidateUserData();
      setBulkDeleteModalOpen(false);
    } catch (error: unknown) { console.error('Bulk delete error:', error); await showError(error instanceof Error ? error.message : t('common.failed')); }
    finally { setBulkDeleting(false); setBulkDeletePassword(''); }
  };

  const handleOpenNotificationMenu = (type: 'outage' | 'invoice' | 'payment') => {
    if (selectedUsers.size === 0) {
      showError(t('pppoe.selectUserFirst'));
      return;
    }
    setNotificationType(type);
    setShowNotificationMenu(false);
    setIsBroadcastDialogOpen(true);
  };

  const handleSendBroadcast = async () => {
    // Validation based on notification type and status
    if (notificationType === 'outage') {
      if (broadcastData.status === 'resolved') {
        // For resolved status, only description is required
        if (!broadcastData.description) {
          await showError(t('pppoe.fillOutageInfo'));
          return;
        }
      } else {
        // For in_progress status, all fields are required
        if (!broadcastData.issueType || !broadcastData.description || !broadcastData.estimatedTime || !broadcastData.affectedArea) {
          await showError(t('pppoe.fillAllOutageFields'));
          return;
        }
      }
    }

    const selectedUsersList = users.filter(u => selectedUsers.has(u.id));

    // Confirmation message based on type
    const methodText = broadcastData.notificationMethod === 'both' ? 'WhatsApp & Email' : broadcastData.notificationMethod === 'whatsapp' ? 'WhatsApp' : 'Email';
    let confirmMessage = '';
    if (notificationType === 'outage') {
      confirmMessage = t('pppoe.sendOutageConfirm').replace('{count}', String(selectedUsersList.length)).replace('{method}', methodText);
    } else if (notificationType === 'invoice') {
      confirmMessage = t('pppoe.sendInvoiceConfirm').replace('{count}', String(selectedUsersList.length)).replace('{method}', methodText);
    } else if (notificationType === 'payment') {
      confirmMessage = t('pppoe.sendPaymentProofConfirm').replace('{count}', String(selectedUsersList.length)).replace('{method}', methodText);
    }

    const confirmed = await showConfirm(confirmMessage);
    if (!confirmed) return;

    setSendingBroadcast(true);
    try {
      const data = await pppoeApi.sendNotification({
        userIds: Array.from(selectedUsers),
        notificationType: notificationType,
        issueType: broadcastData.issueType,
        description: broadcastData.description,
        estimatedTime: broadcastData.estimatedTime,
        affectedArea: broadcastData.affectedArea,
        status: broadcastData.status,
        notificationMethod: broadcastData.notificationMethod,
      });

      await showSuccess(data.message || t('common.success'));
      setIsBroadcastDialogOpen(false);
      setBroadcastData({
        issueType: 'Gangguan Jaringan',
        description: '',
        estimatedTime: '',
        affectedArea: '',
        status: 'in_progress',
        notificationMethod: 'both',
      });
      setSelectedUsers(new Set());
    } catch (error: unknown) {
      await showError(error instanceof Error ? error.message : t('pppoe.failedSend'));
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleExportSelected = async () => {
    if (selectedUsers.size === 0) return;
    try {
      const selectedUsersData = users.filter(u => selectedUsers.has(u.id));
      const usersWithPasswords = await Promise.all(selectedUsersData.map(async (u) => {
        try { const data = await pppoeApi.getUser(u.id); return { ...u, password: data.user?.password || '' }; }
        catch { return { ...u, password: '' }; }
      }));
      const csvContent = [['Username', 'Password', 'Name', 'Phone', 'Email', 'Address', 'IP', 'Profile', 'Router', 'Status', 'Expired'].join(','),
      ...usersWithPasswords.map(u => [u.username, u.password, u.name, u.phone, u.email || '', u.address || '', u.ipAddress || '', u.profile?.name || '-', u.router?.name || 'Global', u.status, u.expiredAt ? formatWIB(u.expiredAt) : ''].join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' }); const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `pppoe-users-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
    } catch (error) { console.error('Export error:', error); await showError(t('pppoe.exportFailed')); }
  };

  const handleDownloadTemplate = async (format: 'csv' | 'xlsx' = 'xlsx') => {
    try {
      const res = await fetch(buildUrl(`/api/pppoe/users/bulk?type=template&format=${format}`), { credentials: 'include' });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'xlsx' ? 'pppoe-template.xlsx' : 'pppoe-template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Template error:', error);
      await showError(t('pppoe.downloadTemplateFailed'));
    }
  };
  const handleExportData = async () => { try { const exportParams = new URLSearchParams({ type: 'export' }); if (filterPaymentStatus) exportParams.set('paymentStatus', filterPaymentStatus); const res = await fetch(buildUrl(`/api/pppoe/users/bulk?${exportParams}`), { credentials: 'include' }); const blob = await res.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `pppoe-export-${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url); } catch (error) { console.error('Export error:', error); await showError(t('pppoe.exportFailed')); } };

  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      params.set('format', 'excel');
      if (filterProfile) params.set('profileId', filterProfile);
      if (filterRouter) params.set('routerId', filterRouter);
      if (filterStatus) params.set('status', filterStatus);
      if (filterPaymentStatus) params.set('paymentStatus', filterPaymentStatus);
      const res = await fetch(buildUrl(`/api/pppoe/users/export?${params}`), { credentials: 'include' });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `PPPoE-Users-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
    } catch (error) { console.error('Export error:', error); await showError(t('pppoe.exportFailed')); }
  };

  const handleExportPDF = async () => {
    try {
      const params = new URLSearchParams();
      params.set('format', 'pdf');
      if (filterProfile) params.set('profileId', filterProfile);
      if (filterRouter) params.set('routerId', filterRouter);
      if (filterStatus) params.set('status', filterStatus);
      if (filterPaymentStatus) params.set('paymentStatus', filterPaymentStatus);
      const data = await apiAdmin<ExportPdfResponse>(`/api/pppoe/users/export?${params}`);
      if (data.pdfData) {
        const jsPDF = (await import('jspdf')).default;
        const autoTable = (await import('jspdf-autotable')).default;
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(14); doc.text(data.pdfData.title, 14, 15);
        if (data.pdfData.subtitle) { doc.setFontSize(10); doc.text(data.pdfData.subtitle, 14, 21); }
        doc.setFontSize(8); doc.text(`Generated: ${data.pdfData.generatedAt}`, 14, 27);
        autoTable(doc, { head: [data.pdfData.headers], body: data.pdfData.rows, startY: 32, styles: { fontSize: 7 }, headStyles: { fillColor: [13, 148, 136] } });
        if (data.pdfData.summary) {
          // jspdf-autotable adds lastAutoTable to the doc instance at runtime
          const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
          doc.setFontSize(9); doc.setFont('helvetica', 'bold');
          data.pdfData.summary.forEach((s: { label: string; value: string }, i: number) => { doc.text(`${s.label}: ${s.value}`, 14, finalY + (i * 5)); });
        }
        doc.save(`PPPoE-Users-${new Date().toISOString().split('T')[0]}.pdf`);
      }
    } catch (error) { console.error('PDF error:', error); await showError(t('pppoe.pdfExportFailed')); }
  };

  // Sync Audit functions
  const handleSyncAudit = async () => {
    if (!auditRouterId) { await showError('Pilih router terlebih dahulu'); return; }
    setAuditLoading(true); setAuditData(null); setAuditFixResult(null); setAuditSelectedFixes(new Set());
    try {
      const data = await pppoeApi.syncAudit(auditRouterId) as SyncAuditResult;
      if (data.success) {
        setAuditData(data);
        // Auto-select all fixes
        const allKeys = new Set<string>();
        data.differences.forEach((d, i) => allKeys.add(`${d.username}::${d.type}::${i}`));
        setAuditSelectedFixes(allKeys);
      } else {
        await showError(data.error || 'Gagal audit sync');
      }
    } catch (error: unknown) { console.error('Sync audit error:', error); await showError(error instanceof Error ? error.message : 'Gagal koneksi audit sync'); }
    finally { setAuditLoading(false); }
  };

  const getFixAction = (type: string): string => {
    switch (type) {
      case 'missing_in_mikrotik': return 'create_secret';
      case 'missing_in_db': return 'delete_secret';
      case 'password_mismatch': return 'update_password';
      case 'profile_mismatch': return 'update_profile';
      case 'status_mismatch': return 'update_status';
      default: return 'full_sync';
    }
  };

  const handleSyncAuditFix = async () => {
    if (!auditRouterId || auditSelectedFixes.size === 0) return;
    setAuditFixing(true); setAuditFixResult(null);
    try {
      const fixes = Array.from(auditSelectedFixes).map(key => {
        const [username] = key.split('::');
        const diffEntry = auditData?.differences.find((d, i) => `${d.username}::${d.type}::${i}` === key);
        return { username, action: getFixAction(diffEntry?.type || '') };
      });
      const data = await pppoeApi.syncAuditFix(auditRouterId, fixes) as SyncAuditFixResult;
      setAuditFixResult(data);
      if (data.success) {
        await showSuccess(data.message);
        // Re-run audit to see remaining issues
        setTimeout(() => handleSyncAudit(), 500);
      }
    } catch (error: unknown) { console.error('Sync audit fix error:', error); await showError(error instanceof Error ? error.message : 'Gagal apply fixes'); }
    finally { setAuditFixing(false); }
  };

  // Sync from MikroTik functions
  const handleSyncPreview = async () => {
    if (!syncRouterId) { await showError(t('pppoe.selectRouterFirst')); return; }
    setSyncLoading(true); setSyncPreview(null); setSyncSelectedUsers(new Set()); setSyncResult(null);
    try {
      const data = await pppoeApi.syncMikrotik(syncRouterId) as SyncPreviewResult;
      if (data.success) {
        setSyncPreview(data);
        // Auto-select all new users
        const newUsers = data.data.secrets.filter((s: SyncPreviewSecretExtended) => s.isNew && !s.disabled);
        setSyncSelectedUsers(new Set(newUsers.map((s: SyncPreviewSecretExtended) => s.username)));
      } else {
        await showError(data.error || t('pppoe.failedFetchMikrotik'));
      }
    } catch (error: unknown) { console.error('Sync preview error:', error); await showError(error instanceof Error ? error.message : t('pppoe.failedConnectMikrotik')); }
    finally { setSyncLoading(false); }
  };

  const handleSyncImport = async () => {
    if (!syncRouterId || !syncProfileId || syncSelectedUsers.size === 0) {
      await showError(t('pppoe.selectRouterProfileUser'));
      return;
    }
    setSyncing(true); setSyncResult(null);
    try {
      const data = await pppoeApi.syncMikrotikProfiles({
        routerId: syncRouterId,
        profileId: syncProfileId,
        selectedUsernames: Array.from(syncSelectedUsers),
        syncToRadius: true,
        defaultPhone: '08',
      }) as SyncImportResult;
      if (data.success) {
        setSyncResult(data);
        invalidateUserData();
        if (data.stats.failed === 0) {
          await showSuccess(t('common.success'));
        }
      } else {
        await showError(data.error || t('pppoe.failedImportUsers'));
      }
    } catch (error: unknown) { console.error('Sync import error:', error); await showError(error instanceof Error ? error.message : t('pppoe.failedImportUsers')); }
    finally { setSyncing(false); }
  };

  const toggleSyncSelectUser = (username: string) => {
    const newSelected = new Set(syncSelectedUsers);
    if (newSelected.has(username)) { newSelected.delete(username); }
    else { newSelected.add(username); }
    setSyncSelectedUsers(newSelected);
  };

  const toggleSyncSelectAll = (selectNew: boolean) => {
    if (!syncPreview?.data?.secrets) return;
    if (selectNew) {
      const newUsers = syncPreview.data.secrets.filter((s: SyncPreviewSecretExtended) => s.isNew && !s.disabled);
      setSyncSelectedUsers(new Set(newUsers.map((s: SyncPreviewSecretExtended) => s.username)));
    } else {
      setSyncSelectedUsers(new Set());
    }
  };

  const handleImport = async () => {
    if (!importFile) { await showError(t('pppoe.selectFile')); return; }
    setImporting(true); setImportResult(null);
    try {
      const formData = new FormData(); formData.append('file', importFile);
      const data = await pppoeApi.bulkUpload(formData) as BulkUploadResponse;
      setImportResult(data.results);
      invalidateUserData();
      if (data.results.failed === 0) {
        setTimeout(() => {
          setIsImportDialogOpen(false);
          setImportFile(null);
          setImportResult(null);
          setImportPreview([]);
        }, 3000);
      }
    } catch (error: unknown) { console.error('Import error:', error); await showError(t('pppoe.importFailed') + ': ' + (error instanceof Error ? error.message : '')); }
    finally { setImporting(false); }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { setImportFile(null); setImportPreview([]); return; }
    setImportFile(file);
    setImportResult(null);
    setImportPreview([]);
    setImportPreviewLoading(true);

    const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const wb = XLSX.read(new Uint8Array(event.target!.result as ArrayBuffer), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
          const normalized = rows.map(row => {
            const obj: Record<string, string> = {};
            Object.keys(row).forEach(k => {
              const cleanKey = k.replace(/\*/g, '').toLowerCase().trim().replace(/\s+/g, '');
              const val = String(row[k] || '').trim();
              if (val) obj[cleanKey] = val;
            });
            return obj;
          });
          setImportPreview(normalized);
        } catch (err) {
          console.error('Excel parse error:', err);
        } finally {
          setImportPreviewLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target!.result as string;
          const lines = text.split('\n').filter(l => l.trim());
          if (lines.length < 2) { setImportPreviewLoading(false); return; }
          const parseCsvLine = (line: string): string[] => {
            const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
            return matches.map(v => v.replace(/^"|"$/g, '').trim());
          };
          const rawHeaders = parseCsvLine(lines[0]).map(h => h.replace(/\*/g, '').toLowerCase().trim().replace(/\s+/g, ''));
          const data: Record<string, string>[] = [];
          for (let i = 1; i < lines.length; i++) {
            const values = parseCsvLine(lines[i]);
            const obj: Record<string, string> = {};
            rawHeaders.forEach((header, idx) => {
              const val = values[idx] || '';
              if (val) obj[header] = val;
            });
            if (Object.keys(obj).length > 0) data.push(obj);
          }
          setImportPreview(data);
        } catch (err) {
          console.error('CSV parse error:', err);
        } finally {
          setImportPreviewLoading(false);
        }
      };
      reader.readAsText(file, 'UTF-8');
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setCurrentPage(1); // Reset to first page on sort change
  };

  // Server-side filtering handles: search, profile, router, status, sort
  // Client-side filtering handles: session (online/offline), paymentStatus (needs invoice data)
  // Also handle 'global' router filter (users with no routerId) client-side
  const filteredUsers = usersWithOnline.filter((user) => {
    const matchesRouterGlobal = filterRouter !== 'global' || !user.routerId;
    const matchesSession = filterSession === '' || (filterSession === 'online' ? user.isOnline === true : user.isOnline !== true);
    const matchesPaymentStatus = filterPaymentStatus === '' ||
      (filterPaymentStatus === 'unpaid' && (invoiceCounts[user.id] || 0) > 0) ||
      (filterPaymentStatus === 'paid' && !(invoiceCounts[user.id] > 0)) ||
      (filterPaymentStatus === 'isolated' && user.status === 'isolated');
    return matchesRouterGlobal && matchesSession && matchesPaymentStatus;
  });

  // Calculate stats
  const now = nowWIB();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const registrationsThisMonth = usersWithOnline.filter((u) => new Date(u.createdAt) >= startOfMonth).length;
  const renewalsThisMonth = usersWithOnline.filter((u) => {
    const updated = new Date(u.updatedAt);
    const created = new Date(u.createdAt);
    return updated >= startOfMonth && updated.getTime() !== created.getTime();
  }).length;
  const isolatedExpired = usersWithOnline.filter((u) => u.status === 'isolated' || (u.expiredAt && isExpired(u.expiredAt))).length;
  const blockedUsers = usersWithOnline.filter((u) => u.status === 'blocked').length;

  const canView = hasPermission('customers.view');
  const canCreate = hasPermission(PERMISSIONS.CUSTOMERS_CREATE);

  if (!permLoading && !canView) {
    return (<div className="flex flex-col items-center justify-center min-h-[60vh]">
      <Shield className="w-12 h-12 text-muted-foreground mb-3" /><h2 className="text-lg font-bold text-foreground mb-1">{t('pppoe.accessDenied')}</h2>
      <p className="text-xs text-muted-foreground">{t('pppoe.noPermission')}</p></div>);
  }

  if (loading) { return <div className="flex items-center justify-center min-h-[60vh]"><div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse"></div><div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div></div><Loader2 className="w-12 h-12 animate-spin text-brand-500 dark:text-brand-500 dark:drop-shadow-[0_0_20px_rgba(6,182,212,0.6)] relative z-10" /></div>; }

  return (
    <div className="bg-background relative">
      {/* Neon Cyberpunk Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-brand-500 dark:via-white dark:to-pink-500 dark:drop-shadow-[0_0_30px_rgba(6,182,212,0.5)]">{t('pppoe.title')}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('pppoe.subtitle')}</p>
            </div>
            {/* Tombol Kirim Notifikasi di Header */}
            {selectedUsers.size > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowNotificationMenu(!showNotificationMenu)}
                  className="inline-flex items-center px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 gap-1.5"
                >
                  <Bell className="h-3.5 w-3.5" />
                  {t('pppoe.sendNotification')}
                  <span className="bg-primary/100 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                    {selectedUsers.size}
                  </span>
                </button>
                {showNotificationMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded shadow-lg z-50 min-w-[180px]">
                    <button
                      onClick={() => handleOpenNotificationMenu('outage')}
                      className="w-full px-3 py-2 text-xs text-left hover:bg-muted flex items-center gap-2"
                    >
                      <Bell className="h-3.5 w-3.5 text-destructive" />
                      <span>{t('pppoe.outageNotification')}</span>
                    </button>
                    <button
                      onClick={() => handleOpenNotificationMenu('invoice')}
                      className="w-full px-3 py-2 text-xs text-left hover:bg-muted flex items-center gap-2 border-t border-border"
                    >
                      <DollarSign className="h-3.5 w-3.5 text-warning" />
                      <span>{t('pppoe.sendInvoice')}</span>
                    </button>
                    <button
                      onClick={() => handleOpenNotificationMenu('payment')}
                      className="w-full px-3 py-2 text-xs text-left hover:bg-muted flex items-center gap-2 border-t border-border"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      <span>{t('pppoe.paymentReceipt')}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => handleDownloadTemplate('xlsx')} className="inline-flex items-center px-2 py-1.5 text-xs border border-border rounded hover:bg-muted"><Download className="h-3 w-3 mr-1" />{t('pppoe.templateExcel')}</button>
            <button onClick={handleExportExcel} className="inline-flex items-center px-2 py-1.5 text-xs border border-success text-success rounded hover:bg-success/10"><Download className="h-3 w-3 mr-1" />Export</button>
            <button onClick={() => setIsImportDialogOpen(true)} className="inline-flex items-center px-2 py-1.5 text-xs border border-border rounded hover:bg-muted"><Upload className="h-3 w-3 mr-1" />{t('common.import')}</button>
            <button onClick={() => { setIsSyncAuditOpen(true); setAuditData(null); setAuditFixResult(null); setAuditSelectedFixes(new Set()); }} className="inline-flex items-center px-2 py-1.5 text-xs border border-blue-400 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"><GitCompareArrows className="h-3 w-3 mr-1" />Sync Audit</button>
            {canCreate && (<button onClick={() => router.push('/admin/pppoe/users/new')} className="inline-flex items-center px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 text-white rounded"><Plus className="h-3 w-3 mr-1" />{t('pppoe.addUser')}</button>)}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-violet-500/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:border-violet-500/50 transition-all">
            <div className="flex items-center justify-between">
              <div className="min-w-0"><p className="text-[10px] sm:text-xs text-brand-500 uppercase tracking-wide">{t('pppoe.registrationsThisMonth')}</p><p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{registrationsThisMonth}</p></div>
              <UserPlus className="h-5 w-5 sm:h-8 sm:w-8 text-brand-500 drop-shadow-[0_0_15px_rgba(6,182,212,0.6)] flex-shrink-0" />
            </div>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-violet-500/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:border-violet-500/50 transition-all">
            <div className="flex items-center justify-between">
              <div className="min-w-0"><p className="text-[10px] sm:text-xs text-brand-500 uppercase tracking-wide">{t('pppoe.renewalsThisMonth')}</p><p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{renewalsThisMonth}</p></div>
              <RefreshCw className="h-5 w-5 sm:h-8 sm:w-8 text-green-400 drop-shadow-[0_0_15px_rgba(34,197,94,0.6)] flex-shrink-0" />
            </div>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-violet-500/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:border-violet-500/50 transition-all">
            <div className="flex items-center justify-between">
              <div className="min-w-0"><p className="text-[10px] sm:text-xs text-brand-500 uppercase tracking-wide">{t('pppoe.isolatedExpired')}</p><p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{isolatedExpired}</p></div>
              <Clock className="h-5 w-5 sm:h-8 sm:w-8 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.6)] flex-shrink-0" />
            </div>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-violet-500/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:border-violet-500/50 transition-all">
            <div className="flex items-center justify-between">
              <div className="min-w-0"><p className="text-[10px] sm:text-xs text-brand-500 uppercase tracking-wide">{t('pppoe.blockedUsers')}</p><p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{blockedUsers}</p></div>
              <Ban className="h-5 w-5 sm:h-8 sm:w-8 text-red-400 drop-shadow-md shadow-red-500/40 flex-shrink-0" />
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {/* Search bar — always visible */}
          <div className="p-3 flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" placeholder={t('common.search')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-7 py-2 text-sm border border-border rounded-lg bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition ${showFilters ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted border-border text-muted-foreground hover:text-foreground'}`}>
              <Filter className="h-3.5 w-3.5" />
              {t('common.filter') || 'Filter'}
              {(filterProfile || filterRouter || filterStatus || filterSession || filterPaymentStatus) && <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-primary text-primary-foreground">{[filterProfile, filterRouter, filterStatus, filterSession, filterPaymentStatus].filter(Boolean).length}</span>}
            </button>
          </div>

          {/* Collapsible filter panel */}
          {showFilters && (
            <div className="border-t border-border p-3 space-y-3">
              {/* Dropdown filters row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">{t('pppoe.profile')}</label>
                  <select value={filterProfile} onChange={(e) => setFilterProfile(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition">
                    <option value="">{t('pppoe.allProfiles')}</option>
                    {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">NAS / Router</label>
                  <select value={filterRouter} onChange={(e) => setFilterRouter(e.target.value)} className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition">
                    <option value="">{t('pppoe.allNas')}</option>
                    <option value="global">{t('pppoe.global')}</option>
                    {routers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Status filter pills */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">{t('common.status')}</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['', 'active', 'isolated', 'blocked'].map(s => (
                    <button key={s} onClick={() => setFilterStatus(s)} className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition ${filterStatus === s ? (s === '' ? 'bg-teal-600 text-white' : s === 'active' ? 'bg-success text-white' : s === 'isolated' ? 'bg-warning text-white' : 'bg-destructive text-destructive-foreground') : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      {s === '' ? t('common.all') : s === 'active' ? t('pppoe.active') : s === 'isolated' ? t('pppoe.isolir') : t('pppoe.block')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Session filter pills */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block flex items-center gap-1.5">Sesi
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" title="Status sesi diperbarui otomatis setiap 10 detik">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />Live
                  </span>
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[['', 'Semua'], ['online', 'Online'], ['offline', 'Offline']].map(([val, label]) => (
                    <button key={val} onClick={() => setFilterSession(val)} className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition flex items-center gap-1 ${filterSession === val ? (val === 'online' ? 'bg-emerald-600 text-white' : val === 'offline' ? 'bg-gray-500 text-white' : 'bg-teal-600 text-white') : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      {val === 'online' && <span className="w-1.5 h-1.5 rounded-full bg-current" />}{label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment status filter pills */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Pembayaran</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {([['', 'Semua'], ['paid', 'Sudah Bayar'], ['unpaid', 'Belum Bayar'], ['isolated', 'Isolir']] as [string, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setFilterPaymentStatus(val)} className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition ${filterPaymentStatus === val ? (val === '' ? 'bg-teal-600 text-white' : val === 'paid' ? 'bg-success text-white' : val === 'unpaid' ? 'bg-destructive text-white' : 'bg-warning text-white') : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active filter chips + reset + count */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(searchQuery || filterProfile || filterRouter || filterStatus || filterSession || filterPaymentStatus) ? (
                    <>
                      {searchQuery && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md bg-primary/10 text-primary border border-primary/20"><Search className="h-2.5 w-2.5" />{searchQuery.length > 15 ? searchQuery.slice(0, 15) + '…' : searchQuery}<button onClick={() => setSearchQuery('')} className="hover:text-primary/70"><X className="h-2.5 w-2.5" /></button></span>}
                      {filterProfile && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md bg-primary/10 text-primary border border-primary/20">{profiles.find(p => p.id === filterProfile)?.name || 'Profile'}<button onClick={() => setFilterProfile('')} className="hover:text-primary/70"><X className="h-2.5 w-2.5" /></button></span>}
                      {filterRouter && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md bg-primary/10 text-primary border border-primary/20">{filterRouter === 'global' ? t('pppoe.global') : routers.find(r => r.id === filterRouter)?.name || 'NAS'}<button onClick={() => setFilterRouter('')} className="hover:text-primary/70"><X className="h-2.5 w-2.5" /></button></span>}
                      {filterStatus && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md bg-primary/10 text-primary border border-primary/20">{filterStatus === 'active' ? t('pppoe.active') : filterStatus === 'isolated' ? t('pppoe.isolir') : t('pppoe.block')}<button onClick={() => setFilterStatus('')} className="hover:text-primary/70"><X className="h-2.5 w-2.5" /></button></span>}
                      {filterSession && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md bg-primary/10 text-primary border border-primary/20">{filterSession === 'online' ? 'Online' : 'Offline'}<button onClick={() => setFilterSession('')} className="hover:text-primary/70"><X className="h-2.5 w-2.5" /></button></span>}
                      {filterPaymentStatus && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md bg-primary/10 text-primary border border-primary/20">{filterPaymentStatus === 'paid' ? 'Sudah Bayar' : filterPaymentStatus === 'unpaid' ? 'Belum Bayar' : 'Isolir'}<button onClick={() => setFilterPaymentStatus('')} className="hover:text-primary/70"><X className="h-2.5 w-2.5" /></button></span>}
                      <button onClick={() => { setSearchQuery(''); setFilterProfile(''); setFilterRouter(''); setFilterStatus(''); setFilterSession(''); setFilterPaymentStatus(''); }} className="text-[10px] text-destructive hover:text-destructive/80 font-medium ml-1 flex items-center gap-0.5"><X className="h-3 w-3" />{t('common.reset')}</button>
                    </>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">{t('table.showing')} {filteredUsers.length} {t('table.of')} {totalCount}</span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{t('table.showing')} {filteredUsers.length} {t('table.of')} {totalCount}</span>
              </div>
            </div>
          )}
        </div>

        {/* Users Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-medium">{t('pppoe.usersList')}</span>
            {selectedUsers.size > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-muted-foreground">{selectedUsers.size} {t('pppoe.selected')}</span>
                <button onClick={() => handleBulkStatusChange('active')} className="px-1.5 py-0.5 text-[10px] bg-success text-white rounded flex items-center gap-0.5"><Shield className="h-2.5 w-2.5" />{t('pppoe.active')}</button>
                <button onClick={() => handleBulkStatusChange('isolated')} className="px-1.5 py-0.5 text-[10px] bg-warning text-white rounded flex items-center gap-0.5"><ShieldOff className="h-2.5 w-2.5" />{t('pppoe.isolir')}</button>
                <button onClick={() => handleBulkStatusChange('blocked')} className="px-1.5 py-0.5 text-[10px] bg-destructive text-destructive-foreground rounded flex items-center gap-0.5"><Ban className="h-2.5 w-2.5" />{t('pppoe.block')}</button>
                <button onClick={handleExportSelected} className="px-1.5 py-0.5 text-[10px] bg-teal-600 text-white rounded flex items-center gap-0.5"><Download className="h-2.5 w-2.5" />{t('common.export')}</button>
                <button onClick={handleBulkDelete} className="px-1.5 py-0.5 text-[10px] bg-muted text-foreground rounded flex items-center gap-0.5"><Trash2 className="h-2.5 w-2.5" />{t('common.delete')}</button>
              </div>
            )}
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-border">
            {filteredUsers.length === 0 ? (
              <div className="px-3 py-8 text-center text-muted-foreground text-xs">
                {users.length === 0 ? t('pppoe.noUsers') : t('pppoe.noMatch')}
              </div>
            ) : (
              filteredUsers.map((user) => (
                <div key={user.id} className="p-3 space-y-2 active:bg-muted/50 transition-colors">
                  {/* Header: checkbox + username + status badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <input type="checkbox" checked={selectedUsers.has(user.id)} onChange={() => toggleSelectUser(user.id)} className="rounded border-gray-300 w-3.5 h-3.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-xs font-mono font-medium">{user.username}</span>
                          {user.syncedToRadius && (
                            <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-medium bg-accent/20 text-accent">
                              <CheckCircle2 className="h-2 w-2 mr-0.5" />R
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {user.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {invoiceCounts[user.id] > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                          <DollarSign className="h-2 w-2 mr-0.5" />{invoiceCounts[user.id]}
                        </span>
                      )}
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${user.status === 'active' ? 'bg-success/20 text-success' : user.status === 'isolated' ? 'bg-warning/20 text-warning' : 'bg-destructive/20 text-destructive'}`}>{user.status}</span>
                      {user.isOnline
                        ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />Online</span>
                        : <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted text-muted-foreground">Offline</span>
                      }
                    </div>
                  </div>
                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] pl-6">
                    <div className="flex justify-between gap-1">
                      <span className="text-muted-foreground">ID:</span>
                      <span className="font-mono font-medium truncate">{user.customerId || '-'}</span>
                    </div>
                    <div className="flex justify-between gap-1">
                      <span className="text-muted-foreground">HP:</span>
                      <span className="truncate">{user.phone}</span>
                    </div>
                    <div className="flex justify-between gap-1">
                      <span className="text-muted-foreground">{t('pppoe.profile')}:</span>
                      <span className="font-medium truncate">{user.profile?.name || '-'}</span>
                    </div>
                    <div className="flex justify-between gap-1">
                      <span className="text-muted-foreground">{t('common.area')}:</span>
                      <span className="truncate">{user.area?.name || '-'}</span>
                    </div>
                    <div className="flex justify-between gap-1">
                      <span className="text-muted-foreground">{t('pppoe.expired')}:</span>
                      <span className={user.expiredAt && isExpired(user.expiredAt) ? 'text-destructive font-medium' : ''}>
                        {user.expiredAt ? formatWIB(user.expiredAt, 'dd/MM/yyyy') : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-1">
                      <span className="text-muted-foreground">Router:</span>
                      <span className="truncate">{user.router?.name || '-'}</span>
                    </div>
                    <div className="flex justify-between gap-1 col-span-2">
                      <span className="text-muted-foreground">Jenis:</span>
                      <span>
                        {user.subscriptionType === 'PREPAID'
                          ? <span className="text-amber-500">Prepaid</span>
                          : <span className="text-blue-500">Postpaid{user.billingDay ? ` (tgl ${user.billingDay})` : ''}</span>
                        }
                      </span>
                    </div>
                    {user.ipAddress && (
                      <div className="flex justify-between gap-1 col-span-2">
                        <span className="text-muted-foreground">IP:</span>
                        <span className="font-mono">{user.ipAddress}</span>
                      </div>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1 pt-1 border-t border-border/50 flex-wrap">
                    <button onClick={() => handleEdit(user)} className="compact-action p-1.5 text-green-500 hover:bg-green-500/10 rounded cursor-pointer flex items-center justify-center focus:outline-none" aria-label="Lihat detail" title="Lihat detail"><Eye className="h-3.5 w-3.5 pointer-events-none" /></button>
                    <button onClick={() => handleEdit(user)} className="compact-action p-1.5 text-brand-500 hover:bg-brand-500/10 rounded cursor-pointer flex items-center justify-center focus:outline-none" aria-label="Edit" title="Edit"><Pencil className="h-3.5 w-3.5 pointer-events-none" /></button>
                    <button onClick={() => handleSyncToRadius(user)} className="compact-action p-1.5 text-blue-500 hover:bg-blue-500/10 rounded cursor-pointer flex items-center justify-center focus:outline-none" aria-label="Sync RADIUS" title="Sync RADIUS"><RefreshCw className="h-3.5 w-3.5 pointer-events-none" /></button>
                    <button
                      onClick={() => handleStatusChange(user.id, user.status === 'isolated' ? 'active' : 'isolated')}
                      className={`compact-action p-1.5 rounded cursor-pointer flex items-center justify-center focus:outline-none ${user.status === 'isolated' ? 'text-success hover:bg-success/10' : 'text-orange-500 hover:bg-orange-500/10'}`}
                      aria-label={user.status === 'isolated' ? 'Aktifkan' : 'Isolir'}
                      title={user.status === 'isolated' ? 'Aktifkan' : 'Isolir'}
                    >
                      <Shield className="h-3.5 w-3.5 pointer-events-none" />
                    </button>
                    <button onClick={() => setPrintDialogUser(user)} className="compact-action p-1.5 text-purple-500 hover:bg-purple-500/10 rounded cursor-pointer flex items-center justify-center focus:outline-none" aria-label="Cetak Invoice" title="Cetak Invoice"><Printer className="h-3.5 w-3.5 pointer-events-none" /></button>
                    {invoiceCounts[user.id] > 0 ? (
                      <button onClick={() => handleMarkAllPaid(user.id, user.name)} disabled={markingPaid === user.id} className="compact-action px-2 py-1 text-[10px] font-medium bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 ml-auto cursor-pointer focus:outline-none">
                        {markingPaid === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t('pppoe.markPaid')}
                      </button>
                    ) : (
                      <button onClick={() => handleManualExtend(user)} disabled={extending === user.id} className="compact-action p-1.5 text-warning hover:bg-warning/10 rounded disabled:opacity-50 ml-auto cursor-pointer focus:outline-none" aria-label={t('pppoe.extendManual')} title={t('pppoe.extendManual')}>
                        {extending === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3.5 w-3.5 pointer-events-none" />}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full">
              <thead className="bg-gray-50 bg-muted/50">
                <tr>
                  <th className="px-2 py-2 text-center w-8"><input type="checkbox" checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0} onChange={toggleSelectAll} className="rounded border-gray-300 w-3 h-3" /></th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">No Layanan</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase cursor-pointer hover:bg-muted" onClick={() => handleSort('name')}>
                    <div className="flex items-center gap-1">Data Pelanggan <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase cursor-pointer hover:bg-muted" onClick={() => handleSort('username')}>
                    <div className="flex items-center gap-1">PPPoE <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell cursor-pointer hover:bg-muted" onClick={() => handleSort('profile')}>
                    <div className="flex items-center gap-1">Paket <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell">Router/NAS</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden xl:table-cell">Lokasi</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden sm:table-cell cursor-pointer hover:bg-muted" onClick={() => handleSort('createdAt')}>
                    <div className="flex items-center gap-1">Tanggal <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase cursor-pointer hover:bg-muted" onClick={() => handleSort('status')}>
                    <div className="flex items-center gap-1">Status <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Online</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">RADIUS</th>
                  <th className="px-2 py-2 text-center w-10 text-[10px] font-medium text-muted-foreground uppercase sticky right-0 bg-muted/50 z-20">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.length === 0 ? (
                  <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground text-xs">{users.length === 0 ? t('pppoe.noUsers') : t('pppoe.noMatch')}</td></tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/50">
                      <td className="px-2 py-2 text-center"><input type="checkbox" checked={selectedUsers.has(user.id)} onChange={() => toggleSelectUser(user.id)} className="rounded border-gray-300 w-3 h-3" /></td>
                      {/* ID */}
                      <td className="px-3 py-2 text-[10px] font-mono font-medium text-muted-foreground">{user.customerId || '-'}</td>
                      {/* Data Pelanggan */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <>
                              <p className="text-xs font-semibold">{user.name}</p>
                              <p className="text-[10px] text-muted-foreground">{user.phone}</p>
                              {user.email && <p className="text-[10px] text-brand-500 truncate max-w-[140px]">{user.email}</p>}
                            </>
                            {user.area && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 mt-0.5">
                                <MapPin className="h-2 w-2 mr-0.5" />{user.area.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* PPPoE */}
                      <td className="px-3 py-2">
                        <p className="text-xs font-mono font-medium flex items-center gap-1"><span className="text-muted-foreground text-[10px]">User:</span> {user.username}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="text-[10px]">Pass:</span> ••••••</p>
                        {user.ipAddress && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="text-[10px]">IP:</span> {user.ipAddress}</p>}
                        {user.macAddress && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><span className="text-[10px]">MAC:</span> {user.macAddress}</p>}
                        {user.subscriptionType && (
                          <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium mt-0.5 ${user.subscriptionType === 'POSTPAID' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'}`}>{user.subscriptionType}</span>
                        )}
                      </td>
                      {/* Paket */}
                      <td className="px-3 py-2 hidden lg:table-cell">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">{user.profile?.name || '-'}</span>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{user.profile?.groupName || ''}</p>
                      </td>
                      {/* Network */}
                      <td className="px-3 py-2 hidden lg:table-cell">
                        <p className="text-[10px]"><span className="text-muted-foreground">NAS:</span> {user.router?.name || '-'}</p>
                        <p className="text-[10px]"><span className="text-muted-foreground">IP NAS:</span> {user.router?.ipAddress || user.router?.nasname || '-'}</p>
                      </td>
                      {/* Teknis */}
                      <td className="px-3 py-2 hidden xl:table-cell">
                        {user.address && <p className="text-[10px] text-muted-foreground truncate max-w-[140px] flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5 flex-shrink-0" />{user.address}</p>}
                        {user.latitude && user.longitude && (
                          <a
                            href={`https://www.google.com/maps?q=${Number(user.latitude)},${Number(user.longitude)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] text-brand-500 hover:text-brand-500/80 hover:underline cursor-pointer"
                            title="Buka di Google Maps"
                          >
                            <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                            {Number(user.latitude).toFixed(4)}, {Number(user.longitude).toFixed(4)}
                          </a>
                        )}
                        {user.followRoad && <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Follow Road</span>}
                      </td>
                      {/* Tanggal */}
                      <td className="px-3 py-2 text-[10px] hidden sm:table-cell">
                        <p><span className="text-muted-foreground">Daftar:</span> {formatWIB(user.createdAt, 'dd MMM yyyy')}</p>
                        <p className={user.expiredAt && isExpired(user.expiredAt) ? 'text-destructive font-medium' : ''}><span className="text-muted-foreground">Expired:</span> {user.expiredAt ? formatWIB(user.expiredAt, 'dd MMM yyyy') : '-'}</p>
                      </td>
                      {/* Status */}
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${user.status === 'active' ? 'bg-success/20 text-success dark:bg-green-900/30' : user.status === 'isolated' ? 'bg-warning/20 text-warning dark:bg-yellow-900/30' : 'bg-destructive/20 text-destructive dark:bg-red-900/30'}`}>{user.status}</span>
                      </td>
                      {/* Sesi */}
                      <td className="px-3 py-2">
                        {user.isOnline
                          ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />Online</span>
                          : <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted text-muted-foreground">Offline</span>
                        }
                      </td>
                      {/* RADIUS */}
                      <td className="px-3 py-2 hidden md:table-cell">
                        {user.syncedToRadius ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-accent/20 text-accent dark:bg-purple-900/30"><CheckCircle2 className="h-2 w-2 mr-0.5" />Synced</span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted text-muted-foreground">Not synced</span>
                        )}
                      </td>
                      {/* Aksi — Sticky right + Dropdown */}
                      <td className="px-2 py-2 text-center sticky right-0 bg-background z-20 border-l border-border/30">
                        <button
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            if (actionMenuOpen === user.id) {
                              setActionMenuOpen(null);
                            } else {
                              setActionMenuOpen(user.id);
                              setActionMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                            }
                          }}
                          className="compact-action p-1.5 text-muted-foreground hover:bg-muted rounded cursor-pointer focus:outline-none inline-flex items-center justify-center"
                          aria-label="Menu aksi"
                          title="Menu aksi"
                        >
                          <MoreVertical className="h-4 w-4 pointer-events-none" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Server-side Pagination Controls */}
          <div className="px-3 py-2 border-t border-border">
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              total={totalCount}
              limit={pageSize}
              onPageChange={setCurrentPage}
              disabled={usersQuery.isFetching}
              pageSizeOptions={[25, 50, 100, 200]}
              onLimitChange={(v) => { setPageSize(v); setCurrentPage(1); }}
              alwaysVisible
            />
          </div>
        </div>

        {/* Action Dropdown Menu — di luar tabel, fixed positioning agar tidak terpotong */}
        {actionMenuOpen && actionMenuPos && (() => {
          const user = filteredUsers.find(u => u.id === actionMenuOpen);
          if (!user) return null;
          return (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setActionMenuOpen(null)} />
              <div
                className="fixed min-w-[180px] max-h-[calc(100vh-20px)] overflow-y-auto bg-background border border-border rounded-lg shadow-lg py-1 text-left z-50"
                style={{ top: Math.min(actionMenuPos.top, window.innerHeight - 260), right: actionMenuPos.right }}
              >
                <button onClick={() => { handleEdit(user); setActionMenuOpen(null); }} className="w-full px-3 py-2 text-xs text-left hover:bg-muted flex items-center gap-2 cursor-pointer">
                  <Eye className="h-3.5 w-3.5 text-green-500" /> Lihat Detail
                </button>
                <button onClick={() => { handleEdit(user); setActionMenuOpen(null); }} className="w-full px-3 py-2 text-xs text-left hover:bg-muted flex items-center gap-2 cursor-pointer">
                  <Pencil className="h-3.5 w-3.5 text-brand-500" /> Edit
                </button>
                <button onClick={() => { handleSyncToRadius(user); setActionMenuOpen(null); }} className="w-full px-3 py-2 text-xs text-left hover:bg-muted flex items-center gap-2 cursor-pointer">
                  <RefreshCw className="h-3.5 w-3.5 text-blue-500" /> Sync RADIUS
                </button>
                <button onClick={() => { handleStatusChange(user.id, user.status === 'isolated' ? 'active' : 'isolated'); setActionMenuOpen(null); }} className="w-full px-3 py-2 text-xs text-left hover:bg-muted flex items-center gap-2 cursor-pointer">
                  <Shield className={`h-3.5 w-3.5 ${user.status === 'isolated' ? 'text-success' : 'text-orange-500'}`} />
                  {user.status === 'isolated' ? 'Aktifkan' : 'Isolir'}
                </button>
                <button onClick={() => { handleStopSubscription(user); setActionMenuOpen(null); }} className="w-full px-3 py-2 text-xs text-left hover:bg-destructive/10 text-destructive flex items-center gap-2 cursor-pointer">
                  <Ban className="h-3.5 w-3.5" /> Stop & Hapus
                </button>
                <button onClick={() => { setPrintDialogUser(user); setActionMenuOpen(null); }} className="w-full px-3 py-2 text-xs text-left hover:bg-muted flex items-center gap-2 cursor-pointer">
                  <Printer className="h-3.5 w-3.5 text-purple-500" /> Cetak Invoice
                </button>
                <button onClick={() => { handleManualExtend(user); setActionMenuOpen(null); }} disabled={extending === user.id} className="w-full px-3 py-2 text-xs text-left hover:bg-muted flex items-center gap-2 cursor-pointer disabled:opacity-50">
                  {extending === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" /> : <Zap className="h-3.5 w-3.5 text-warning" />}
                  {t('pppoe.extendManual')}
                </button>
                <button onClick={() => { handleEdit(user); setActionMenuOpen(null); }} className="w-full px-3 py-2 text-xs text-left hover:bg-muted flex items-center gap-2 cursor-pointer">
                  <Hand className="h-3.5 w-3.5 text-amber-500" /> Janji Bayar
                </button>
              </div>
            </>
          );
        })()}

        {/* Add New User Dialog */}
        <AddPppoeUserModal
          isOpen={isDialogOpen && !editingUser}
          onClose={() => { setIsDialogOpen(false); setEditingUser(null); }}
          onSuccess={() => invalidateUserData()}
          profiles={profiles}
          routers={routers}
          areas={areas}
        />

        {/* Map Picker (edit flow only — add flow has its own MapPicker inside AddPppoeUserModal) */}
        <MapPicker isOpen={showMapPicker} onClose={() => setShowMapPicker(false)} onSelect={(lat, lng) => { const latStr = lat.toFixed(6); const lonStr = lng.toFixed(6); setMapPickerLat(latStr); setMapPickerLon(lonStr); setModalLatLng({ lat: latStr, lng: lonStr }); }} initialLat={mapPickerLat ? parseFloat(mapPickerLat) : undefined} initialLng={mapPickerLon ? parseFloat(mapPickerLon) : undefined} />

        {/* Import Dialog */}
        <SimpleModal isOpen={isImportDialogOpen} onClose={() => { setIsImportDialogOpen(false); setImportFile(null); setImportResult(null); setImportPreview([]); }} size="xl">
          <ModalHeader>
            <ModalTitle className="flex items-center gap-2"><Upload className="h-4 w-4 text-primary" />{t('pppoe.importCsv')}</ModalTitle>
            <ModalDescription>{t('pppoe.uploadCsvOrExcel')}</ModalDescription>
          </ModalHeader>
          <ModalBody className="space-y-4 max-h-[65vh] overflow-y-auto">
            {/* Info banner */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-lg text-xs text-blue-700 dark:text-blue-300">
              Profile dan NAS/Router akan diambil otomatis dari kolom <strong>Profile</strong> dan <strong>Router</strong> dalam file. Jika profile tidak ditemukan, pelanggan tetap diimpor dan bisa di-assign manual setelahnya. Gunakan file hasil Export untuk memastikan format yang benar.
            </div>

            {/* Collapsible Column Guide */}
            <div className="border border-border dark:border-violet-500/30 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowImportGuide(!showImportGuide)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/50 dark:bg-card/50 hover:bg-muted transition-colors text-xs font-medium text-foreground"
              >
                <span className="flex items-center gap-2"><BookOpen className="h-3.5 w-3.5 text-primary" />Panduan Kolom Template & Referensi</span>
                {showImportGuide ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {showImportGuide && (
                <div className="p-3 space-y-3 bg-card/50 dark:bg-card/30">
                  {/* Required columns */}
                  <div>
                    <h5 className="text-[11px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wide mb-1.5 flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full" />Wajib</h5>
                    <div className="space-y-1">
                      {[
                        { col: 'Username', desc: 'Username unik PPPoE untuk login, tanpa spasi', ex: 'user001' },
                        { col: 'Password', desc: 'Password PPPoE. Kosong = auto-generate dari sistem', ex: 'pass123' },
                        { col: 'Nama Lengkap', desc: 'Nama lengkap pelanggan', ex: 'Budi Santoso' },
                        { col: 'No. Telepon', desc: 'Nomor HP/telepon pelanggan', ex: '08123456789' },
                      ].map(item => (
                        <div key={item.col} className="flex items-start gap-2 text-[11px] py-1 border-b border-border/50 last:border-0">
                          <code className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-mono whitespace-nowrap flex-shrink-0 min-w-[110px]">{item.col}</code>
                          <div className="flex-1 min-w-0">
                            <span className="text-foreground">{item.desc}</span>
                            <span className="text-muted-foreground ml-1.5">— contoh: <code className="bg-muted px-1 rounded text-[10px]">{item.ex}</code></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommended columns */}
                  <div>
                    <h5 className="text-[11px] font-bold text-amber-500 dark:text-amber-400 uppercase tracking-wide mb-1.5 flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full" />Disarankan</h5>
                    <div className="space-y-1">
                      {[
                        { col: 'Profile', desc: 'Nama paket/profile PPPoE. Harus sama persis dengan nama di sistem. Jika tidak ditemukan, user tetap diimpor tanpa profile', ex: 'Paket 10Mbps' },
                        { col: 'Tipe Langganan', desc: 'POSTPAID (tagihan bulanan) atau PREPAID (bayar dulu). Kosong = POSTPAID', ex: 'POSTPAID' },
                        { col: 'Router', desc: 'Nama router/NAS yang terdaftar di sistem. Kosong = global (tidak terikat router)', ex: 'Router Utama' },
                        { col: 'Tagihan Pertama', desc: 'none = tidak buat invoice, prorate = prorata sesuai tanggal daftar, full = full amount. Hanya untuk PREPAID dengan profile', ex: 'prorate' },
                      ].map(item => (
                        <div key={item.col} className="flex items-start gap-2 text-[11px] py-1 border-b border-border/50 last:border-0">
                          <code className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-mono whitespace-nowrap flex-shrink-0 min-w-[110px]">{item.col}</code>
                          <div className="flex-1 min-w-0">
                            <span className="text-foreground">{item.desc}</span>
                            <span className="text-muted-foreground ml-1.5">— contoh: <code className="bg-muted px-1 rounded text-[10px]">{item.ex}</code></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Optional columns */}
                  <div>
                    <h5 className="text-[11px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wide mb-1.5 flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full" />Opsional</h5>
                    <div className="space-y-1">
                      {[
                        { col: 'ID Pelanggan', desc: 'Kosongkan untuk auto-generate. Isi jika ingin ID custom', ex: '(kosong)' },
                        { col: 'Email', desc: 'Email pelanggan untuk notifikasi invoice', ex: 'budi@email.com' },
                        { col: 'Alamat', desc: 'Alamat lengkap pelanggan', ex: 'Jl. Merdeka No. 10' },
                        { col: 'Area/Wilayah', desc: 'Nama area yang sudah terdaftar di sistem (auto-resolved by name)', ex: 'Cluster A' },
                        { col: 'IP Address', desc: 'IP static untuk pelanggan (Framed-IP-Address). Kosongkan untuk DHCP', ex: '10.10.10.2' },
                        { col: 'MAC Address', desc: 'MAC address perangkat pelanggan. Format AA:BB:CC:DD:EE:FF', ex: 'AA:BB:CC:DD:EE:FF' },
                        { col: 'Tanggal Expired', desc: 'Format YYYY-MM-DD. Khusus PREPAID — tanggal berakhir layanan', ex: '2026-12-31' },
                        { col: 'Hari Tagihan', desc: 'Tanggal tagihan bulanan (1-31). Khusus POSTPAID', ex: '1' },
                        { col: 'Latitude', desc: 'Koordinat GPS lintang', ex: '-6.200000' },
                        { col: 'Longitude', desc: 'Koordinat GPS bujur', ex: '106.816666' },
                        { col: 'Auto Isolasi', desc: 'true = auto isolir saat expired, false = tidak. Default true', ex: 'true' },
                        { col: 'Komentar', desc: 'Catatan/keterangan internal untuk pelanggan', ex: 'Pelanggan VIP' },
                        { col: 'Tanggal Register', desc: 'Format YYYY-MM-DD. Tanggal pendaftaran pelanggan. Kosong = hari ini', ex: '2026-01-15' },
                      ].map(item => (
                        <div key={item.col} className="flex items-start gap-2 text-[11px] py-1 border-b border-border/50 last:border-0">
                          <code className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-mono whitespace-nowrap flex-shrink-0 min-w-[110px]">{item.col}</code>
                          <div className="flex-1 min-w-0">
                            <span className="text-foreground">{item.desc}</span>
                            <span className="text-muted-foreground ml-1.5">— contoh: <code className="bg-muted px-1 rounded text-[10px]">{item.ex}</code></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-3 px-2 py-1.5 bg-muted/30 dark:bg-card/40 rounded text-[10px] border border-border/50">
                    <span className="text-red-500 font-semibold">● Wajib</span>
                    <span className="text-amber-500 font-semibold">● Disarankan</span>
                    <span className="text-muted-foreground">● Opsional</span>
                  </div>

                  {/* Tips */}
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-500/25 rounded text-[11px] text-amber-700 dark:text-amber-300">
                    <p className="font-medium flex items-center gap-1 mb-1"><Info className="h-3 w-3" />Tips Import</p>
                    <ul className="space-y-0.5 ml-4 list-disc">
                      <li>Download template Excel/CSV terlebih dahulu untuk format yang sudah benar</li>
                      <li>Kolom <strong>Profile</strong> dan <strong>Router</strong> harus sama persis dengan nama yang terdaftar di sistem</li>
                      <li>Untuk <strong>PREPAID</strong>, isi Tanggal Expired. Untuk <strong>POSTPAID</strong>, isi Hari Tagihan</li>
                      <li>Jika username sudah ada di database, data akan di-update (upsert)</li>
                      <li>Password kosong akan auto-generate. Username + password wajib untuk PPPoE</li>
                      <li>Jika Profile tidak ditemukan, pelanggan tetap diimpor — assign paket manual setelah import</li>
                      <li>Maksimal 1000 baris per import</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* File input */}
            <div>
              <ModalLabel required>{t('pppoe.selectFile')}</ModalLabel>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={handleImportFileChange} className="w-full px-3 py-2 text-xs bg-background dark:bg-card border border-border dark:border-violet-500/40 rounded-lg text-foreground file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/20 dark:file:bg-violet-500/30 file:text-foreground hover:file:bg-primary/30 dark:hover:file:bg-violet-500/50 focus:border-primary dark:focus:border-brand-500 focus:ring-1 focus:ring-primary/30 dark:focus:ring-brand-500/30 transition-all" />
              <p className="text-[9px] text-muted-foreground mt-1">{t('pppoe.csvExcelFormat')}</p>
            </div>

            {/* File selected + Preview */}
            {importFile && (
              <div className="p-3 border border-border dark:border-violet-500/30 rounded-lg bg-muted/30 dark:bg-card/50 text-xs space-y-3">
                {/* File info */}
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="font-medium text-foreground truncate">{importFile.name}</span>
                  <span className="text-muted-foreground flex-shrink-0">({(importFile.size / 1024).toFixed(1)} KB)</span>
                </div>

                {/* Loading state */}
                {importPreviewLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <RefreshCcw className="h-3 w-3 animate-spin" />
                    <span>Memuat preview...</span>
                  </div>
                )}

                {/* Preview summary + table */}
                {!importPreviewLoading && importPreview.length > 0 && (() => {
                  const validRows = importPreview.filter(r => r.username && r.name && r.phone);
                  const skipRows = importPreview.filter(r => !r.username || !r.name || !r.phone);
                  const noProfileRows = importPreview.filter(r => r.username && r.name && r.phone && !r.profile);
                  return (
                    <div className="space-y-2">
                      {/* Summary badges */}
                      <div className="flex gap-2 flex-wrap items-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-[10px] font-semibold">
                          <CheckCircle2 className="h-3 w-3" />{validRows.length} akan diimpor
                        </span>
                        {noProfileRows.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-[10px] font-semibold">
                            <AlertTriangle className="h-3 w-3" />{noProfileRows.length} tanpa paket
                          </span>
                        )}
                        {skipRows.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-[10px] font-semibold">
                            <XCircle className="h-3 w-3" />{skipRows.length} dilewati (data tidak lengkap)
                          </span>
                        )}
                      </div>

                      {/* Preview table */}
                      <div className="overflow-x-auto rounded border border-border/50">
                        <table className="w-full border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-muted/50 dark:bg-card/60 text-left">
                              <th className="px-2 py-1 font-medium text-muted-foreground">#</th>
                              <th className="px-2 py-1 font-medium text-muted-foreground">Username</th>
                              <th className="px-2 py-1 font-medium text-muted-foreground">Nama</th>
                              <th className="px-2 py-1 font-medium text-muted-foreground">Telepon</th>
                              <th className="px-2 py-1 font-medium text-muted-foreground">Profile</th>
                              <th className="px-2 py-1 font-medium text-muted-foreground">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.slice(0, 8).map((row, i) => {
                              const isValid = row.username && row.name && row.phone;
                              const hasProfile = !!row.profile;
                              return (
                                <tr key={i} className={`border-t border-border/40 ${!isValid ? 'opacity-50' : ''}`}>
                                  <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                                  <td className="px-2 py-1 font-medium text-foreground">{row.username || <span className="text-red-500 italic">kosong</span>}</td>
                                  <td className="px-2 py-1 text-foreground">{row.name || <span className="text-muted-foreground">—</span>}</td>
                                  <td className="px-2 py-1 text-foreground">{row.phone || <span className="text-muted-foreground">—</span>}</td>
                                  <td className="px-2 py-1 text-foreground">{row.profile || <span className="text-amber-500 italic">tanpa paket</span>}</td>
                                  <td className="px-2 py-1">
                                    {!isValid ? (
                                      <span className="text-red-500 font-semibold">✗ Dilewati</span>
                                    ) : !hasProfile ? (
                                      <span className="text-amber-500 font-semibold">⚠ Tanpa paket</span>
                                    ) : (
                                      <span className="text-green-600 dark:text-green-400">✓ OK</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {importPreview.length > 8 && (
                        <p className="text-[10px] text-muted-foreground italic text-center">... dan {importPreview.length - 8} baris lainnya</p>
                      )}
                    </div>
                  );
                })()}

                {/* Empty preview (parsed but no valid rows) */}
                {!importPreviewLoading && importPreview.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">File dipilih. Klik tombol Import untuk mulai mengunggah.</p>
                )}
              </div>
            )}
            {importResult && (
              <div className="p-3 border border-border dark:border-violet-500/30 rounded-lg bg-muted/30 dark:bg-card/50 text-xs max-h-60 overflow-y-auto">
                <div className="flex items-center gap-1 text-green-600 dark:text-green-500 mb-2"><CheckCircle2 className="h-3 w-3" />{importResult.success} {t('common.create')}{importResult.updated > 0 && <span className="ml-2 text-blue-500 dark:text-brand-500">· {importResult.updated} Diperbarui</span>}</div>
                {importResult.failed > 0 && (
                  <div className="text-red-500 dark:text-red-500">
                    <div className="font-medium mb-1">{importResult.failed} {t('notifications.failed')}</div>
                    {importResult.errors && importResult.errors.length > 0 && (
                      <div className="space-y-1 mt-2 text-[10px]">
                        {importResult.errors.map((error: { line: number; username?: string; error: string }, idx: number) => (
                          <div key={idx} className="p-1.5 bg-red-50 dark:bg-red-500/10 rounded border border-red-300 dark:border-red-500/30">
                            <div className="font-medium text-foreground">Baris {error.line}: {error.username || 'N/A'}</div>
                            <div className="text-red-500 dark:text-red-500">{error.error}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <ModalButton variant="secondary" onClick={() => { setIsImportDialogOpen(false); setImportFile(null); setImportResult(null); setImportPreview([]); }}>{t('common.cancel')}</ModalButton>
            <ModalButton variant="primary" onClick={handleImport} disabled={!importFile || importing}>{importing ? t('notifications.processing') : t('common.import')}</ModalButton>
          </ModalFooter>
        </SimpleModal>

        {/* Edit User Modal */}
        <UserDetailModal isOpen={isDialogOpen && !!editingUser} onClose={() => { setIsDialogOpen(false); setEditingUser(null); setModalLatLng(undefined); }} user={editingUser} onSave={handleSaveUser} profiles={profiles} routers={routers} areas={areas} currentLatLng={modalLatLng} onLatLngChange={(lat, lng) => { setMapPickerLat(lat); setMapPickerLon(lng); setShowMapPicker(true); }} />

        {/* Delete Dialog */}
        <SimpleModal isOpen={!!deleteUserId} onClose={() => { setDeleteUserId(null); setDeletePassword(''); }} size="sm">
          <ModalBody className="text-center py-6">
            <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-red-500/50">
              <Trash2 className="w-7 h-7 text-[#ff6b8a]" />
            </div>
            <h2 className="text-base font-bold text-foreground mb-2">{t('pppoe.deleteUser')}</h2>
            <p className="text-xs text-muted-foreground mb-4">{t('pppoe.deleteConfirm')}</p>
            <div className="text-left">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                🔒 Password Superadmin
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Masukkan password superadmin"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded dark:bg-card dark:border-violet-500/30 focus:ring-2 focus:ring-destructive/30"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && !deleting) handleDelete(); }}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Demi keamanan, masukkan password superadmin untuk mengonfirmasi penghapusan pelanggan. Hanya Super Admin yang dapat menghapus pelanggan.
              </p>
            </div>
          </ModalBody>
          <ModalFooter className="justify-center">
            <ModalButton variant="secondary" onClick={() => { setDeleteUserId(null); setDeletePassword(''); }}>{t('common.cancel')}</ModalButton>
            <ModalButton variant="danger" onClick={handleDelete} disabled={deleting || !deletePassword.trim()}>
              {deleting ? 'Menghapus...' : t('common.delete')}
            </ModalButton>
          </ModalFooter>
        </SimpleModal>

        {/* Bulk Delete Dialog */}
        <SimpleModal isOpen={bulkDeleteModalOpen} onClose={() => { setBulkDeleteModalOpen(false); setBulkDeletePassword(''); }} size="sm">
          <ModalBody className="text-center py-6">
            <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-red-500/50">
              <Trash2 className="w-7 h-7 text-[#ff6b8a]" />
            </div>
            <h2 className="text-base font-bold text-foreground mb-2">{t('pppoe.deleteUser')}</h2>
            <p className="text-xs text-muted-foreground mb-4">{selectedUsers.size} pelanggan akan dihapus permanen.</p>
            <div className="text-left">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                🔒 Password Superadmin
              </label>
              <input
                type="password"
                value={bulkDeletePassword}
                onChange={(e) => setBulkDeletePassword(e.target.value)}
                placeholder="Masukkan password superadmin"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded dark:bg-card dark:border-violet-500/30 focus:ring-2 focus:ring-destructive/30"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && !bulkDeleting && bulkDeletePassword.trim()) confirmBulkDelete(); }}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Demi keamanan, masukkan password superadmin untuk mengonfirmasi penghapusan massal pelanggan.
              </p>
            </div>
          </ModalBody>
          <ModalFooter className="justify-center">
            <ModalButton variant="secondary" onClick={() => { setBulkDeleteModalOpen(false); setBulkDeletePassword(''); }}>{t('common.cancel')}</ModalButton>
            <ModalButton variant="danger" onClick={confirmBulkDelete} disabled={bulkDeleting || !bulkDeletePassword.trim()}>
              {bulkDeleting ? 'Menghapus...' : t('common.delete')}
            </ModalButton>
          </ModalFooter>
        </SimpleModal>

        {/* Sync Audit Dialog */}
        <SimpleModal isOpen={isSyncAuditOpen} onClose={() => { setIsSyncAuditOpen(false); setAuditData(null); setAuditFixResult(null); setAuditSelectedFixes(new Set()); }} size="xl">
          <ModalHeader>
            <ModalTitle className="flex items-center gap-2"><GitCompareArrows className="h-4 w-4 text-blue-500" />Sync Audit: DB vs MikroTik</ModalTitle>
            <ModalDescription>Bandingkan data PPPoE di database dengan PPP secret di MikroTik. Deteksi perbedaan password, profile, status, dan missing users.</ModalDescription>
          </ModalHeader>
          <ModalBody className="space-y-4">
            {/* Router selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <ModalLabel>Pilih Router/NAS</ModalLabel>
                <ModalSelect value={auditRouterId} onChange={(e) => setAuditRouterId(e.target.value)}>
                  <option value="">— Pilih Router —</option>
                  {routers.map(r => (
                    <option key={r.id} value={r.id} className="dark:bg-gray-800">{r.name} ({r.ipAddress || r.nasname})</option>
                  ))}
                </ModalSelect>
              </div>
              <div className="flex items-end">
                <button onClick={handleSyncAudit} disabled={!auditRouterId || auditLoading} className="w-full px-3 py-2 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-md disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
                  {auditLoading ? (<><RefreshCcw className="h-3 w-3 animate-spin" />Memeriksa...</>) : (<><Search className="h-3 w-3" />Mulai Audit</>)}
                </button>
              </div>
            </div>

            {/* Error */}
            {auditData?.error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Gagal koneksi ke MikroTik</p>
                  <p className="mt-0.5">{auditData.error}</p>
                </div>
              </div>
            )}

            {/* Stats */}
            {auditData && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{auditData.stats.dbCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">DB Users</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{auditData.stats.mtCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">MikroTik Secrets</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{auditData.stats.matched}</p>
                  <p className="text-[10px] text-green-700 dark:text-green-300 mt-1">Matched</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-500/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{auditData.differences.length}</p>
                  <p className="text-[10px] text-orange-700 dark:text-orange-300 mt-1">Differences</p>
                </div>
              </div>
            )}

            {/* Differences list */}
            {auditData && auditData.differences.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    Perbedaan Ditemukan ({auditData.differences.length})
                  </h4>
                  <div className="flex gap-2">
                    <button onClick={() => { const all = new Set<string>(); auditData.differences.forEach((d, i) => all.add(`${d.username}::${d.type}::${i}`)); setAuditSelectedFixes(all); }} className="text-[10px] px-2 py-1 border border-border rounded hover:bg-muted">Select All</button>
                    <button onClick={() => setAuditSelectedFixes(new Set())} className="text-[10px] px-2 py-1 border border-border rounded hover:bg-muted">Clear</button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto space-y-1.5">
                  {auditData.differences.map((diff, i) => {
                    const fixKey = `${diff.username}::${diff.type}::${i}`;
                    const isSelected = auditSelectedFixes.has(fixKey);
                    const typeColors: Record<string, string> = {
                      missing_in_mikrotik: 'border-l-red-500 bg-red-50 dark:bg-red-900/10',
                      missing_in_db: 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/10',
                      password_mismatch: 'border-l-orange-500 bg-orange-50 dark:bg-orange-900/10',
                      profile_mismatch: 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/10',
                      status_mismatch: 'border-l-purple-500 bg-purple-50 dark:bg-purple-900/10',
                    };
                    const typeIcons: Record<string, ReactNode> = {
                      missing_in_mikrotik: <XCircle className="h-3.5 w-3.5 text-red-500" />,
                      missing_in_db: <AlertCircle className="h-3.5 w-3.5 text-blue-500" />,
                      password_mismatch: <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />,
                      profile_mismatch: <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />,
                      status_mismatch: <AlertTriangle className="h-3.5 w-3.5 text-purple-500" />,
                    };
                    return (
                      <label key={fixKey} className={`flex items-start gap-2 p-2.5 border-l-4 rounded-r-lg cursor-pointer transition-all ${typeColors[diff.type] || 'border-l-gray-500'} ${isSelected ? 'ring-1 ring-primary' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const next = new Set(auditSelectedFixes);
                            if (e.target.checked) next.add(fixKey); else next.delete(fixKey);
                            setAuditSelectedFixes(next);
                          }}
                          className="mt-0.5 rounded border-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {typeIcons[diff.type]}
                            <span className="text-xs font-mono font-medium text-foreground">{diff.username}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">{diff.type.replace(/_/g, ' ')}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">{diff.message}</p>
                          {(diff.db.password || diff.mikrotik.password) && diff.type === 'password_mismatch' && (
                            <div className="text-[10px] mt-1 flex gap-3">
                              <span className="text-foreground">DB: <code className="bg-muted px-1 rounded">{diff.db.password}</code></span>
                              <span className="text-foreground">MT: <code className="bg-muted px-1 rounded">{diff.mikrotik.password}</code></span>
                            </div>
                          )}
                          {(diff.db.profile || diff.mikrotik.profile) && diff.type === 'profile_mismatch' && (
                            <div className="text-[10px] mt-1 flex gap-3">
                              <span className="text-foreground">DB: <code className="bg-muted px-1 rounded">{diff.db.profile || '(kosong)'}</code></span>
                              <span className="text-foreground">MT: <code className="bg-muted px-1 rounded">{diff.mikrotik.profile || '(kosong)'}</code></span>
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No differences */}
            {auditData && auditData.differences.length === 0 && !auditData.error && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCheck className="h-12 w-12 text-green-500 mb-2" />
                <p className="text-sm font-medium text-foreground">Semua data sinkron!</p>
                <p className="text-xs text-muted-foreground mt-1">Tidak ada perbedaan antara database dan MikroTik</p>
              </div>
            )}

            {/* Fix result */}
            {auditFixResult && (
              <div className={`p-3 rounded-lg border text-xs ${auditFixResult.stats.failed > 0 ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-500/30 text-orange-700 dark:text-orange-300' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-300'}`}>
                <p className="font-medium">{auditFixResult.message}</p>
                {auditFixResult.results.some(r => !r.success) && (
                  <div className="mt-2 space-y-1">
                    <p className="font-medium">Detail kegagalan:</p>
                    {auditFixResult.results.filter(r => !r.success).map((r, i) => (
                      <p key={i} className="text-[10px]">• {r.username}: {r.message}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <ModalButton variant="secondary" onClick={() => { setIsSyncAuditOpen(false); setAuditData(null); setAuditFixResult(null); setAuditSelectedFixes(new Set()); }}>Tutup</ModalButton>
            <ModalButton variant="primary" onClick={handleSyncAuditFix} disabled={auditSelectedFixes.size === 0 || auditFixing}>
              {auditFixing ? (<><RefreshCcw className="h-3 w-3 animate-spin mr-1" />Memperbaiki...</>) : (<><CheckCheck className="h-3 w-3 mr-1" />Fix Selected ({auditSelectedFixes.size})</>)}
            </ModalButton>
          </ModalFooter>
        </SimpleModal>

        {/* Sync from MikroTik Dialog */}
        <SimpleModal isOpen={isSyncDialogOpen} onClose={() => { setIsSyncDialogOpen(false); setSyncPreview(null); setSyncResult(null); }} size="xl">
          <ModalHeader>
            <ModalTitle className="flex items-center gap-2"><RefreshCcw className="h-4 w-4 text-brand-500" />{t('pppoe.syncPppoeTitle')}</ModalTitle>
            <ModalDescription>{t('pppoe.syncPppoeDesc')}</ModalDescription>
          </ModalHeader>
          <ModalBody className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <ModalLabel required>{t('pppoe.selectRouter')}</ModalLabel>
                <ModalSelect value={syncRouterId} onChange={(e) => { setSyncRouterId(e.target.value); setSyncPreview(null); setSyncResult(null); }}>
                  <option value="" className="dark:bg-card">-- Pilih Router --</option>
                  {routers.map((r) => <option key={r.id} value={r.id} className="dark:bg-card">{r.name} ({r.ipAddress})</option>)}
                </ModalSelect>
              </div>
              <div>
                <ModalLabel required>{t('pppoe.targetProfile')}</ModalLabel>
                <ModalSelect value={syncProfileId} onChange={(e) => setSyncProfileId(e.target.value)}>
                  <option value="" className="dark:bg-card">{t('pppoe.selectProfile')}</option>
                  {profiles.map((p) => <option key={p.id} value={p.id} className="dark:bg-card">{p.name} - Rp {p.price.toLocaleString('id-ID')}</option>)}
                </ModalSelect>
              </div>
            </div>
            <button onClick={handleSyncPreview} disabled={!syncRouterId || syncLoading} className="w-full px-3 py-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-md disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 transition-all dark:bg-gradient-to-r dark:from-brand-500 dark:to-violet-500 dark:hover:from-brand-500/80 dark:hover:to-violet-500/80 dark:text-white dark:shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              {syncLoading ? (<><RefreshCcw className="h-3 w-3 animate-spin" />{t('pppoe.fetchingFromMikrotik')}</>) : (<><Search className="h-3 w-3" />{t('pppoe.previewSecrets')}</>)}
            </button>
            {syncPreview && (
              <div className="border border-border dark:border-violet-500/40 rounded-lg overflow-hidden bg-muted/30 dark:bg-card/50">
                <div className="px-3 py-2 bg-muted/50 dark:bg-violet-500/10 border-b border-border dark:border-violet-500/30 flex items-center justify-between">
                  <div className="text-xs">
                    <span className="font-medium text-foreground">{syncPreview.router?.name}</span>
                    <span className="text-muted-foreground ml-2">Total: {syncPreview.data?.total} | Baru: <span className="text-green-600 dark:text-green-500 font-medium">{syncPreview.data?.new}</span> | Sudah ada: <span className="text-orange-500 dark:text-[#ff8c00]">{syncPreview.data?.existing}</span></span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleSyncSelectAll(true)} className="text-[10px] text-primary dark:text-brand-500 hover:underline">{t('pppoe.selectAllNew')}</button>
                    <button onClick={() => toggleSyncSelectAll(false)} className="text-[10px] text-muted-foreground hover:underline">{t('pppoe.deselectAll')}</button>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted dark:bg-card sticky top-0">
                      <tr><th className="px-2 py-1.5 w-8"></th><th className="px-2 py-1.5 text-left text-foreground">{t('pppoe.username')}</th><th className="px-2 py-1.5 text-left text-foreground">{t('pppoe.profileMikrotik')}</th><th className="px-2 py-1.5 text-left text-foreground">{t('pppoe.ipAddress')}</th><th className="px-2 py-1.5 text-left text-foreground">{t('pppoe.statusLabel')}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border dark:divide-violet-500/20">
                      {syncPreview.data?.secrets?.map((secret: SyncPreviewSecretExtended) => (
                        <tr key={secret.username} className={`${secret.isNew ? 'bg-green-50 dark:bg-green-500/5' : 'bg-muted/50 dark:bg-violet-500/5'} ${secret.disabled ? 'opacity-50' : ''}`}>
                          <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={syncSelectedUsers.has(secret.username)} onChange={() => toggleSyncSelectUser(secret.username)} disabled={!secret.isNew || secret.disabled} className="w-3 h-3 rounded accent-primary dark:accent-brand-500" /></td>
                          <td className="px-2 py-1.5 font-mono text-foreground">{secret.username}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{secret.profile}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{secret.remoteAddress || '-'}</td>
                          <td className="px-2 py-1.5">
                            {secret.disabled ? (<span className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[9px]">{t('pppoe.disabledLabel')}</span>) : secret.isNew ? (<span className="px-1.5 py-0.5 bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-500 rounded text-[9px]">{t('pppoe.new')}</span>) : (<span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 dark:bg-[#ff8c00]/20 dark:text-[#ff8c00] rounded text-[9px]">{t('pppoe.existing')}</span>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {syncSelectedUsers.size > 0 && (<div className="px-3 py-2 bg-primary/10 dark:bg-brand-500/10 border-t border-primary/30 dark:border-brand-500/30 text-xs text-primary dark:text-brand-500">✓ {syncSelectedUsers.size} {t('pppoe.usersSelectedToImport')}</div>)}
              </div>
            )}
            {syncResult && (
              <div className={`p-3 rounded-lg border ${syncResult.stats?.failed > 0 ? 'bg-orange-50 dark:bg-[#ff8c00]/10 border-orange-300 dark:border-[#ff8c00]/30' : 'bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-500/30'}`}>
                <div className="text-xs space-y-1">
                  <div className="font-medium text-foreground">{syncResult.message}</div>
                  <div className="flex gap-4 text-[10px]">
                    <span className="text-green-600 dark:text-green-500">✓ Imported: {syncResult.stats?.imported}</span>
                    <span className="text-orange-500 dark:text-[#ff8c00]">⊘ Skipped: {syncResult.stats?.skipped}</span>
                    <span className="text-red-500 dark:text-red-500">✗ Failed: {syncResult.stats?.failed}</span>
                  </div>
                  {syncResult.errors && syncResult.errors.length > 0 && (<div className="mt-2 text-[10px] text-red-500 dark:text-red-500">Errors: {syncResult.errors.map((e: { username: string; error: string }) => `${e.username}: ${e.error}`).join(', ')}</div>)}
                </div>
              </div>
            )}
            <div className="p-3 bg-primary/10 dark:bg-brand-500/10 border border-primary/30 dark:border-brand-500/30 rounded-lg text-[10px] text-primary dark:text-brand-500">
              <p className="font-medium mb-1">ℹ️ {t('pppoe.infoTitle')}</p>
              <ul className="list-disc list-inside space-y-0.5 text-primary/80 dark:text-brand-500/80">
                <li>{t('pppoe.syncInfo1')}</li>
                <li>{t('pppoe.syncInfo2')}</li>
                <li>{t('pppoe.syncInfo3')}</li>
                <li>{t('pppoe.syncInfo4')}</li>
                <li>{t('pppoe.syncInfo5')}</li>
              </ul>
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalButton variant="secondary" onClick={() => { setIsSyncDialogOpen(false); setSyncPreview(null); setSyncResult(null); }}>{t('common.cancel')}</ModalButton>
            <ModalButton variant="primary" onClick={handleSyncImport} disabled={!syncProfileId || syncSelectedUsers.size === 0 || syncing}>
              {syncing ? (<><RefreshCcw className="h-3 w-3 animate-spin mr-1" />{t('pppoe.importing')}</>) : (<><Download className="h-3 w-3 mr-1" />{t('pppoe.importUsers')} {syncSelectedUsers.size}</>)}
            </ModalButton>
          </ModalFooter>
        </SimpleModal>

        {/* Extend Subscription Modal */}
        <SimpleModal isOpen={isExtendModalOpen && !!selectedUserForExtend} onClose={() => { setIsExtendModalOpen(false); setSelectedUserForExtend(null); setSelectedProfileForExtend(''); }} size="md">
          <ModalHeader>
            <ModalTitle>{t('pppoe.extendSubscription')}</ModalTitle>
            <ModalDescription>{selectedUserForExtend?.name} ({selectedUserForExtend?.username})</ModalDescription>
          </ModalHeader>
          {selectedUserForExtend && (
            <ModalBody className="space-y-4">
              <div className="bg-muted/30 dark:bg-card/50 rounded-lg p-3 space-y-2 text-xs border border-border dark:border-violet-500/30">
                <div className="flex justify-between"><span className="text-muted-foreground">{t('pppoe.currentPackage')}:</span><span className="font-medium text-foreground">{selectedUserForExtend.profile?.name || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('pppoe.activeUntil')}:</span><span className={selectedUserForExtend.expiredAt && isExpired(selectedUserForExtend.expiredAt) ? 'text-red-500 dark:text-red-500 font-medium' : 'text-foreground'}>{selectedUserForExtend.expiredAt ? formatWIB(selectedUserForExtend.expiredAt, 'dd/MM/yyyy HH:mm') : '-'}</span></div>
              </div>
              <div>
                <ModalLabel required>{t('pppoe.selectPackage')}</ModalLabel>
                <ModalSelect value={selectedProfileForExtend} onChange={(e) => setSelectedProfileForExtend(e.target.value)}>
                  {profiles.map((p) => (<option key={p.id} value={p.id} className="dark:bg-card">{p.name} - Rp {p.price.toLocaleString('id-ID')}{p.id === selectedUserForExtend.profile?.id ? ` ${t('pppoe.currentPackageLabel')}` : ''}</option>))}
                </ModalSelect>
                <p className="text-[10px] text-muted-foreground mt-1">{selectedProfileForExtend !== selectedUserForExtend.profile?.id ? `⚠️ ${t('pppoe.packageWillChange')}` : t('pppoe.extendSamePackage')}</p>
              </div>
              <div className="bg-primary/10 dark:bg-brand-500/10 border border-primary/30 dark:border-brand-500/30 rounded-lg p-3 text-xs"><p className="text-primary dark:text-brand-500">ℹ️ {t('pppoe.extendPaymentInfo')}</p></div>
            </ModalBody>
          )}
          <ModalFooter>
            <ModalButton variant="secondary" onClick={() => { setIsExtendModalOpen(false); setSelectedUserForExtend(null); setSelectedProfileForExtend(''); }}>{t('common.cancel')}</ModalButton>
            <ModalButton variant="primary" onClick={handleConfirmExtend} disabled={!selectedProfileForExtend || Boolean(selectedUserForExtend && extending === selectedUserForExtend.id)}>
              {selectedUserForExtend && extending === selectedUserForExtend.id ? (<><Loader2 className="h-3 w-3 animate-spin mr-1" />{t('pppoe.processing')}</>) : (<><Zap className="h-3 w-3 mr-1" />{t('pppoe.extendNow')}</>)}
            </ModalButton>
          </ModalFooter>
        </SimpleModal>

        {/* Broadcast Notification Modal */}
        <SimpleModal isOpen={isBroadcastDialogOpen} onClose={() => setIsBroadcastDialogOpen(false)} size="lg">
          <ModalHeader>
            <ModalTitle className="flex items-center gap-2"><Bell className="h-4 w-4 text-pink-500" />{t('pppoe.broadcastNotification')} {selectedUsers.size} User</ModalTitle>
            <ModalDescription>{t('pppoe.broadcastDesc')}</ModalDescription>
          </ModalHeader>
          <ModalBody className="space-y-4 max-h-[60vh] overflow-y-auto">
            {notificationType === 'outage' && (
              <>
                <div>
                  <ModalLabel required>{t('pppoe.statusLabel')}</ModalLabel>
                  <ModalSelect value={broadcastData.status} onChange={(e) => setBroadcastData({ ...broadcastData, status: e.target.value })}>
                    <option value="in_progress" className="dark:bg-card">🔧 {t('pppoe.outageInProgress')}</option>
                    <option value="resolved" className="dark:bg-card">✅ {t('pppoe.outageResolved')}</option>
                  </ModalSelect>
                </div>
                {broadcastData.status === 'in_progress' ? (
                  <>
                    <div><ModalLabel required>{t('pppoe.issueType')}</ModalLabel><ModalInput type="text" value={broadcastData.issueType} onChange={(e) => setBroadcastData({ ...broadcastData, issueType: e.target.value })} placeholder={t('pppoe.issueTypePlaceholder')} /></div>
                    <div><ModalLabel required>{t('pppoe.issueDescription')}</ModalLabel><ModalTextarea value={broadcastData.description} onChange={(e) => setBroadcastData({ ...broadcastData, description: e.target.value })} placeholder={t('pppoe.issueDescPlaceholder')} rows={4} /></div>
                    <div><ModalLabel required>{t('pppoe.estimatedTime')}</ModalLabel><ModalInput type="text" value={broadcastData.estimatedTime} onChange={(e) => setBroadcastData({ ...broadcastData, estimatedTime: e.target.value })} placeholder={t('pppoe.estimatedTimePlaceholder')} /></div>
                    <div><ModalLabel required>{t('pppoe.affectedArea')}</ModalLabel><ModalInput type="text" value={broadcastData.affectedArea} onChange={(e) => setBroadcastData({ ...broadcastData, affectedArea: e.target.value })} placeholder={t('pppoe.affectedAreaPlaceholder')} /></div>
                  </>
                ) : (
                  <>
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3"><p className="text-xs text-green-500">✅ {t('pppoe.repairCompletedInfo').replace('{count}', String(selectedUsers.size))}</p></div>
                    <div><ModalLabel required>{t('pppoe.information')}</ModalLabel><ModalTextarea value={broadcastData.description} onChange={(e) => setBroadcastData({ ...broadcastData, description: e.target.value })} placeholder={t('pppoe.repairInfoPlaceholder')} rows={4} /></div>
                  </>
                )}
              </>
            )}
            {notificationType === 'invoice' && (
              <>
                <div className="bg-[#ff8c00]/10 border border-[#ff8c00]/30 rounded-lg p-3"><p className="text-xs text-[#ff8c00]">{t('pppoe.invoiceInfo').replace('{count}', String(selectedUsers.size))}</p></div>
                <div><ModalLabel>{t('pppoe.additionalMessage')}</ModalLabel><ModalTextarea value={broadcastData.description} onChange={(e) => setBroadcastData({ ...broadcastData, description: e.target.value })} placeholder={t('pppoe.additionalInvoicePlaceholder')} rows={3} /></div>
              </>
            )}
            {notificationType === 'payment' && (
              <>
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3"><p className="text-xs text-green-500">{t('pppoe.paymentReceiptInfo').replace('{count}', String(selectedUsers.size))}</p></div>
                <div><ModalLabel>{t('pppoe.additionalMessage')}</ModalLabel><ModalTextarea value={broadcastData.description} onChange={(e) => setBroadcastData({ ...broadcastData, description: e.target.value })} placeholder={t('pppoe.additionalThankYouPlaceholder')} rows={3} /></div>
              </>
            )}
            <div>
              <ModalLabel className="flex items-center gap-1"><Bell className="h-3 w-3" />{t('pppoe.sendVia')}</ModalLabel>
              <div className="space-y-2 mt-2">
                <label className={`flex items-center gap-2 p-2 border-2 rounded-lg cursor-pointer transition-all ${broadcastData.notificationMethod === 'whatsapp' ? 'border-[#25D366] bg-[#25D366]/10 shadow-[0_0_10px_rgba(37,211,102,0.3)]' : 'border-violet-500/30 hover:border-[#25D366]/50'}`}>
                  <input type="radio" value="whatsapp" checked={broadcastData.notificationMethod === 'whatsapp'} onChange={(e) => setBroadcastData({ ...broadcastData, notificationMethod: e.target.value })} className="w-3.5 h-3.5 accent-[#25D366]" />
                  <span className="text-xs text-foreground">{t('pppoe.whatsappOnly')}</span>
                </label>
                <label className={`flex items-center gap-2 p-2 border-2 rounded-lg cursor-pointer transition-all ${broadcastData.notificationMethod === 'email' ? 'border-brand-500 bg-brand-500/10 shadow-[0_0_10px_rgba(6,182,212,0.3)]' : 'border-violet-500/30 hover:border-brand-500/50'}`}>
                  <input type="radio" value="email" checked={broadcastData.notificationMethod === 'email'} onChange={(e) => setBroadcastData({ ...broadcastData, notificationMethod: e.target.value })} className="w-3.5 h-3.5 accent-brand-500" />
                  <span className="text-xs text-foreground">{t('pppoe.emailOnly')}</span>
                </label>
                <label className={`flex items-center gap-2 p-2 border-2 rounded-lg cursor-pointer transition-all ${broadcastData.notificationMethod === 'both' ? 'border-violet-500 bg-violet-500/10 shadow-[0_0_10px_rgba(139,92,246,0.3)]' : 'border-violet-500/30 hover:border-violet-500/50'}`}>
                  <input type="radio" value="both" checked={broadcastData.notificationMethod === 'both'} onChange={(e) => setBroadcastData({ ...broadcastData, notificationMethod: e.target.value })} className="w-3.5 h-3.5 accent-violet-500" />
                  <span className="text-xs text-foreground">{t('pppoe.whatsappAndEmail')}</span>
                </label>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalButton variant="secondary" onClick={() => setIsBroadcastDialogOpen(false)}>{t('common.cancel')}</ModalButton>
            <ModalButton variant="primary" onClick={handleSendBroadcast} disabled={sendingBroadcast}>
              {sendingBroadcast ? (<><Loader2 className="h-3 w-3 animate-spin mr-1" />{t('pppoe.sending')}</>) : (<><Send className="h-3 w-3 mr-1" />{notificationType === 'outage' && t('pppoe.sendNotificationBtn')}{notificationType === 'invoice' && t('pppoe.sendInvoiceBtn')}{notificationType === 'payment' && t('pppoe.sendPaymentReceipt')}</>)}
            </ModalButton>
          </ModalFooter>
        </SimpleModal>

        {/* Print Dialog */}
        <SimpleModal isOpen={printDialogUser !== null} onClose={() => setPrintDialogUser(null)} size="sm">
          <ModalHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-full bg-primary/15 border border-primary/30">
                <Printer className="w-4 h-4 text-primary" />
              </div>
              <div>
                <ModalTitle>Pilih Jenis Printer</ModalTitle>
                <ModalDescription className="font-mono">{printDialogUser?.name}</ModalDescription>
              </div>
            </div>
          </ModalHeader>
          <ModalBody className="space-y-2 pb-2">
            <button
              onClick={() => printDialogUser && handlePrintFromUser(printDialogUser, 'standard')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <FileText className="w-5 h-5 flex-shrink-0" />
              <div className="text-left">
                <div className="text-sm font-bold">Standar Printer</div>
                <div className="text-[11px] opacity-80">A4 / Letter &mdash; invoice lengkap</div>
              </div>
            </button>
            <button
              onClick={() => printDialogUser && handlePrintFromUser(printDialogUser, 'thermal')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              <Printer className="w-5 h-5 flex-shrink-0" />
              <div className="text-left">
                <div className="text-sm font-bold">Thermal Printer</div>
                <div className="text-[11px] opacity-80">58mm / 80mm &mdash; struk kasir</div>
              </div>
            </button>
          </ModalBody>
          <ModalFooter>
            <ModalButton variant="secondary" onClick={() => setPrintDialogUser(null)}>{t('common.cancel')}</ModalButton>
          </ModalFooter>
        </SimpleModal>
      </div>
    </div >
  );
}
