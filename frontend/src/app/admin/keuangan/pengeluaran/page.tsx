'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, Plus, Pencil, Trash2, Repeat, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiAdmin } from '@/lib/api';
import { useApiQuery, useQueryClient, buildQueryKey } from '@/lib/api/hooks';
import { showConfirm, showError, showSuccess } from '@/lib/sweetalert';
import { formatWIB, nowWIB } from '@/lib/timezone';

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  amount: number;
  count: number;
  previousAmount: number;
}

interface Expense {
  id: string;
  categoryId: string;
  amount: number;
  description: string;
  date: string;
  reference: string | null;
  notes: string | null;
  createdBy: string | null;
  category: { id: string; name: string };
}

interface ExpensesResponse {
  success: boolean;
  month: string;
  previousMonth: string;
  totalIncome: number;
  totalExpense: number;
  totalExpensePrev: number;
  net: number;
  byCategory: CategoryRow[];
  expenses: Expense[];
}

const API = '/api/keuangan/expenses';
const rupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const monthLabel = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return `${MONTHS[mm - 1]} ${y}`;
};

/** Same day-of-month in another month, clamped to that month's last day. */
function sameDayIn(month: string, isoDate: string) {
  const [y, m] = month.split('-').map(Number);
  const day = Number(formatWIB(isoDate, 'd'));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

type FormState = { id?: string; categoryId: string; amount: string; description: string; date: string; reference: string; notes: string };

/**
 * Biaya Operasional: costs paid out of revenue (bandwidth, salaries,
 * equipment, rent...) for one month, set against that month's income so
 * the page answers "how much is left after running the network?".
 * Entries are ordinary EXPENSE transactions, so they also appear in
 * Riwayat Transaksi and the ledger export.
 */
export default function BiayaOperasionalPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => formatWIB(nowWIB(), 'yyyy-MM'));
  const [category, setCategory] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);

  const query = useApiQuery<ExpensesResponse>(API, { params: { month }, placeholderData: 'keepPreviousData' });
  const data = query.data;
  const categories = useMemo(() => data?.byCategory ?? [], [data]);
  const expenses = useMemo(() => (data?.expenses ?? []).filter((e) => !category || e.categoryId === category), [data, category]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: buildQueryKey(API) });
    queryClient.invalidateQueries({ queryKey: buildQueryKey('/api/keuangan/transactions') });
  };

  const openNew = () => {
    const today = formatWIB(nowWIB(), 'yyyy-MM-dd');
    setForm({
      categoryId: category ?? '',
      amount: '',
      description: '',
      date: today.startsWith(month) ? today : `${month}-01`,
      reference: '',
      notes: '',
    });
  };

  const openEdit = (e: Expense) =>
    setForm({
      id: e.id,
      categoryId: e.categoryId,
      amount: String(e.amount),
      description: e.description,
      date: formatWIB(e.date, 'yyyy-MM-dd'),
      reference: e.reference ?? '',
      notes: e.notes ?? '',
    });

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!form) return;
    const amount = Number(form.amount.replace(/\D/g, ''));
    if (!form.categoryId || !form.description.trim() || !amount) {
      await showError('Kategori, jumlah, dan keterangan wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const body = { ...form, type: 'EXPENSE', amount, description: form.description.trim() };
      await apiAdmin('/api/keuangan/transactions', { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      setForm(null);
      refresh();
      await showSuccess(form.id ? 'Biaya diperbarui.' : 'Biaya dicatat.');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Gagal menyimpan biaya.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: Expense) => {
    if (!(await showConfirm(`"${e.description}" (${rupiah(e.amount)}) dihapus dari catatan biaya.`, 'Hapus biaya?', 'Hapus'))) return;
    try {
      await apiAdmin(`/api/keuangan/transactions?id=${encodeURIComponent(e.id)}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Gagal menghapus biaya.');
    }
  };

  const installCategories = async () => {
    try {
      const res = await apiAdmin<{ created: number }>(API, { method: 'POST' });
      refresh();
      await showSuccess(`${res.created} kategori biaya ditambahkan.`);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Gagal menambah kategori.');
    }
  };

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat biaya operasional…
      </div>
    );
  }

  if (query.isError || !data) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
        <p className="mt-2 text-sm font-medium text-foreground">Biaya operasional tidak bisa dimuat</p>
        <p className="mt-1 text-xs text-muted-foreground">{query.error instanceof Error ? query.error.message : 'Periksa koneksi lalu coba lagi.'}</p>
        <Button className="mt-4" size="sm" variant="outline" onClick={() => query.refetch()}>Coba lagi</Button>
      </div>
    );
  }

  const share = data.totalIncome > 0 ? Math.round((data.totalExpense / data.totalIncome) * 100) : null;
  const delta = data.totalExpense - data.totalExpensePrev;
  const activeCategories = categories.filter((c) => c.isActive);
  const selected = categories.find((c) => c.id === category);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Biaya Operasional</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pengeluaran yang dibayar dari pendapatan: bandwidth, gaji, alat, sewa, dan lainnya.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="bulan" className="text-xs text-muted-foreground">Bulan</Label>
            <Input
              id="bulan"
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="h-10 w-[11rem]"
            />
          </div>
          <Button variant="outline" className="h-10" onClick={() => setRepeatOpen(true)}>
            <Repeat className="mr-1.5 h-4 w-4" /> Ulangi dari {MONTHS[Number(data.previousMonth.slice(5)) - 1]}
          </Button>
          <Button className="h-10" onClick={openNew} disabled={activeCategories.length === 0}>
            <Plus className="mr-1.5 h-4 w-4" /> Catat biaya
          </Button>
        </div>
      </header>

      {/* The page's one question: what is left of this month's income. */}
      <section className="rounded-xl border border-border bg-card">
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Figure label={`Pendapatan ${monthLabel(month)}`} value={rupiah(data.totalIncome)} hint="Semua pemasukan tercatat" />
          <Figure
            label="Biaya operasional"
            value={rupiah(data.totalExpense)}
            hint={
              share === null
                ? delta === 0 ? 'Sama dengan bulan lalu' : `${delta > 0 ? 'Naik' : 'Turun'} ${rupiah(Math.abs(delta))} dari bulan lalu`
                : `${share}% dari pendapatan · ${delta === 0 ? 'sama dengan bulan lalu' : `${delta > 0 ? 'naik' : 'turun'} ${rupiah(Math.abs(delta))}`}`
            }
          />
          <Figure
            label="Sisa setelah biaya"
            value={rupiah(data.net)}
            hint={data.net < 0 ? 'Biaya melebihi pendapatan bulan ini' : 'Pendapatan dikurangi biaya'}
            tone={data.net < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}
            focal
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Panel
          title="Per kategori"
          aside={category ? <button className="rounded text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:text-blue-400" onClick={() => setCategory(null)}>Tampilkan semua</button> : null}
        >
          {categories.length === 0 ? (
            <div className="p-4 text-sm">
              <p className="text-foreground">Belum ada kategori biaya.</p>
              <p className="mt-1 text-xs text-muted-foreground">Pasang kategori umum ISP (bandwidth, gaji, peralatan, listrik, sewa, dan lainnya), lalu sesuaikan di Riwayat Transaksi.</p>
              <Button size="sm" className="mt-3" onClick={installCategories}>Pasang kategori bawaan</Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {categories.map((c) => {
                const pct = data.totalExpense > 0 ? (c.amount / data.totalExpense) * 100 : 0;
                const on = category === c.id;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setCategory(on ? null : c.id)}
                      aria-pressed={on}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${on ? 'bg-muted' : ''}`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={`min-w-0 truncate text-sm ${c.amount > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{c.name}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{rupiah(c.amount)}</span>
                      </div>
                      {/* Share of this month's costs; the label carries the number, the bar only the proportion. */}
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1.5 flex justify-between gap-2 text-xs text-muted-foreground">
                        <span>{c.count} catatan{c.amount > 0 ? ` · ${Math.round(pct)}%` : ''}</span>
                        <span>Bulan lalu {rupiah(c.previousAmount)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={selected ? `Catatan biaya · ${selected.name}` : 'Catatan biaya'} aside={<span className="text-xs text-muted-foreground">{expenses.length} catatan</span>}>
          {expenses.length === 0 ? (
            <div className="p-6 text-center text-sm">
              <p className="text-foreground">{selected ? `Belum ada biaya ${selected.name} di ${monthLabel(month)}.` : `Belum ada biaya tercatat di ${monthLabel(month)}.`}</p>
              <p className="mt-1 text-xs text-muted-foreground">Catat setiap pembayaran, misalnya tagihan bandwidth, gaji teknisi, atau pembelian ONT.</p>
              {activeCategories.length > 0 && (
                <Button size="sm" className="mt-3" onClick={openNew}>
                  <Plus className="mr-1.5 h-4 w-4" /> Catat biaya
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="w-12 shrink-0 text-center">
                    <div className="text-lg font-bold leading-none text-foreground">{formatWIB(e.date, 'd')}</div>
                    <div className="mt-0.5 text-[11px] uppercase text-muted-foreground">{formatWIB(e.date, 'MMM')}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-foreground">{e.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[e.category.name, e.reference && `Ref. ${e.reference}`, e.createdBy && `oleh ${e.createdBy}`].filter(Boolean).join(' · ')}
                    </p>
                    {e.notes && !e.notes.startsWith('{') && <p className="mt-1 break-words text-xs text-muted-foreground">{e.notes}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums text-foreground">{rupiah(e.amount)}</span>
                    <div className="flex">
                      <IconButton label={`Ubah ${e.description}`} onClick={() => openEdit(e)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton label={`Hapus ${e.description}`} onClick={() => remove(e)} danger>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <ExpenseDialog
        form={form}
        categories={activeCategories}
        saving={saving}
        onChange={setForm}
        onSubmit={save}
        onClose={() => setForm(null)}
      />
      {repeatOpen && <RepeatDialog month={month} previousMonth={data.previousMonth} onClose={() => setRepeatOpen(false)} onDone={refresh} />}
    </div>
  );
}

function Figure({ label, value, hint, tone, focal }: { label: string; value: string; hint: string; tone?: string; focal?: boolean }) {
  return (
    <div className="min-w-0 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate font-bold tabular-nums ${focal ? 'text-2xl' : 'text-xl'} ${tone ?? 'text-foreground'}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${danger ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-muted hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}

function ExpenseDialog({
  form,
  categories,
  saving,
  onChange,
  onSubmit,
  onClose,
}: {
  form: FormState | null;
  categories: CategoryRow[];
  saving: boolean;
  onChange: (f: FormState) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}) {
  const set = (patch: Partial<FormState>) => form && onChange({ ...form, ...patch });
  return (
    <Dialog open={form !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{form?.id ? 'Ubah biaya' : 'Catat biaya'}</DialogTitle>
          <DialogDescription>Biaya dicatat sebagai pengeluaran dan mengurangi sisa pendapatan bulan itu.</DialogDescription>
        </DialogHeader>
        {form && (
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label>Kategori *</Label>
              <Select value={form.categoryId} onValueChange={(v) => set({ categoryId: v })}>
                <SelectTrigger className="mt-1 h-10">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="jumlah">Jumlah (Rp) *</Label>
                <Input
                  id="jumlah"
                  inputMode="numeric"
                  className="mt-1 h-10"
                  placeholder="1500000"
                  value={form.amount}
                  onChange={(e) => set({ amount: e.target.value.replace(/\D/g, '') })}
                />
              </div>
              <div>
                <Label htmlFor="tanggal">Tanggal bayar *</Label>
                <Input id="tanggal" type="date" className="mt-1 h-10" value={form.date} onChange={(e) => set({ date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="ket">Keterangan *</Label>
              <Input id="ket" className="mt-1 h-10" placeholder="Bayar bandwidth upstream Oktober" value={form.description} onChange={(e) => set({ description: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ref">No. nota / referensi</Label>
              <Input id="ref" className="mt-1 h-10" value={form.reference} onChange={(e) => set({ reference: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="catatan">Catatan</Label>
              <Textarea id="catatan" rows={2} className="mt-1" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {form.id ? 'Simpan' : 'Catat biaya'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Bandwidth, salaries and rent repeat every month. This copies chosen
 * entries from the previous month to the same day of the selected month,
 * so staff only adjust amounts that changed.
 */
function RepeatDialog({ month, previousMonth, onClose, onDone }: { month: string; previousMonth: string; onClose: () => void; onDone: () => void }) {
  const prev = useApiQuery<ExpensesResponse>(API, { params: { month: previousMonth } });
  const items = prev.data?.expenses ?? [];
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [running, setRunning] = useState(false);
  const chosen = picked ?? new Set(items.map((e) => e.id));

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const run = async () => {
    setRunning(true);
    let ok = 0;
    try {
      for (const e of items.filter((i) => chosen.has(i.id))) {
        await apiAdmin('/api/keuangan/transactions', {
          method: 'POST',
          body: JSON.stringify({
            type: 'EXPENSE',
            categoryId: e.categoryId,
            amount: e.amount,
            description: e.description,
            date: sameDayIn(month, e.date),
            reference: '',
            notes: e.notes && !e.notes.startsWith('{') ? e.notes : '',
          }),
        });
        ok++;
      }
      onDone();
      onClose();
      await showSuccess(`${ok} biaya disalin ke ${monthLabel(month)}.`);
    } catch (err) {
      onDone();
      await showError(`${ok} tersalin, lalu gagal: ${err instanceof Error ? err.message : 'kesalahan tidak diketahui'}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ulangi biaya {monthLabel(previousMonth)}</DialogTitle>
          <DialogDescription>Biaya yang dipilih dicatat lagi di {monthLabel(month)} pada tanggal yang sama. Jumlahnya bisa diubah setelah disalin.</DialogDescription>
        </DialogHeader>
        {prev.isPending ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat biaya bulan lalu…</div>
        ) : prev.isError ? (
          <p className="py-4 text-sm text-destructive">Biaya bulan lalu tidak bisa dimuat.</p>
        ) : items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Tidak ada biaya tercatat di {monthLabel(previousMonth)}.</p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {items.map((e) => (
              <li key={e.id}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/60">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={chosen.has(e.id)} onChange={() => toggle(e.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm text-foreground">{e.description}</span>
                    <span className="block text-xs text-muted-foreground">{e.category.name} · tgl {formatWIB(e.date, 'd')}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{rupiah(e.amount)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={run} disabled={running || chosen.size === 0 || items.length === 0}>
            {running && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Salin {chosen.size} biaya
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
