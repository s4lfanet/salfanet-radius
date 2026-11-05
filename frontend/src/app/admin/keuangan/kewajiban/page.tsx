'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, Download, FileText, Loader2, Plus, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiAdmin } from '@/lib/api';
import { buildQueryKey, useApiQuery, useQueryClient } from '@/lib/api/hooks';
import { showConfirm, showError, showSuccess } from '@/lib/sweetalert';
import { formatWIB, nowWIB } from '@/lib/timezone';

type AdjustmentType = 'WRITE_OFF' | 'INTERCONNECTION' | 'NON_TELECOM' | 'OTHER_REVENUE';
type RevenueBasis = 'ISSUED' | 'COLLECTED';

interface Figures {
  invoiceRevenue: number;
  ledgerRevenue: number;
  otherRevenue: number;
  ppn: number;
  writeOff: number;
  interconnection: number;
  nonTelecom: number;
  gross: number;
  base: number;
  bhp: number;
  uso: number;
  pphFinal: number;
}

interface Adjustment {
  id: string;
  month: number;
  type: AdjustmentType;
  amount: number;
  description: string;
  invoiceNumber: string | null;
  ignored: string | null;
}

interface Category {
  id: string;
  name: string;
  counted: boolean;
  ledgerAmount: number;
}

interface Settings {
  configured: boolean;
  bhpRate: number;
  usoRate: number;
  pphFinalRate: number;
  revenueBasis: RevenueBasis;
  npwp: string;
  licenseNumber: string;
}

interface Report {
  year: number;
  settings: Settings;
  months: (Figures & { month: number })[];
  total: Figures;
  adjustments: Adjustment[];
  categories: Category[];
}

const API = '/api/keuangan/kewajiban';
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
  WRITE_OFF: 'Piutang tak tertagih',
  INTERCONNECTION: 'Interkoneksi ke penyelenggara lain',
  NON_TELECOM: 'Pendapatan bukan telekomunikasi',
  OTHER_REVENUE: 'Pendapatan di luar panel',
};
const BASIS_LABELS: Record<RevenueBasis, string> = {
  ISSUED: 'Tagihan terbit',
  COLLECTED: 'Pembayaran diterima',
};

const rupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
const deductions = (f: Figures) => f.writeOff + f.interconnection + f.nonTelecom;

type AdjustmentForm = { type: AdjustmentType; month: string; amount: string; description: string; invoiceNumber: string };

/**
 * Kewajiban BHP & USO: the base and the amounts for one book year, the deductions
 * billing cannot know, and the file the finance staff works from. Nothing here
 * touches a customer invoice: both levies are the ISP's own cost.
 */
export default function KewajibanPage() {
  const queryClient = useQueryClient();
  const currentYear = Number(formatWIB(nowWIB(), 'yyyy'));
  const [year, setYear] = useState(currentYear);
  const [form, setForm] = useState<AdjustmentForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  const query = useApiQuery<Report>(API, { params: { year: String(year) }, placeholderData: 'keepPreviousData' });
  const report = query.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: buildQueryKey(API) });

  const saveAdjustment = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      await apiAdmin(`${API}/adjustments`, {
        method: 'POST',
        body: JSON.stringify({ ...form, year, month: Number(form.month), amount: Number(form.amount.replace(/\D/g, '')) }),
      });
      setForm(null);
      refresh();
      await showSuccess('Penyesuaian dicatat.');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Gagal menyimpan penyesuaian.');
    } finally {
      setSaving(false);
    }
  };

  const removeAdjustment = async (a: Adjustment) => {
    if (!(await showConfirm(`"${a.description}" (${rupiah(a.amount)}) dihapus dari perhitungan.`, 'Hapus penyesuaian?', 'Hapus'))) return;
    try {
      await apiAdmin(`${API}/adjustments?id=${encodeURIComponent(a.id)}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Gagal menghapus penyesuaian.');
    }
  };

  const exportRows = (r: Report) => {
    const row = (label: string, f: Figures) => ({
      Periode: label,
      'Pendapatan kotor': f.gross,
      Pengurang: deductions(f),
      'Dasar BHP dan USO': f.base,
      PPN: f.ppn,
      BHP: f.bhp,
      USO: f.uso,
      ...(r.settings.pphFinalRate > 0 ? { 'PPh Final': f.pphFinal } : {}),
    });
    return [...r.months.map((m) => row(MONTHS[m.month - 1], m)), row(`Total ${r.year}`, r.total)];
  };

  const exportExcel = async () => {
    if (!report) return;
    setExporting('excel');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows(report)), 'Rekap');
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(report.adjustments.map((a) => ({
          Bulan: MONTHS[a.month - 1],
          Jenis: ADJUSTMENT_LABELS[a.type],
          Jumlah: a.amount,
          Keterangan: a.description,
          'No. Tagihan': a.invoiceNumber ?? '',
          Catatan: a.ignored ?? '',
        }))),
        'Penyesuaian',
      );
      XLSX.writeFile(wb, `Kewajiban_BHP_USO_${report.year}.xlsx`);
    } catch (err) {
      await showError('Gagal export Excel: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    if (!report) return;
    setExporting('pdf');
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const { settings } = report;

      doc.setFontSize(15);
      doc.text(`Rekap BHP Telekomunikasi dan USO ${report.year}`, 15, 18);
      doc.setFontSize(9);
      doc.text(
        [
          `NPWP: ${settings.npwp || '-'}   Izin: ${settings.licenseNumber || '-'}`,
          `Dasar pendapatan: ${BASIS_LABELS[settings.revenueBasis]}, tanpa PPN   BHP ${settings.bhpRate}%   USO ${settings.usoRate}%`,
          `Dicetak: ${formatWIB(new Date())}`,
        ],
        15,
        25,
      );

      const rows = exportRows(report);
      const headers = Object.keys(rows[0]);
      autoTable(doc, {
        head: [headers],
        body: rows.map((r) => Object.values(r).map((v) => (typeof v === 'number' ? rupiah(v) : v))),
        startY: 40,
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: Object.fromEntries(headers.slice(1).map((_, i) => [i + 1, { halign: 'right' as const }])),
        margin: { left: 15, right: 15 },
      });
      doc.save(`Kewajiban_BHP_USO_${report.year}.pdf`);
    } catch (err) {
      await showError('Gagal export PDF: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(null);
    }
  };

  if (query.isError && !report) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
        <p className="mt-2 text-sm text-foreground">Laporan kewajiban tidak bisa dimuat.</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => query.refetch()}>Coba lagi</Button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Memuat laporan" />
      </div>
    );
  }

  const { settings, total } = report;
  const showPph = settings.pphFinalRate > 0;
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">Kewajiban BHP & USO</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dibayar dari pendapatan ISP, tidak ditambahkan ke tagihan pelanggan. Tahun buku {report.year} jatuh tempo 30 April {report.year + 1}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28" aria-label="Tahun buku"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" /> Pengaturan
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel} disabled={!!exporting}>
            {exporting === 'excel' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />} Excel
          </Button>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={!!exporting}>
            {exporting === 'pdf' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />} PDF
          </Button>
        </div>
      </header>

      {!settings.configured && (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground">
          Angka di bawah memakai tarif bawaan. Buka Pengaturan, periksa tarif dan kategorinya, lalu simpan untuk menyalakan pengingat setiap April.
        </p>
      )}

      <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Dasar perhitungan" value={total.base} note={`${rupiah(total.gross)} dikurangi ${rupiah(deductions(total))}`} />
        <Stat label={`BHP ${settings.bhpRate}%`} value={total.bhp} note="Perkiraan yang harus dibayar" />
        <Stat label={`USO ${settings.usoRate}%`} value={total.uso} note="Perkiraan yang harus dibayar" />
        <Stat label="PPN dipungut" value={total.ppn} note="Tidak termasuk dasar perhitungan" />
      </dl>

      <Panel title={`Rekap bulanan ${report.year}`} aside={<span className="text-xs text-muted-foreground">Dasar: {BASIS_LABELS[settings.revenueBasis]}</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2 font-medium">Bulan</th>
                {['Pendapatan kotor', 'Pengurang', 'Dasar', 'PPN', 'BHP', 'USO', ...(showPph ? ['PPh Final'] : [])].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.months.map((m) => (
                <FigureRow key={m.month} label={MONTHS[m.month - 1]} figures={m} showPph={showPph} />
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border">
              <FigureRow label={`Total ${report.year}`} figures={total} showPph={showPph} strong />
            </tfoot>
          </table>
        </div>
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          Total BHP dan USO dihitung dari total dasar, jadi bisa berbeda beberapa rupiah dari jumlah kolom bulanan.
        </p>
      </Panel>

      <Panel
        title="Penyesuaian"
        aside={
          <Button size="sm" variant="outline" onClick={() => setForm({ type: 'WRITE_OFF', month: String(year === currentYear ? Number(formatWIB(nowWIB(), 'M')) : 12), amount: '', description: '', invoiceNumber: '' })}>
            <Plus className="mr-1.5 h-4 w-4" /> Tambah
          </Button>
        }
      >
        {report.adjustments.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Belum ada penyesuaian di {report.year}. Catat tagihan yang tidak akan tertagih, biaya interkoneksi, dan pendapatan bukan telekomunikasi di sini.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {report.adjustments.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-foreground">{a.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[MONTHS[a.month - 1], ADJUSTMENT_LABELS[a.type], a.invoiceNumber].filter(Boolean).join(' · ')}
                  </p>
                  {a.ignored && <p className="mt-1 text-xs text-destructive">Tidak dihitung. {a.ignored}</p>}
                </div>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${a.ignored ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                  {a.type === 'OTHER_REVENUE' ? '+' : '-'}{rupiah(a.amount)}
                </span>
                <button
                  type="button"
                  aria-label={`Hapus ${a.description}`}
                  onClick={() => removeAdjustment(a)}
                  className="-m-1 rounded p-2 text-muted-foreground hover:text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-xs text-muted-foreground">
        Ini alat bantu hitung. Cocokkan dengan pedoman dan surat tagihan Komdigi sebelum membayar. Sumber: PP 43/2023, Permen Kominfo 5/2021.
      </p>

      <AdjustmentDialog form={form} saving={saving} onChange={setForm} onSubmit={saveAdjustment} onClose={() => setForm(null)} />
      {settingsOpen && <SettingsDialog report={report} onClose={() => setSettingsOpen(false)} onSaved={refresh} />}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="min-w-0 bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-lg font-bold tabular-nums text-foreground">{rupiah(value)}</dd>
      <dd className="mt-0.5 text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

function FigureRow({ label, figures, showPph, strong }: { label: string; figures: Figures; showPph: boolean; strong?: boolean }) {
  const cells = [figures.gross, deductions(figures), figures.base, figures.ppn, figures.bhp, figures.uso, ...(showPph ? [figures.pphFinal] : [])];
  return (
    <tr className={strong ? 'font-semibold text-foreground' : 'text-foreground'}>
      <th scope="row" className="whitespace-nowrap px-4 py-2 text-left font-medium">{label}</th>
      {cells.map((value, i) => (
        <td key={i} className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{rupiah(value)}</td>
      ))}
    </tr>
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

function AdjustmentDialog({ form, saving, onChange, onSubmit, onClose }: {
  form: AdjustmentForm | null;
  saving: boolean;
  onChange: (form: AdjustmentForm) => void;
  onSubmit: (ev: FormEvent) => void;
  onClose: () => void;
}) {
  const writeOff = form?.type === 'WRITE_OFF';
  return (
    <Dialog open={!!form} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah penyesuaian</DialogTitle>
          <DialogDescription>
            {writeOff
              ? 'Tagihan tetap tercatat belum dibayar. Jumlahnya diambil dari tagihan, tanpa PPN.'
              : 'Masukkan jumlah tanpa PPN.'}
          </DialogDescription>
        </DialogHeader>
        {form && (
          <form id="adjustment-form" onSubmit={onSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="adj-type">Jenis</Label>
                <Select value={form.type} onValueChange={(v) => onChange({ ...form, type: v as AdjustmentType })}>
                  <SelectTrigger id="adj-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ADJUSTMENT_LABELS) as AdjustmentType[]).map((t) => <SelectItem key={t} value={t}>{ADJUSTMENT_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adj-month">Bulan</Label>
                <Select value={form.month} onValueChange={(v) => onChange({ ...form, month: v })}>
                  <SelectTrigger id="adj-month"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {writeOff ? (
              <div className="space-y-1.5">
                <Label htmlFor="adj-invoice">Nomor tagihan</Label>
                <Input id="adj-invoice" required value={form.invoiceNumber} onChange={(e) => onChange({ ...form, invoiceNumber: e.target.value })} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="adj-amount">Jumlah (Rp)</Label>
                <Input id="adj-amount" required inputMode="numeric" value={form.amount} onChange={(e) => onChange({ ...form, amount: e.target.value })} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="adj-description">Keterangan</Label>
              <Input id="adj-description" required maxLength={255} value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} />
            </div>
          </form>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" form="adjustment-form" disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({ report, onClose, onSaved }: { report: Report; onClose: () => void; onSaved: () => void }) {
  const { settings, categories } = report;
  const [bhpRate, setBhpRate] = useState(String(settings.bhpRate));
  const [usoRate, setUsoRate] = useState(String(settings.usoRate));
  const [pphFinalRate, setPphFinalRate] = useState(String(settings.pphFinalRate));
  const [revenueBasis, setRevenueBasis] = useState<RevenueBasis>(settings.revenueBasis);
  const [npwp, setNpwp] = useState(settings.npwp);
  const [licenseNumber, setLicenseNumber] = useState(settings.licenseNumber);
  const [counted, setCounted] = useState(() => new Set(categories.filter((c) => c.counted).map((c) => c.id)));
  const [saving, setSaving] = useState(false);

  const toggle = (id: string, on: boolean) => {
    const next = new Set(counted);
    if (on) next.add(id);
    else next.delete(id);
    setCounted(next);
  };

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    try {
      const rate = (value: string) => Number(value.replace(',', '.'));
      await apiAdmin(`${API}/settings`, {
        method: 'PUT',
        body: JSON.stringify({
          bhpRate: rate(bhpRate),
          usoRate: rate(usoRate),
          pphFinalRate: rate(pphFinalRate),
          revenueBasis,
          ledgerCategoryIds: [...counted],
          npwp,
          licenseNumber,
        }),
      });
      onSaved();
      onClose();
      await showSuccess('Pengaturan disimpan.');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pengaturan BHP & USO</DialogTitle>
          <DialogDescription>Tarif berlaku untuk semua tahun yang dibuka di halaman ini.</DialogDescription>
        </DialogHeader>
        <form id="settings-form" onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <RateField id="rate-bhp" label="BHP (%)" value={bhpRate} onChange={setBhpRate} />
            <RateField id="rate-uso" label="USO (%)" value={usoRate} onChange={setUsoRate} />
            <RateField id="rate-pph" label="PPh Final (%)" value={pphFinalRate} onChange={setPphFinalRate} />
          </div>
          <p className="text-xs text-muted-foreground">
            Isi PPh Final hanya bila ISP memakai tarif UMKM. Angka 0 menyembunyikan kolomnya.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="basis">Dasar pendapatan</Label>
            <Select value={revenueBasis} onValueChange={(v) => setRevenueBasis(v as RevenueBasis)}>
              <SelectTrigger id="basis"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ISSUED">{BASIS_LABELS.ISSUED}</SelectItem>
                <SelectItem value="COLLECTED">{BASIS_LABELS.COLLECTED}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Ikuti metode pembukuan perusahaan. Tanyakan ke akuntan bila ragu.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="npwp">NPWP</Label>
              <Input id="npwp" maxLength={32} value={npwp} onChange={(e) => setNpwp(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="license">Nomor izin</Label>
              <Input id="license" maxLength={100} value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Kategori pemasukan yang dihitung</legend>
            <p className="text-xs text-muted-foreground">
              Pembayaran tagihan selalu dihitung sekali dari tagihannya. Jumlah di sini adalah total kategori di Riwayat Transaksi {report.year}, sudah termasuk PPN.
            </p>
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={counted.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{rupiah(c.ledgerAmount)}</span>
              </label>
            ))}
          </fieldset>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" form="settings-form" disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} required inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
