"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { showSuccess, showError, showConfirm } from "@/lib/sweetalert";
import { formatWIB } from "@/lib/timezone";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Plus,
  Edit,
  Trash2,
  Filter,
  Download,
  Calendar,
  Tag,
  Search,
} from "lucide-react";

interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  description: string | null;
  _count?: { transactions: number };
}

interface Transaction {
  id: string;
  categoryId: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  description: string;
  date: string;
  reference: string | null;
  notes: string | null;
  category: Category;
}

interface Stats {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  incomeCount: number;
  expenseCount: number;
  pppoeIncome?: number;
  pppoeCount?: number;
  hotspotIncome?: number;
  hotspotCount?: number;
  installIncome?: number;
  installCount?: number;
}

export default function KeuanganPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    incomeCount: 0,
    expenseCount: 0,
  });

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  
  // Default: show all transactions (no date filter)
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionForm, setTransactionForm] = useState({
    categoryId: "",
    type: "INCOME" as "INCOME" | "EXPENSE",
    amount: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
    reference: "",
    notes: "",
  });

  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    type: "INCOME" as "INCOME" | "EXPENSE",
    description: "",
  });

  const [processing, setProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map(tx => tx.id)));
    }
  };
  const clearSelection = () => setSelectedIds(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
    setTransactions([]);
    setHasMore(true);
    loadData(1, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterCategory, startDate, endDate, debouncedSearch]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 100) {
        if (!loading && !loadingMore && hasMore) loadMoreData();
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadingMore, hasMore, page]);

  const loadData = async (pageNum = 1, reset = false) => {
    try {
      if (reset) { setLoading(true); } else { setLoadingMore(true); }

      let url = `/api/keuangan/transactions?page=${pageNum}&limit=50`;
      if (filterType !== "all") url += `&type=${filterType}`;
      if (filterCategory !== "all") url += `&categoryId=${filterCategory}`;
      if (startDate && endDate) url += `&startDate=${startDate}&endDate=${endDate}`;
      if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;

      const [transRes, catRes] = await Promise.all([fetch(url), fetch("/api/keuangan/categories")]);
      const transData = await transRes.json();
      const catData = await catRes.json();

      if (transData.success) {
        if (reset) { setTransactions(transData.transactions); } else { setTransactions((prev) => [...prev, ...transData.transactions]); }
        setStats(transData.stats);
        setTotal(transData.total || 0);
        setHasMore(transData.transactions.length === 50);
      }
      if (catData.success) setCategories(catData.categories);
    } catch (error) {
      await showError(t('keuangan.failedLoadData'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreData = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadData(nextPage, false);
  };

  const handleAddTransaction = () => {
    setEditingTransaction(null);
    setTransactionForm({
      categoryId: "",
      type: "INCOME",
      amount: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
      reference: "",
      notes: "",
    });
    setIsTransactionDialogOpen(true);
  };

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setTransactionForm({
      categoryId: transaction.categoryId,
      type: transaction.type,
      amount: transaction.amount.toString(),
      description: transaction.description,
      date: new Date(transaction.date).toISOString().split("T")[0],
      reference: transaction.reference || "",
      notes: transaction.notes || "",
    });
    setIsTransactionDialogOpen(true);
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionForm.categoryId || !transactionForm.amount || !transactionForm.description) {
      await showError(t('common.fillAllRequiredFields'));
      return;
    }

    setProcessing(true);
    try {
      const method = editingTransaction ? "PUT" : "POST";
      const body = editingTransaction ? { id: editingTransaction.id, ...transactionForm } : transactionForm;
      const res = await fetch("/api/keuangan/transactions", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        await showSuccess(data.message);
        setIsTransactionDialogOpen(false);
        setPage(1);
        setTransactions([]);
        setHasMore(true);
        loadData(1, true);
      } else {
        await showError(data.error);
      }
    } catch (error) {
      await showError(t('keuangan.failedSaveTransaction'));
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteTransaction = async (transaction: Transaction) => {
    const confirmed = await showConfirm(`Delete: ${transaction.description}?`, "Delete");
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/keuangan/transactions?id=${transaction.id}`, { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        await showSuccess(data.message);
        clearSelection();
        setPage(1);
        setTransactions([]);
        setHasMore(true);
        loadData(1, true);
      } else {
        await showError(data.error);
      }
    } catch (error) {
      await showError(t('keuangan.failedDeleteTransaction'));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = await showConfirm(`Hapus ${selectedIds.size} transaksi yang dipilih?`, "Hapus");
    if (!confirmed) return;
    try {
      const ids = Array.from(selectedIds).join(",");
      const res = await fetch(`/api/keuangan/transactions?ids=${encodeURIComponent(ids)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        await showSuccess(data.message);
        clearSelection();
        setPage(1);
        setTransactions([]);
        setHasMore(true);
        loadData(1, true);
      } else {
        await showError(data.error);
      }
    } catch (error) {
      await showError(t('keuangan.failedDeleteTransaction'));
    }
  };

  const handleDeleteByFilter = async () => {
    const confirmed = await showConfirm(`Hapus SEMUA ${total} transaksi sesuai filter saat ini? Tindakan ini tidak bisa dibatalkan.`, "Hapus Semua");
    if (!confirmed) return;
    try {
      let url = `/api/keuangan/transactions?filterDelete=true&type=${filterType}&categoryId=${filterCategory}`;
      if (startDate && endDate) url += `&startDate=${startDate}&endDate=${endDate}`;
      if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        await showSuccess(data.message);
        clearSelection();
        setPage(1);
        setTransactions([]);
        setHasMore(true);
        loadData(1, true);
      } else {
        await showError(data.error);
      }
    } catch (error) {
      await showError(t('keuangan.failedDeleteTransaction'));
    }
  };

  const handleAddCategory = () => {
    setCategoryForm({ name: "", type: "INCOME", description: "" });
    setIsCategoryDialogOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.name) {
      await showError(t('keuangan.categoryNameRequired'));
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch("/api/keuangan/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryForm),
      });
      const data = await res.json();

      if (data.success) {
        await showSuccess(data.message);
        setIsCategoryDialogOpen(false);
        setPage(1);
        setTransactions([]);
        setHasMore(true);
        loadData(1, true);
      } else {
        await showError(data.error);
      }
    } catch (error) {
      await showError(t('keuangan.failedSaveCategory'));
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);

  const formatDate = (date: string) => formatWIB(new Date(date), "d MMM yyyy");

  const resetFilters = () => {
    setFilterType("all");
    setFilterCategory("all");
    setStartDate("");
    setEndDate("");
    setSearchQuery("");
  };

  const formatDateLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const setQuickDate = (type: "thisMonth" | "lastMonth" | "thisYear") => {
    const now = new Date();
    let start: Date, end: Date;
    if (type === "thisMonth") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (type === "lastMonth") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
    }
    setStartDate(formatDateLocal(start));
    setEndDate(formatDateLocal(end));
  };

  const handleExport = async (format: "excel" | "pdf") => {
    try {
      let url = `/api/keuangan/export?format=${format}&type=${filterType}`;
      if (startDate && endDate) url += `&startDate=${startDate}&endDate=${endDate}`;
      if (filterCategory !== "all") url += `&categoryId=${filterCategory}`;
      if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;

      if (format === "excel") {
        const res = await fetch(url);
        if (!res.ok) { await showError(t('keuangan.exportFailed')); return; }
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        const suffix = startDate && endDate ? `${startDate}-${endDate}` : "semua";
        a.download = `Laporan-Keuangan-${suffix}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        const res = await fetch(url);
        const data = await res.json();
        if (data.transactions) generatePDF(data.transactions, data.stats);
        else await showError(t('keuangan.exportFailed'));
      }
    } catch (error) {
      await showError(t('keuangan.exportFailed'));
    }
  };

  const generatePDF = async (transactions: any[], stats: any) => {
    const jsPDF = (await import("jspdf")).default;
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text(t('keuangan.pdfTitle'), 14, 15);
    doc.setFontSize(9);
    doc.text(`Periode: ${formatDate(startDate)} - ${formatDate(endDate)}`, 14, 21);

    const tableData = transactions.map((tx: any) => [formatDate(tx.date), tx.description, tx.category.name, tx.type, formatCurrency(tx.amount)]);
    autoTable(doc, { head: [[t('keuangan.pdfDate'), t('keuangan.pdfDescription'), t('keuangan.pdfCategory'), t('keuangan.pdfType'), t('keuangan.pdfAmount')]], body: tableData, startY: 26, styles: { fontSize: 8 } });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`${t('keuangan.pdfIncome')} ${formatCurrency(stats.totalIncome)}`, 14, finalY);
    doc.text(`${t('keuangan.pdfExpense')} ${formatCurrency(stats.totalExpense)}`, 14, finalY + 5);
    doc.text(`${t('keuangan.pdfBalance')} ${formatCurrency(stats.balance)}`, 14, finalY + 10);
    doc.save(`${t('keuangan.pdfFilenamePrefix')}${startDate}-${endDate}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <Loader2 className="w-12 h-12 animate-spin text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">{t('keuangan.title')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('keuangan.transactions')}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleAddCategory} variant="outline" size="sm" className="h-8 text-xs">
            <Tag className="w-3.5 h-3.5 mr-1.5" />
            {t('keuangan.category')}
          </Button>
          <Button onClick={handleAddTransaction} size="sm" className="h-8 text-xs">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {t('keuangan.addTransaction')}
          </Button>
        </div>
      </div>

      {/* Stats - Cyberpunk Style */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 sm:p-4 hover:border-[#bc13fe]/50 hover:shadow-[0_0_30px_rgba(188,19,254,0.3)] transition-all">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-medium text-[#00f7ff] uppercase tracking-wide">{t('keuangan.income')}</p>
              <p className="text-lg sm:text-xl font-bold text-foreground drop-shadow-none mt-1 truncate">{formatCurrency(stats.totalIncome)}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{stats.incomeCount} trans</p>
            </div>
            <div className="p-1.5 sm:p-2 rounded-lg bg-success/10 shadow-lg flex-shrink-0 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[#bc13fe]/20 space-y-1 text-[10px] sm:text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('keuangan.pppoeLabel')}</span>
              <span className="font-medium text-foreground truncate ml-2">{formatCurrency(stats.pppoeIncome || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('keuangan.hotspotLabel')}</span>
              <span className="font-medium text-foreground truncate ml-2">{formatCurrency(stats.hotspotIncome || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('keuangan.installLabel')}</span>
              <span className="font-medium text-foreground truncate ml-2">{formatCurrency(stats.installIncome || 0)}</span>
            </div>
          </div>
        </div>

        <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 sm:p-4 hover:border-[#bc13fe]/50 hover:shadow-[0_0_30px_rgba(188,19,254,0.3)] transition-all">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-medium text-[#00f7ff] uppercase tracking-wide">{t('keuangan.expense')}</p>
              <p className="text-lg sm:text-xl font-bold text-foreground drop-shadow-none mt-1 truncate">{formatCurrency(stats.totalExpense)}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{stats.expenseCount} trans</p>
            </div>
            <div className="p-1.5 sm:p-2 rounded-lg bg-destructive/10 shadow-lg flex-shrink-0 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
            </div>
          </div>
        </div>

        <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-3 sm:p-4 hover:border-[#bc13fe]/50 hover:shadow-[0_0_30px_rgba(188,19,254,0.3)] transition-all">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-medium text-[#00f7ff] uppercase tracking-wide">{t('keuangan.balance')}</p>
              <p className={`text-lg sm:text-xl font-bold text-foreground mt-1 truncate`}>{formatCurrency(stats.balance)}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{t('keuangan.income')} - {t('keuangan.expense')}</p>
            </div>
            <div className={`p-1.5 sm:p-2 rounded-lg shadow-lg flex-shrink-0 flex items-center justify-center ${stats.balance >= 0 ? "bg-info/10" : "bg-warning/10"}`}>
              <Wallet className={`w-4 h-4 sm:w-5 sm:h-5 ${stats.balance >= 0 ? "text-info" : "text-warning"}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Filter className="w-3.5 h-3.5" />
            {t('common.filter')}
          </div>
          <button onClick={resetFilters} className="text-[10px] text-muted-foreground hover:text-foreground">
            {t('common.reset')}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {["thisMonth", "lastMonth", "thisYear"].map((tp) => (
            <button
              key={tp}
              onClick={() => setQuickDate(tp as any)}
              className="px-2 py-1 text-[10px] bg-muted hover:bg-muted/80 rounded"
            >
              {tp === "thisMonth" ? t('time.thisMonth') : tp === "lastMonth" ? t('time.lastMonth') : t('time.thisYear')}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('keuangan.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs bg-muted border border-border rounded-md"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2 py-1.5 text-xs bg-muted border border-border rounded-md"
          >
            <option value="all">{t('common.all')}</option>
            <option value="INCOME">{t('keuangan.income')}</option>
            <option value="EXPENSE">{t('keuangan.expense')}</option>
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-2 py-1.5 text-xs bg-muted border border-border rounded-md"
          >
            <option value="all">{t('common.all')} {t('common.category')}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1.5 text-xs bg-muted border border-border rounded-md"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-1.5 text-xs bg-muted border border-border rounded-md"
          />
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-card rounded-lg border border-border">
        <div className="p-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">{t('keuangan.transactions')}</span>
          <div className="flex gap-1">
            <button
              onClick={() => handleExport("excel")}
              disabled={!startDate || !endDate}
              className="px-2 py-1 text-[10px] bg-muted hover:bg-muted/80 rounded disabled:opacity-50 flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              Excel
            </button>
            <button
              onClick={() => handleExport("pdf")}
              disabled={!startDate || !endDate}
              className="px-2 py-1 text-[10px] bg-muted hover:bg-muted/80 rounded disabled:opacity-50 flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              PDF
            </button>
          </div>
        </div>

        {/* Bulk Action Toolbar */}
        {(selectedIds.size > 0 || transactions.length > 0) && (
          <div className="px-3 py-2 bg-muted/50 border-b border-border flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={transactions.length > 0 && selectedIds.size === transactions.length}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 accent-primary cursor-pointer"
              />
              <span className="text-[11px] text-muted-foreground">
                {selectedIds.size > 0 ? `${selectedIds.size} dipilih` : 'Pilih semua'}
              </span>
            </label>
            {selectedIds.size > 0 && (
              <>
                <button
                  onClick={handleBulkDelete}
                  className="px-2.5 py-1 text-[11px] bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Hapus Dipilih ({selectedIds.size})
                </button>
                <button
                  onClick={clearSelection}
                  className="px-2.5 py-1 text-[11px] bg-muted text-muted-foreground rounded hover:bg-muted/80"
                >
                  Batal
                </button>
              </>
            )}
            <button
              onClick={handleDeleteByFilter}
              className="ml-auto px-2.5 py-1 text-[11px] border border-destructive/50 text-destructive rounded hover:bg-destructive/10 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Hapus Sesuai Filter ({total})
            </button>
          </div>
        )}

        {/* Mobile Card View */}
        <div className="block sm:hidden divide-y divide-border">
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              {t('common.noData')}
            </div>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className={`p-3 space-y-2 active:bg-muted transition-colors ${selectedIds.has(tx.id) ? 'bg-primary/5' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(tx.id)}
                      onChange={() => toggleSelect(tx.id)}
                      className="w-3.5 h-3.5 accent-primary cursor-pointer flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{tx.description}</p>
                      {tx.notes && <p className="text-[10px] text-muted-foreground truncate">{tx.notes}</p>}
                    </div>
                  </label>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => handleEditTransaction(tx)} className="p-1.5 hover:bg-muted rounded cursor-pointer" title="Edit Transaksi">
                      <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDeleteTransaction(tx)} className="p-1.5 hover:bg-destructive/10 rounded cursor-pointer" title="Hapus Transaksi">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-[9px] px-1.5 py-0 ${tx.type === "INCOME" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {tx.type}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">{tx.category.name}</Badge>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(tx.date)}
                    </span>
                  </div>
                  <span className={`text-xs font-medium flex-shrink-0 ${tx.type === "INCOME" ? "text-success" : "text-destructive"}`}>
                    {tx.type === "INCOME" ? "+" : "-"}{formatCurrency(tx.amount)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="overflow-x-auto hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px]">
                <TableHead className="text-[10px] py-2 w-8"></TableHead>
                <TableHead className="text-[10px] py-2">{t('keuangan.date')}</TableHead>
                <TableHead className="text-[10px] py-2">{t('keuangan.description')}</TableHead>
                <TableHead className="text-[10px] py-2 hidden sm:table-cell">{t('keuangan.category')}</TableHead>
                <TableHead className="text-[10px] py-2">{t('common.type')}</TableHead>
                <TableHead className="text-[10px] py-2 text-right">{t('keuangan.amount')}</TableHead>
                <TableHead className="text-[10px] py-2 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-xs">
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((t) => (
                  <TableRow key={t.id} className={`text-xs ${selectedIds.has(t.id) ? 'bg-primary/5' : ''}`}>
                    <TableCell className="py-2 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        className="w-3.5 h-3.5 accent-primary cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="py-2 text-[10px]">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {formatDate(t.date)}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="font-medium text-xs truncate max-w-[150px]">{t.description}</div>
                      {t.notes && <div className="text-[10px] text-muted-foreground truncate">{t.notes}</div>}
                    </TableCell>
                    <TableCell className="py-2 hidden sm:table-cell">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">{t.category.name}</Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge className={`text-[9px] px-1.5 py-0 ${t.type === "INCOME" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-right font-medium">
                      <span className={t.type === "INCOME" ? "text-success" : "text-destructive"}>
                        {t.type === "INCOME" ? "+" : "-"}{formatCurrency(t.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={() => handleEditTransaction(t)} className="p-1 hover:bg-muted rounded cursor-pointer" title="Edit Transaksi">
                          <Edit className="w-3 h-3 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDeleteTransaction(t)} className="p-1 hover:bg-destructive/10 rounded cursor-pointer" title="Hapus Transaksi">
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {loadingMore && (
          <div className="flex justify-center items-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="ml-2 text-[10px] text-muted-foreground">{t('common.loading')}</span>
          </div>
        )}

        {!loading && !loadingMore && !hasMore && transactions.length > 0 && (
          <div className="text-center py-3 text-[10px] text-muted-foreground">
            {t('table.showing')} {transactions.length} {t('table.of')} {total}
          </div>
        )}
      </div>

      {/* Transaction Dialog */}
      <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingTransaction ? t('common.edit') : t('common.add')} {t('keuangan.transactions')}</DialogTitle>
            <DialogDescription className="text-xs">
              {editingTransaction ? t('common.update') : t('keuangan.addTransaction')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveTransaction} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t('common.type')} *</Label>
                <Select value={transactionForm.type} onValueChange={(v: "INCOME" | "EXPENSE") => setTransactionForm({ ...transactionForm, type: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOME">{t('keuangan.income')}</SelectItem>
                    <SelectItem value="EXPENSE">{t('keuangan.expense')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t('keuangan.category')} *</Label>
                <Select value={transactionForm.categoryId} onValueChange={(v) => setTransactionForm({ ...transactionForm, categoryId: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('common.select')} /></SelectTrigger>
                  <SelectContent>
                    {categories.filter((c) => c.type === transactionForm.type).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t('keuangan.amount')} *</Label>
                <Input
                  type="number"
                  value={transactionForm.amount}
                  onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <Label className="text-xs">{t('keuangan.date')} *</Label>
                <Input
                  type="date"
                  value={transactionForm.date}
                  onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })}
                  className="h-8 text-xs"
                  required
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t('keuangan.description')} *</Label>
              <Input
                value={transactionForm.description}
                onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                className="h-8 text-xs"
                placeholder={t('keuangan.description')}
                required
              />
            </div>
            <div>
              <Label className="text-xs">{t('keuangan.reference')}</Label>
              <Input
                value={transactionForm.reference}
                onChange={(e) => setTransactionForm({ ...transactionForm, reference: e.target.value })}
                className="h-8 text-xs"
                placeholder="Invoice #, etc"
              />
            </div>
            <div>
              <Label className="text-xs">{t('common.notes')}</Label>
              <Textarea
                value={transactionForm.notes}
                onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })}
                className="text-xs"
                placeholder={t('common.notes')}
                rows={2}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setIsTransactionDialogOpen(false)} disabled={processing} size="sm" className="h-8 text-xs">
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={processing} size="sm" className="h-8 text-xs">
                {processing && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{t('keuangan.addCategory')}</DialogTitle>
            <DialogDescription className="text-xs">{t('keuangan.categoryDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCategory} className="space-y-3">
            <div>
              <Label className="text-xs">{t('common.name')} *</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                className="h-8 text-xs"
                placeholder={t('keuangan.categoryPlaceholder')}
                required
              />
            </div>
            <div>
              <Label className="text-xs">{t('common.type')} *</Label>
              <Select value={categoryForm.type} onValueChange={(v: "INCOME" | "EXPENSE") => setCategoryForm({ ...categoryForm, type: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">{t('keuangan.income')}</SelectItem>
                  <SelectItem value="EXPENSE">{t('keuangan.expense')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t('keuangan.description')}</Label>
              <Textarea
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                className="text-xs"
                rows={2}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)} disabled={processing} size="sm" className="h-8 text-xs">
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={processing} size="sm" className="h-8 text-xs">
                {processing && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
