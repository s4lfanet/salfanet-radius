import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { formatCurrencyExport, formatDateExport } from "@/lib/utils/export";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/config";
import { formatWIB } from '@/lib/timezone';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC } from "@/lib/timezone";
import { prisma } from '@/server/db/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "excel"; // excel or pdf
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const type = searchParams.get("type"); // INCOME, EXPENSE, or all
    const categoryId = searchParams.get("categoryId");
    const search = searchParams.get("search");

    // Prepare date filters (optional)
    const where: any = {};

    if (startDate && endDate) {
      const startFilter = startOfDayWIBtoUTC(startDate);
      const endFilter = endOfDayWIBtoUTC(endDate);
      where.date = { gte: startFilter, lte: endFilter };
    }

    if (type && type !== "all") {
      where.type = type;
    }

    if (categoryId && categoryId !== "all") {
      where.categoryId = categoryId;
    }

    if (search) {
      where.OR = [
        { description: { contains: search } },
        { notes: { contains: search } },
      ];
    }

    // Get transactions
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: {
        date: "asc",
      },
    });

    // Calculate stats
    const totalIncome = transactions
      .filter((t) => t.type === "INCOME")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalExpense = transactions
      .filter((t) => t.type === "EXPENSE")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const balance = totalIncome - totalExpense;

    // Income breakdown by category
    const pppoeIncome = transactions
      .filter(
        (t) => t.type === "INCOME" && t.category.name === "Pembayaran PPPoE",
      )
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const pppoeCount = transactions.filter(
      (t) => t.type === "INCOME" && t.category.name === "Pembayaran PPPoE",
    ).length;

    const hotspotIncome = transactions
      .filter(
        (t) => t.type === "INCOME" && t.category.name === "Pembayaran Hotspot",
      )
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const hotspotCount = transactions.filter(
      (t) => t.type === "INCOME" && t.category.name === "Pembayaran Hotspot",
    ).length;

    const installIncome = transactions
      .filter(
        (t) => t.type === "INCOME" && t.category.name === "Biaya Instalasi",
      )
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const installCount = transactions.filter(
      (t) => t.type === "INCOME" && t.category.name === "Biaya Instalasi",
    ).length;

    if (format === "excel") {
      return await exportToExcel(transactions, {
        startDate,
        endDate,
        totalIncome,
        totalExpense,
        balance,
        pppoeIncome,
        pppoeCount,
        hotspotIncome,
        hotspotCount,
        installIncome,
        installCount,
      });
    } else {
      return exportToPDF(transactions, {
        startDate,
        endDate,
        totalIncome,
        totalExpense,
        balance,
        pppoeIncome,
        pppoeCount,
        hotspotIncome,
        hotspotCount,
        installIncome,
        installCount,
      });
    }
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 },
    );
  }
}

async function exportToExcel(transactions: any[], stats: any) {
  // Prepare data for Excel
  const data: Array<{
    Tanggal: string;
    Deskripsi: string;
    Kategori: string;
    Tipe: string;
    Jumlah: number | string;
    Referensi: string;
    Catatan: string;
  }> = transactions.map((t) => ({
    Tanggal: formatWIB(t.date, 'dd/MM/yyyy'),
    Deskripsi: t.description,
    Kategori: t.category.name,
    Tipe: t.type,
    Jumlah: Number(t.amount),
    Referensi: t.reference || "-",
    Catatan: t.notes || "-",
  }));

  // Add summary rows
  data.push({ Tanggal: "", Deskripsi: "", Kategori: "", Tipe: "", Jumlah: "", Referensi: "", Catatan: "" });
  data.push({
    Tanggal: "RINGKASAN",
    Deskripsi: "",
    Kategori: "",
    Tipe: "",
    Jumlah: "",
    Referensi: "",
    Catatan: "",
  });
  data.push({
    Tanggal: "Total Income",
    Deskripsi: "",
    Kategori: "",
    Tipe: "",
    Jumlah: stats.totalIncome,
    Referensi: "",
    Catatan: "",
  });
  data.push({
    Tanggal: "  - PPPoE",
    Deskripsi: "",
    Kategori: "",
    Tipe: "",
    Jumlah: stats.pppoeIncome || 0,
    Referensi: `${stats.pppoeCount || 0} transaksi`,
    Catatan: "",
  });
  data.push({
    Tanggal: "  - Hotspot",
    Deskripsi: "",
    Kategori: "",
    Tipe: "",
    Jumlah: stats.hotspotIncome || 0,
    Referensi: `${stats.hotspotCount || 0} transaksi`,
    Catatan: "",
  });
  data.push({
    Tanggal: "  - Instalasi",
    Deskripsi: "",
    Kategori: "",
    Tipe: "",
    Jumlah: stats.installIncome || 0,
    Referensi: `${stats.installCount || 0} transaksi`,
    Catatan: "",
  });
  data.push({
    Tanggal: "Total Expense",
    Deskripsi: "",
    Kategori: "",
    Tipe: "",
    Jumlah: stats.totalExpense,
    Referensi: "",
    Catatan: "",
  });
  data.push({
    Tanggal: "Net Balance",
    Deskripsi: "",
    Kategori: "",
    Tipe: "",
    Jumlah: stats.balance,
    Referensi: "",
    Catatan: "",
  });

  // Create workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Transaksi Keuangan");

  // Add headers
  const headers = Object.keys(data[0] || {});
  worksheet.columns = headers.map(header => ({
    header: header,
    key: header,
    width: 15
  }));

  // Add data
  data.forEach(row => {
    worksheet.addRow(row);
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // Return as downloadable file
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Laporan-Keuangan-${stats.startDate || 'semua'}-${stats.endDate || 'semua'}.xlsx"`,
    },
  });
}

function exportToPDF(transactions: any[], stats: any) {
  // Generate PDF data for client-side rendering
  const headers = ['No', 'Tanggal', 'Deskripsi', 'Kategori', 'Tipe', 'Jumlah'];
  
  const rows = transactions.map((t, idx) => [
    idx + 1,
    formatDateExport(t.date),
    t.description,
    t.category.name,
    t.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran',
    formatCurrencyExport(Number(t.amount))
  ]);

  const summary = [
    { label: 'Total Pemasukan', value: formatCurrencyExport(stats.totalIncome) },
    { label: 'Total Pengeluaran', value: formatCurrencyExport(stats.totalExpense) },
    { label: 'Saldo', value: formatCurrencyExport(stats.balance) },
    { label: 'Transaksi', value: `${transactions.length}` }
  ];

  return NextResponse.json({
    transactions,
    stats,
    pdfData: {
      title: 'Laporan Keuangan - SALFANET RADIUS',
      headers,
      rows,
      summary,
      generatedAt: formatWIB(new Date())
    }
  });
}
