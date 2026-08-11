'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle, Upload, AlertTriangle, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/lib/sweetalert';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { formatWIB, nowWIB, todayWIBStr } from '@/lib/timezone';

interface BankAccount {
  name: string;
  accountNumber: string;
  accountHolder: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  userId: string;
  amount: number;
  dueDate: string;
  status: string;
  user: {
    name: string;
    username: string;
    phone: string;
    email: string | null;
  };
}

function PayManualPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [hasPendingPayment, setHasPendingPayment] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Form state
  const [paymentDate, setPaymentDate] = useState(format(nowWIB(), 'yyyy-MM-dd'));
  const [selectedBank, setSelectedBank] = useState('');
  const [accountName, setAccountName] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (token) {
      fetchPaymentInfo();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchPaymentInfo = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/pay/manual?token=${token}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch payment info');
      }

      const data = await response.json();
      setInvoice(data.invoice);
      setBankAccounts(data.bankAccounts || []);
      setHasPendingPayment(data.hasPendingPayment || false);
      
      // Pre-fill amount with invoice amount
      setAmount(data.invoice.amount.toString());
    } catch (error: any) {
      console.error('Error fetching payment info:', error);
      showError(error.message || 'Gagal memuat informasi pembayaran');
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      showError('Format file tidak didukung. Gunakan JPG, PNG, atau WebP');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showError('Ukuran file maksimal 5MB');
      return;
    }

    setReceiptImage(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invoice) return;

    // Validation
    if (!selectedBank) {
      showError('Pilih bank tujuan transfer');
      return;
    }
    if (!accountName.trim()) {
      showError('Nama pengirim harus diisi');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      showError('Jumlah pembayaran tidak valid');
      return;
    }
    if (!receiptImage) {
      showError('Upload bukti transfer');
      return;
    }

    try {
      setSubmitting(true);

      // Upload receipt image first
      const formData = new FormData();
      formData.append('file', receiptImage);

      const uploadResponse = await fetch('/api/upload/payment-proof', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload receipt image');
      }

      const { filename } = await uploadResponse.json();

      // Submit payment
      const paymentResponse = await fetch('/api/manual-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: invoice.userId,
          invoiceId: invoice.id,
          amount: Number(amount),
          paymentDate: new Date(paymentDate).toISOString(),
          bankName: selectedBank,
          accountName: accountName.trim(),
          receiptImage: filename,
          notes: notes.trim() || null,
        }),
      });

      if (!paymentResponse.ok) {
        const error = await paymentResponse.json();
        throw new Error(error.error || 'Failed to submit payment');
      }

      showSuccess('Pembayaran berhasil diajukan');
      setSubmitted(true);
    } catch (error: any) {
      console.error('Error submitting payment:', error);
      showError(error.message || 'Gagal mengajukan pembayaran');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Token Tidak Valid</h2>
              <p className="text-muted-foreground">
                Link pembayaran tidak valid atau sudah kadaluarsa
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Pembayaran Diajukan</h2>
              <p className="text-muted-foreground mb-6">
                Terima kasih! Pembayaran Anda sedang diverifikasi oleh admin.
                Anda akan menerima notifikasi setelah pembayaran disetujui.
              </p>
              <div className="bg-primary/10 p-4 rounded-lg text-sm text-left">
                <h3 className="font-semibold mb-2">Informasi Pembayaran:</h3>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Invoice:</span>
                    <span className="font-mono">{invoice?.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Jumlah:</span>
                    <span className="font-bold">{formatCurrency(Number(amount))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank:</span>
                    <span>{selectedBank}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Invoice Tidak Ditemukan</h2>
              <p className="text-muted-foreground">
                Invoice tidak ditemukan atau sudah tidak valid
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4 bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Pembayaran Manual</h1>
          <p className="text-muted-foreground">Konfirmasi pembayaran via transfer bank</p>
        </div>

        {hasPendingPayment && (
          <div className="mb-6 bg-warning/10 border border-warning/30 rounded-lg p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
            <div className="text-sm text-yellow-800">
              Anda sudah memiliki pembayaran yang sedang diverifikasi untuk invoice ini.
              Pengajuan baru akan menggantikan pembayaran sebelumnya.
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Invoice Info */}
          <Card>
            <CardHeader>
              <CardTitle>Informasi Invoice</CardTitle>
              <CardDescription>Detail tagihan yang harus dibayar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Nomor Invoice</Label>
                <div className="font-mono text-lg">{invoice.invoiceNumber}</div>
              </div>
              <div>
                <Label className="text-muted-foreground">Nama Pelanggan</Label>
                <div className="font-medium">{invoice.user.name}</div>
              </div>
              <div>
                <Label className="text-muted-foreground">Username</Label>
                <div>{invoice.user.username}</div>
              </div>
              <div>
                <Label className="text-muted-foreground">Jatuh Tempo</Label>
                <div className="font-medium text-destructive">
                  {formatWIB(invoice.dueDate, 'dd MMMM yyyy')}
                </div>
              </div>
              <div className="pt-4 border-t">
                <Label className="text-muted-foreground">Total Tagihan</Label>
                <div className="text-3xl font-bold text-primary">
                  {formatCurrency(invoice.amount)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bank Accounts */}
          <Card>
            <CardHeader>
              <CardTitle>Rekening Tujuan</CardTitle>
              <CardDescription>Transfer ke salah satu rekening berikut</CardDescription>
            </CardHeader>
            <CardContent>
              {bankAccounts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Tidak ada rekening tujuan tersedia
                </div>
              ) : (
                <div className="space-y-3">
                  {bankAccounts.map((bank, index) => (
                    <div key={index} className="p-4 border rounded-lg bg-white">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-lg">{bank.name}</span>
                      </div>
                      <div className="font-mono text-xl font-semibold mb-1">
                        {bank.accountNumber}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        a.n. {bank.accountHolder}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payment Form */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Konfirmasi Pembayaran</CardTitle>
            <CardDescription>
              Isi form berikut setelah melakukan transfer
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="paymentDate">Tanggal Transfer *</Label>
                  <Input
                    id="paymentDate"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    max={format(nowWIB(), 'yyyy-MM-dd')}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="selectedBank">Bank Tujuan *</Label>
                  <Select value={selectedBank} onValueChange={setSelectedBank} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih bank tujuan" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((bank, index) => (
                        <SelectItem key={index} value={bank.name}>
                          {bank.name} - {bank.accountNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="accountName">Nama Pengirim *</Label>
                  <Input
                    id="accountName"
                    placeholder="Nama sesuai rekening pengirim"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Nama sesuai dengan rekening yang digunakan untuk transfer
                  </p>
                </div>
                <div>
                  <Label htmlFor="amount">Jumlah Transfer *</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min="0"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Transfer sesuai jumlah tagihan: {formatCurrency(invoice.amount)}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="receiptImage">Bukti Transfer *</Label>
                <div className="mt-2">
                  {imagePreview ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="max-w-full h-auto rounded-lg border"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          setReceiptImage(null);
                          setImagePreview(null);
                        }}
                      >
                        Ganti Gambar
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed rounded-lg p-8 text-center">
                      <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <Label
                        htmlFor="receiptImage"
                        className="cursor-pointer text-primary hover:underline"
                      >
                        Klik untuk upload bukti transfer
                      </Label>
                      <p className="text-xs text-muted-foreground mt-2">
                        Format: JPG, PNG, WebP (Max 5MB)
                      </p>
                      <Input
                        id="receiptImage"
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleImageChange}
                        className="hidden"
                        required
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Catatan (Opsional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Tambahkan catatan jika diperlukan"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex gap-4">
                <Button type="submit" className="flex-1" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    'Kirim Konfirmasi Pembayaran'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-6 bg-primary/10 border-primary/30">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-3">⚠️ Penting:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Pastikan transfer sesuai dengan jumlah tagihan</li>
              <li>• Upload bukti transfer yang jelas dan terbaca</li>
              <li>• Verifikasi pembayaran membutuhkan waktu maksimal 1x24 jam</li>
              <li>• Anda akan menerima notifikasi setelah pembayaran diverifikasi</li>
              <li>• Hubungi admin jika ada kendala dalam pembayaran</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PayManualPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <PayManualPageContent />
    </Suspense>
  );
}
