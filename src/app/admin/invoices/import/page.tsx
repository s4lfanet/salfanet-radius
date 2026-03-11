'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { showSuccess, showError } from '@/lib/sweetalert';

interface ImportResult {
  row: number;
  username: string;
  status: 'success' | 'error';
  invoiceNumber?: string;
  reason?: string;
}

interface ImportResponse {
  success: boolean;
  total: number;
  imported: number;
  failed: number;
  results: ImportResult[];
  error?: string;
}

interface PreviewRow {
  no: number;
  username: string;
  amount: string;
  dueDate: string;
  notes: string;
}

export default function ImportInvoicePage() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const parseCSVPreview = useCallback((text: string) => {
    setParseError(null);
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length === 0) {
      setParseError('File CSV kosong');
      return;
    }

    const headerLine = lines[0];
    const cols = headerLine.split(',').map((c) => c.trim().toLowerCase());
    setHeaders(cols);

    const required = ['username', 'amount'];
    const missing = required.filter((r) => !cols.includes(r));
    if (missing.length > 0) {
      setParseError(`Kolom yang diperlukan tidak ditemukan: ${missing.join(', ')}`);
      setPreviewRows([]);
      return;
    }

    const usernameIdx = cols.indexOf('username');
    const amountIdx = cols.indexOf('amount');
    const dueDateIdx = cols.findIndex((c) => c === 'duedate' || c === 'due_date');
    const notesIdx = cols.findIndex((c) => c === 'notes' || c === 'note' || c === 'keterangan');

    const preview: PreviewRow[] = [];
    for (let i = 1; i < Math.min(lines.length, 51); i++) {
      const row = lines[i].split(',');
      preview.push({
        no: i,
        username: (row[usernameIdx] || '').trim(),
        amount: (row[amountIdx] || '').trim(),
        dueDate: dueDateIdx >= 0 ? (row[dueDateIdx] || '').trim() : '',
        notes: notesIdx >= 0 ? (row[notesIdx] || '').trim() : '',
      });
    }
    setPreviewRows(preview);
  }, []);

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      showError('Hanya file CSV yang diterima');
      return;
    }
    setSelectedFile(file);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCSVPreview(text);
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleImport = async () => {
    if (!selectedFile) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/admin/invoices/import', {
        method: 'POST',
        body: formData,
      });

      const data: ImportResponse = await res.json();

      if (!res.ok) {
        showError(data.error || 'Gagal mengimport invoice');
        return;
      }

      setImportResult(data);

      if (data.imported > 0) {
        showSuccess(
          `Berhasil import ${data.imported} invoice${data.failed > 0 ? `, ${data.failed} gagal` : ''}`
        );
      } else {
        showError(`Semua ${data.failed} baris gagal diimport`);
      }
    } catch {
      showError('Terjadi kesalahan jaringan');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    window.open('/api/admin/invoices/import', '_blank');
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewRows([]);
    setHeaders([]);
    setImportResult(null);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/invoices">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Kembali
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t('invoicesImport.title')}</h1>
          <p className="text-sm text-gray-500">
            {t('invoicesImport.subtitle')}
          </p>
        </div>
      </div>

      {/* Format Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">{t('invoicesImport.requiredFormat')}</p>
            <p>
              {t('invoicesImport.requiredCols')} <code className="bg-blue-100 px-1 rounded">username</code>,{' '}
              <code className="bg-blue-100 px-1 rounded">amount</code>
            </p>
            <p>
              {t('invoicesImport.optionalCols')} <code className="bg-blue-100 px-1 rounded">dueDate</code> (format: YYYY-MM-DD),{' '}
              <code className="bg-blue-100 px-1 rounded">notes</code>
            </p>
            <p className="mt-1 text-xs">
              {t('invoicesImport.dueDateHint')}{' '}
              <strong>{t('invoicesImport.usernameHint')}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex justify-between items-center mb-4">
        <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
          <Download className="w-4 h-4 mr-2" />
          {t('invoicesImport.downloadTemplate')}
        </Button>
        {selectedFile && (
          <Button variant="ghost" size="sm" onClick={handleReset}>
            {t('invoicesImport.changeFile')}
          </Button>
        )}
      </div>

      {/* Drop Zone */}
      {!selectedFile && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400" />
          <p className="text-lg font-medium text-gray-600">
            {t('invoicesImport.dropZoneText')}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{t('invoicesImport.csvOnly')}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
          />
        </div>
      )}

      {/* Parse Error */}
      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 mt-4">
          <XCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm">{parseError}</span>
        </div>
      )}

      {/* CSV Preview */}
      {selectedFile && !parseError && previewRows.length > 0 && !importResult && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-sm">{selectedFile.name}</span>
              <Badge variant="secondary">{previewRows.length} {t('invoicesImport.rowsPreview')}</Badge>
            </div>
            <Button onClick={handleImport} disabled={isUploading} className="min-w-[140px]">
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('invoicesImport.importing')}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  {t('invoicesImport.importNow')}
                </>
              )}
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => (
                  <TableRow key={row.no}>
                    <TableCell className="text-gray-400">{row.no}</TableCell>
                    <TableCell className="font-mono text-sm">{row.username || <span className="text-red-500 italic">{t('invoicesImport.empty')}</span>}</TableCell>
                    <TableCell>
                      {row.amount
                        ? `Rp ${Number(row.amount.replace(/[^0-9]/g, '')).toLocaleString('id-ID')}`
                        : <span className="text-red-500 italic">{t('invoicesImport.empty')}</span>}
                    </TableCell>
                    <TableCell className="text-sm">{row.dueDate || <span className="text-gray-400 italic">{t('invoicesImport.plus7days')}</span>}</TableCell>
                    <TableCell className="text-sm text-gray-500">{row.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {previewRows.length === 50 && (
          <p className="text-xs text-muted-foreground mt-1 text-center">
              {t('invoicesImport.showing50')}
            </p>
          )}
        </div>
      )}

      {/* Import Results */}
      {importResult && (
        <div className="mt-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center border">
              <p className="text-2xl font-bold text-gray-700">{importResult.total}</p>
              <p className="text-sm text-gray-500">{t('invoicesImport.totalRows')}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center border border-green-200">
              <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
              <p className="text-sm text-green-700">{t('invoicesImport.successImported')}</p>
            </div>
            <div className={`rounded-lg p-4 text-center border ${importResult.failed > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50'}`}>
              <p className={`text-2xl font-bold ${importResult.failed > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {importResult.failed}
              </p>
              <p className={`text-sm ${importResult.failed > 0 ? 'text-red-700' : 'text-gray-400'}`}>{t('invoicesImport.failed')}</p>
            </div>
          </div>

          {/* Button row */}
          <div className="flex gap-2 mb-4">
            <Link href="/admin/invoices">
              <Button variant="outline">{t('invoicesImport.viewList')}</Button>
            </Link>
            <Button variant="ghost" onClick={handleReset}>
              {t('invoicesImport.importAnother')}
            </Button>
          </div>

          {/* Detail Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Baris</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invoice / Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importResult.results.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-gray-400">{r.row}</TableCell>
                    <TableCell className="font-mono text-sm">{r.username}</TableCell>
                    <TableCell>
                      {r.status === 'success' ? (
                        <Badge className="bg-green-100 text-green-700 border-green-300">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Berhasil
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 border-red-300">
                          <XCircle className="w-3 h-3 mr-1" />
                          Gagal
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.status === 'success' ? (
                        <span className="font-mono text-green-700">{r.invoiceNumber}</span>
                      ) : (
                        <span className="text-red-600">{r.reason}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
