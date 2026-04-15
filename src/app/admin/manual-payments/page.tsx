'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle, XCircle, Eye, Trash2, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { formatWIB } from '@/lib/timezone';

interface ManualPayment {
  id: string;
  userId: string;
  invoiceId: string;
  amount: number;
  paymentDate: string;
  bankName: string;
  accountNumber: string | null;
  accountName: string;
  receiptImage: string | null;
  notes: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    username: string;
    phone: string;
    email: string | null;
  };
  invoice: {
    id: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    status: string;
  };
}

export default function ManualPaymentsPage() {
  const { data: session } = useSession();
  const { t } = useTranslation();
  const [payments, setPayments] = useState<ManualPayment[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<ManualPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<ManualPayment | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [paymentMonth, setPaymentMonth] = useState<string>(''); // '' = all-time, 'YYYY-MM' = filtered

  const MONTH_NAMES_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const getMonthLabel = (ym: string) => {
    if (!ym) return 'Semua';
    const [y, m] = ym.split('-').map(Number);
    return `${MONTH_NAMES_ID[m - 1]} ${y}`;
  };
  const shiftPaymentMonth = (delta: number) => {
    const base = paymentMonth || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
    const [y, m] = base.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setPaymentMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  };

  useEffect(() => {
    fetchPayments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMonth]);

  useEffect(() => {
    filterPayments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, statusFilter, searchQuery]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (paymentMonth) params.set('month', paymentMonth);
      const response = await fetch(`/api/manual-payments?${params}`);
      if (!response.ok) throw new Error('Failed to fetch payments');
      const data = await response.json();
      setPayments(data.data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
      showError(t('common.failedLoadPayments'));
    } finally {
      setLoading(false);
    }
  };

  const filterPayments = () => {
    let filtered = [...payments];

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.user.name.toLowerCase().includes(query) ||
          p.user.username.toLowerCase().includes(query) ||
          p.invoice.invoiceNumber.toLowerCase().includes(query) ||
          p.accountName.toLowerCase().includes(query) ||
          p.bankName.toLowerCase().includes(query)
      );
    }

    setFilteredPayments(filtered);
  };

  const handleApprove = async () => {
    if (!selectedPayment) return;

    try {
      setProcessing(true);
      const response = await fetch(`/api/manual-payments/${selectedPayment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          approvedBy: session?.user?.email || 'admin',
        }),
      });

      if (!response.ok) throw new Error('Failed to approve payment');

      showSuccess(t('manualPayment.approveSuccess'));
      setShowApproveDialog(false);
      setSelectedPayment(null);
      fetchPayments();
    } catch (error) {
      console.error('Error approving payment:', error);
      showError(t('manualPayment.failedApprove'));
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedPayment || !rejectionReason) {
      showError(t('manualPayment.rejectionReasonRequired'));
      return;
    }

    try {
      setProcessing(true);
      const response = await fetch(`/api/manual-payments/${selectedPayment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          approvedBy: session?.user?.email || 'admin',
          rejectionReason,
        }),
      });

      if (!response.ok) throw new Error('Failed to reject payment');

      showSuccess(t('manualPayment.rejectSuccess'));
      setShowRejectDialog(false);
      setSelectedPayment(null);
      setRejectionReason('');
      fetchPayments();
    } catch (error) {
      console.error('Error rejecting payment:', error);
      showError(t('manualPayment.failedReject'));
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm(t('manualPayments.deleteConfirm'));
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/manual-payments/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete payment');

      showSuccess(t('manualPayment.deleteSuccess'));
      fetchPayments();
    } catch (error) {
      console.error('Error deleting payment:', error);
      showError(t('manualPayment.failedDelete'));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">{t('manualPayment.pending')}</Badge>;
      case 'APPROVED':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30">{t('manualPayment.approved')}</Badge>;
      case 'REJECTED':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">{t('manualPayment.rejected')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const stats = {
    pending: payments.filter((p) => p.status === 'PENDING').length,
    approved: payments.filter((p) => p.status === 'APPROVED').length,
    rejected: payments.filter((p) => p.status === 'REJECTED').length,
    total: payments.length,
  };

  return (
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">{t('manualPayment.title')}</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          {t('manualPayment.description')}
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-2 border-warning/30 bg-card/80 backdrop-blur-sm shadow-[0_0_15px_rgba(255,170,0,0.1)]">
          <CardHeader className="p-4 pb-3">
            <CardDescription className="text-xs font-bold text-warning uppercase tracking-wide">{t('manualPayment.pendingVerification')}</CardDescription>
            <CardTitle className="text-4xl font-black text-warning drop-shadow-[0_0_5px_rgba(255,170,0,0.5)]">{stats.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-2 border-success/30 bg-card/80 backdrop-blur-sm shadow-[0_0_15px_rgba(0,255,136,0.1)]">
          <CardHeader className="p-4 pb-3">
            <CardDescription className="text-xs font-bold text-success uppercase tracking-wide">{t('manualPayment.approved')}</CardDescription>
            <CardTitle className="text-4xl font-black text-success drop-shadow-[0_0_5px_rgba(0,255,136,0.5)]">{stats.approved}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-2 border-destructive/30 bg-card/80 backdrop-blur-sm shadow-[0_0_15px_rgba(255,51,102,0.1)]">
          <CardHeader className="p-4 pb-3">
            <CardDescription className="text-xs font-bold text-destructive uppercase tracking-wide">{t('manualPayment.rejected')}</CardDescription>
            <CardTitle className="text-4xl font-black text-destructive drop-shadow-[0_0_5px_rgba(255,51,102,0.5)]">{stats.rejected}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-2 border-primary/30 bg-card/80 backdrop-blur-sm shadow-[0_0_15px_rgba(188,19,254,0.1)]">
          <CardHeader className="p-4 pb-3">
            <CardDescription className="text-xs font-bold text-primary uppercase tracking-wide">{t('manualPayments.totalLabel')}</CardDescription>
            <CardTitle className="text-4xl font-black text-primary drop-shadow-[0_0_5px_rgba(188,19,254,0.5)]">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="px-5 pt-5 pb-5">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('manualPayment.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder={t('manualPayment.filterStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('manualPayment.allStatus')}</SelectItem>
                <SelectItem value="PENDING">{t('manualPayment.pending')}</SelectItem>
                <SelectItem value="APPROVED">{t('manualPayment.approved')}</SelectItem>
                <SelectItem value="REJECTED">{t('manualPayment.rejected')}</SelectItem>
              </SelectContent>
            </Select>
            {/* Month Filter */}
            <div className="flex items-center gap-1 border border-border rounded-lg bg-muted/30 px-1 py-1">
              <button
                onClick={() => shiftPaymentMonth(-1)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPaymentMonth('')}
                className="text-xs font-medium text-foreground min-w-[90px] text-center hover:text-primary transition-colors"
                title="Klik untuk reset ke semua"
              >
                {getMonthLabel(paymentMonth)}
              </button>
              <button
                onClick={() => shiftPaymentMonth(1)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <Button onClick={fetchPayments} variant="outline" size="icon">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="leading-snug">{t('manualPayment.paymentList')}</CardTitle>
          <CardDescription>
            {filteredPayments.length} {t('manualPayment.paymentsFound')}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 pt-0 pb-5">
          {loading ? (
            <div className="text-center py-8">{t('common.loading')}</div>
          ) : filteredPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('manualPayment.noData')}
            </div>
          ) : (
            <>
            {/* Mobile Card View */}
            <div className="block md:hidden space-y-3">
              {filteredPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3 space-y-2"
                >
                  {/* Header: Customer + Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-foreground truncate">{payment.user.name}</div>
                      <div className="text-xs text-muted-foreground">{payment.user.username}</div>
                    </div>
                    {getStatusBadge(payment.status)}
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div>
                      <span className="text-muted-foreground">{t('common.date')}</span>
                      <div className="font-medium text-foreground">
                        {formatWIB(payment.paymentDate, 'dd MMM yyyy')}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('common.invoice')}</span>
                      <div className="font-mono font-medium text-foreground truncate">{payment.invoice.invoiceNumber}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('manualPayment.bank')}</span>
                      <div className="font-medium text-foreground">{payment.bankName}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('manualPayment.sender')}</span>
                      <div className="font-medium text-foreground truncate">{payment.accountName}</div>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right">
                    <span className="text-sm font-bold text-[#00f7ff]">
                      {formatCurrency(Number(payment.amount))}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#bc13fe]/10">
                    <Button
                      size="sm"
                      variant="outline"
                      className="p-2 h-auto"
                      title="Lihat Detail"
                      onClick={() => {
                        setSelectedPayment(payment);
                        setShowDetailDialog(true);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {payment.status === 'PENDING' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="p-2 h-auto text-success hover:bg-success/10"
                          title="Setujui"
                          onClick={() => {
                            setSelectedPayment(payment);
                            setShowApproveDialog(true);
                          }}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="p-2 h-auto text-destructive hover:bg-destructive/10"
                          title="Tolak"
                          onClick={() => {
                            setSelectedPayment(payment);
                            setShowRejectDialog(true);
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="p-2 h-auto text-destructive hover:bg-destructive/10"
                      title="Hapus"
                      onClick={() => handleDelete(payment.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.date')}</TableHead>
                    <TableHead>{t('manualPayment.customer')}</TableHead>
                    <TableHead>{t('common.invoice')}</TableHead>
                    <TableHead>{t('manualPayment.bank')}</TableHead>
                    <TableHead>{t('manualPayment.sender')}</TableHead>
                    <TableHead className="text-right">{t('common.amount')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-center">{t('common.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatWIB(payment.paymentDate, 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{payment.user.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {payment.user.username}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm">
                          {payment.invoice.invoiceNumber}
                        </div>
                      </TableCell>
                      <TableCell>{payment.bankName}</TableCell>
                      <TableCell>{payment.accountName}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(payment.amount))}
                      </TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            title="Lihat Detail"
                            onClick={() => {
                              setSelectedPayment(payment);
                              setShowDetailDialog(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {payment.status === 'PENDING' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-success hover:bg-success/10"
                                title="Setujui"
                                onClick={() => {
                                  setSelectedPayment(payment);
                                  setShowApproveDialog(true);
                                }}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:bg-destructive/10"
                                title="Tolak"
                                onClick={() => {
                                  setSelectedPayment(payment);
                                  setShowRejectDialog(true);
                                }}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:bg-destructive/10"
                            title="Hapus"
                            onClick={() => handleDelete(payment.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('manualPayment.paymentDetail')}</DialogTitle>
            <DialogDescription>
              {t('manualPayment.paymentDetailDesc')}
            </DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-accent font-bold uppercase tracking-wide">{t('manualPayments.statusLabel')}</Label>
                  <div className="mt-2">{getStatusBadge(selectedPayment.status)}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-accent font-bold uppercase tracking-wide">{t('manualPayment.paymentDate')}</Label>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    {formatWIB(selectedPayment.paymentDate, 'dd MMMM yyyy HH:mm')}
                  </div>
                </div>
              </div>

              <div className="border-t-2 border-primary/20 pt-4">
                <h4 className="font-bold text-primary mb-3 uppercase tracking-wide text-sm">{t('manualPayment.customerInfo')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-accent font-bold uppercase tracking-wide">{t('common.name')}</Label>
                    <div className="mt-2 text-sm font-medium text-foreground">{selectedPayment.user.name}</div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-accent font-bold uppercase tracking-wide">{t('auth.username')}</Label>
                    <div className="mt-2 text-sm font-medium text-foreground">{selectedPayment.user.username}</div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-accent font-bold uppercase tracking-wide">{t('common.phone')}</Label>
                    <div className="mt-2 text-sm font-medium text-foreground">{selectedPayment.user.phone}</div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-accent font-bold uppercase tracking-wide">{t('common.email')}</Label>
                    <div className="mt-2 text-sm font-medium text-foreground">{selectedPayment.user.email || '-'}</div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-3">{t('manualPayment.invoiceInfo')}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">{t('manualPayment.invoiceNumber')}</Label>
                    <div className="mt-1 font-mono">{selectedPayment.invoice.invoiceNumber}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{t('manualPayment.invoiceAmount')}</Label>
                    <div className="mt-1 font-medium">
                      {formatCurrency(selectedPayment.invoice.amount)}
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{t('manualPayment.dueDate')}</Label>
                    <div className="mt-1">
                      {formatWIB(selectedPayment.invoice.dueDate, 'dd MMM yyyy')}
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{t('manualPayment.invoiceStatus')}</Label>
                    <div className="mt-1">{selectedPayment.invoice.status}</div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-3">{t('manualPayment.transferDetail')}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">{t('manualPayment.bank')}</Label>
                    <div className="mt-1 font-medium">{selectedPayment.bankName}</div>
                  </div>
                  {selectedPayment.accountNumber && (
                    <div>
                      <Label className="text-muted-foreground">{t('manualPayments.accountNumber')}</Label>
                      <div className="mt-1 font-mono">{selectedPayment.accountNumber}</div>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground">{t('manualPayment.senderName')}</Label>
                    <div className="mt-1 font-medium">{selectedPayment.accountName}</div>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">{t('manualPayment.transferAmount')}</Label>
                    <div className="mt-1 text-lg font-bold">
                      {formatCurrency(Number(selectedPayment.amount))}
                    </div>
                  </div>
                </div>
              </div>

              {selectedPayment.notes && (
                <div className="border-t-2 border-primary/20 pt-4">
                  <Label className="text-xs text-accent font-bold uppercase tracking-wide">{t('common.notes')}</Label>
                  <div className="mt-2 p-3 bg-card/80 rounded-lg border border-primary/20 text-sm text-foreground">{selectedPayment.notes}</div>
                </div>
              )}

              {selectedPayment.receiptImage && (
                <div className="border-t-2 border-primary/20 pt-4">
                  <Label className="text-xs text-accent font-bold uppercase tracking-wide">{t('manualPayment.transferReceipt')}</Label>
                  <div className="mt-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedPayment.receiptImage}
                      alt={t('manualPayment.transferReceipt')}
                      className="max-w-full h-auto rounded-lg border-2 border-accent/30 shadow-[0_0_20px_rgba(0,247,255,0.2)]"
                    />
                  </div>
                </div>
              )}

              {selectedPayment.status === 'APPROVED' && selectedPayment.approvedAt && (
                <div className="border-t-2 border-success/30 pt-4 bg-success/10 p-4 rounded-lg border-2 border-success/30">
                  <h4 className="font-bold text-success mb-3 uppercase tracking-wide text-sm">{t('manualPayment.approvalInfo')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-xs text-success/80 font-bold uppercase tracking-wide">{t('manualPayment.approvedBy')}:</span>
                      <div className="text-sm font-medium text-foreground">{selectedPayment.approvedBy}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-success/80 font-bold uppercase tracking-wide">{t('common.date')}:</span>
                      <div className="text-sm font-medium text-foreground">
                        {formatWIB(selectedPayment.approvedAt, 'dd MMM yyyy HH:mm')}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedPayment.status === 'REJECTED' && (
                <div className="border-t pt-4 bg-destructive/10 p-4 rounded-lg">
                  <h4 className="font-semibold text-destructive mb-2">{t('manualPayment.rejectionInfo')}</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t('manualPayment.rejectedBy')}:</span>
                      <div className="font-medium">{selectedPayment.approvedBy}</div>
                    </div>
                    {selectedPayment.approvedAt && (
                      <div>
                        <span className="text-muted-foreground">{t('common.date')}:</span>
                        <div className="font-medium">
                          {formatWIB(selectedPayment.approvedAt, 'dd MMM yyyy HH:mm')}
                        </div>
                      </div>
                    )}
                    {selectedPayment.rejectionReason && (
                      <div>
                        <span className="text-muted-foreground">{t('manualPayment.reason')}:</span>
                        <div className="mt-1 p-2 bg-card rounded border border-destructive/30">
                          {selectedPayment.rejectionReason}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('manualPayment.approvePaymentTitle')}</DialogTitle>
            <DialogDescription>
              {t('manualPayment.approvePaymentDesc')}
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>{t('manualPayment.approveAction1')}</li>
            <li>{t('manualPayment.approveAction2')}</li>
            <li>{t('manualPayment.approveAction3')}</li>
            <li>{t('manualPayment.approveAction4')}</li>
          </ul>
          {selectedPayment && (
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('manualPayment.customer')}:</span>
                <span className="font-medium">{selectedPayment.user.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('common.amount')}:</span>
                <span className="font-bold">{formatCurrency(Number(selectedPayment.amount))}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleApprove} disabled={processing}>
              {processing ? t('manualPayment.processing') : t('topup.approve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('manualPayment.rejectPaymentTitle')}</DialogTitle>
            <DialogDescription>
              {t('manualPayment.rejectPaymentDesc')}
            </DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('manualPayment.customer')}:</span>
                  <span className="font-medium">{selectedPayment.user.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('common.amount')}:</span>
                  <span className="font-bold">
                    {formatCurrency(Number(selectedPayment.amount))}
                  </span>
                </div>
              </div>
              <div>
                <Label htmlFor="rejectionReason">{t('manualPayment.rejectionReasonLabel')}</Label>
                <Textarea
                  id="rejectionReason"
                  placeholder={t('manualPayment.rejectionReasonPlaceholder')}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="mt-2"
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={processing || !rejectionReason}
            >
              {processing ? t('manualPayment.processing') : t('manualPayment.rejectPaymentButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
