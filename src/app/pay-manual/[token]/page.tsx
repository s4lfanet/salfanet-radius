'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, CreditCard, Upload, Calendar, Building2, User, ArrowLeft, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { showSuccess, showError, showWarning } from '@/lib/sweetalert';
import { formatWIB, todayWIBStr } from '@/lib/timezone';

interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
  customerName: string;
  customerUsername: string;
}

export default function PayManualPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [userId, setUserId] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [proofImageUrl, setProofImageUrl] = useState<string>('');
  
  const [formData, setFormData] = useState({
    bankName: '',
    accountName: '',
    transferDate: '',
    notes: '',
  });

  const fetchInvoice = useCallback(async (tokenValue: string) => {
    try {
      const url = `/api/pay/${tokenValue}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setInvoice(data.invoice);
        setUserId(data.invoice.userId || '');
      } else {
        showError(data.error || 'Token tidak valid', 'Invoice Tidak Ditemukan');
        router.push('/');
      }
    } catch (error) {
      showError('Gagal memuat invoice', 'Error');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchBankAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/company');
      const data = await response.json();
      
      if (data.bankAccounts) {
        setBankAccounts(data.bankAccounts);
      }
    } catch (error) {
      // Silent fail - bank accounts are optional
    }
  }, []);

  useEffect(() => {
    const loadAndFetch = async () => {
      try {
        const resolvedParams = await params;
        const tokenValue = resolvedParams.token;
        setToken(tokenValue);
        
        // Fetch data immediately
        await Promise.all([
          fetchInvoice(tokenValue),
          fetchBankAccounts()
        ]);
      } catch (error) {
        setLoading(false);
      }
    };
    
    loadAndFetch();
  }, [params, fetchInvoice, fetchBankAccounts]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showError('Hanya file JPG, PNG, dan WebP yang diperbolehkan', 'Format File Tidak Valid');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showError('Ukuran file maksimal 5MB', 'File Terlalu Besar');
      return;
    }

    setUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/payment-proof', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setProofImageUrl(data.url);
        showSuccess('Bukti transfer berhasil diupload', 'Upload Berhasil');
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error: any) {
      showError(error.message || 'Gagal upload bukti transfer', 'Upload Gagal');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.bankName || !formData.accountName || !formData.transferDate) {
      showWarning('Mohon lengkapi semua field yang wajib diisi', 'Form Tidak Lengkap');
      return;
    }

    if (!proofImageUrl) {
      showWarning('Mohon upload bukti transfer terlebih dahulu', 'Bukti Transfer Diperlukan');
      return;
    }
    
    setSubmitting(true);
    
    try {
      const response = await fetch('/api/manual-payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceId: invoice?.id,
          pppoeUserId: userId,
          amount: invoice?.amount,
          proofImage: proofImageUrl,
          ...formData,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        showSuccess('Konfirmasi pembayaran Anda telah diterima. Tim kami akan memverifikasi pembayaran dalam 1x24 jam.', 'Pembayaran Disubmit!');
        router.push('/');
      } else {
        throw new Error(data.error || 'Failed to submit payment');
      }
    } catch (error: any) {
      console.error('Submit payment error:', error);
      showError(error.message || 'Terjadi kesalahan saat submit pembayaran', 'Gagal Submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Memuat invoice...</p>
        </div>
      </div>
    );
  }

  if (!invoice || !userId) {
    return null;
  }

  const isDueSoon = new Date(invoice.dueDate) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali
        </button>

        {/* Invoice Info Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900 rounded-full flex items-center justify-center">
              <FileText className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pembayaran Manual</h1>
              <p className="text-sm text-gray-500">Transfer Bank</p>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">No. Invoice:</span>
              <span className="font-mono font-semibold">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Nama:</span>
              <span className="font-semibold">{invoice.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Username:</span>
              <span className="font-mono">{invoice.customerUsername}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Jatuh Tempo:</span>
              <span className={`font-semibold ${isDueSoon ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                {formatWIB(invoice.dueDate, 'dd MMM yyyy')}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-lg font-semibold text-gray-900 dark:text-white">Total:</span>
              <span className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                Rp {invoice.amount.toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        </div>

        {/* Bank Accounts */}
        {bankAccounts.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-600" />
              Rekening Tujuan Transfer
            </h2>
            <div className="space-y-3">
              {bankAccounts.map((account, index) => (
                <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border-l-4 border-teal-600">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Rekening {index + 1}</p>
                      <p className="font-bold text-lg text-gray-900 dark:text-white">{account.bankName}</p>
                      <p className="font-mono text-xl font-semibold text-teal-600 dark:text-teal-400 my-1">
                        {account.accountNumber}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">a/n {account.accountName}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-teal-600" />
            Konfirmasi Pembayaran
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Bank Tujuan Transfer <span className="text-red-600">*</span>
              </label>
              <select
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-teal-500"
                required
              >
                <option value="">Pilih Bank</option>
                {bankAccounts.map((account, index) => (
                  <option key={index} value={account.bankName}>
                    {account.bankName} - {account.accountNumber}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Nama Pengirim <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={formData.accountName}
                onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-teal-500"
                placeholder="Nama sesuai rekening pengirim"
                required
              />
              <p className="mt-1 text-xs text-gray-500">Masukkan nama pemilik rekening yang digunakan untuk transfer</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Tanggal Transfer <span className="text-red-600">*</span>
              </label>
              <input
                type="date"
                value={formData.transferDate}
                onChange={(e) => setFormData({ ...formData, transferDate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-teal-500"
                max={todayWIBStr()}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Bukti Transfer <span className="text-red-600">*</span>
              </label>
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="file"
                    id="proof-upload"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={uploadingImage}
                  />
                  <label
                    htmlFor="proof-upload"
                    className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                      ${uploadingImage ? 'opacity-50 cursor-not-allowed' : 'hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20'}
                      ${proofImageUrl ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-600'}
                    `}
                  >
                    {uploadingImage ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600" />
                        <span className="text-sm">Uploading...</span>
                      </>
                    ) : proofImageUrl ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-sm text-green-700 dark:text-green-400">Bukti berhasil diupload</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          Klik untuk upload foto bukti transfer
                        </span>
                      </>
                    )}
                  </label>
                </div>
                
                {proofImageUrl && (
                  <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={proofImageUrl}
                      alt="Bukti Transfer"
                      className="w-full h-auto max-h-64 object-contain bg-gray-100 dark:bg-gray-800"
                    />
                    <button
                      type="button"
                      onClick={() => setProofImageUrl('')}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}
                
                <p className="text-xs text-gray-500">
                  Format: JPG, PNG, WebP. Maksimal 5MB. Pastikan bukti transfer jelas dan terbaca.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Catatan (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-teal-500"
                rows={3}
                placeholder="Catatan tambahan (jika ada)"
              />
            </div>

            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-teal-800 dark:text-teal-200">
                  <p className="font-semibold mb-1">Penting:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Pastikan jumlah transfer sesuai dengan total tagihan</li>
                    <li>Konfirmasi akan diverifikasi dalam 1x24 jam</li>
                    <li>Layanan akan aktif setelah pembayaran disetujui admin</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 btn-primary rounded-lg font-semibold flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Mengirim...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Konfirmasi Pembayaran
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
