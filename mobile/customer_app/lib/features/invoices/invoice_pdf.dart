import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import '../../core/formatters.dart';
import '../../core/media_url.dart';
import '../../core/theme/app_theme.dart';
import '../../models/invoice_detail.dart';

/// Mirrors frontend/src/lib/invoice-print.ts's "standard" layout so a
/// customer's PDF looks the same whether it came from the web portal or
/// this app — same sections, same fields, just rendered natively instead
/// of via an HTML print window.
Future<Uint8List> buildInvoicePdf(InvoiceDetailData inv) async {
  final doc = pw.Document();
  final brand = PdfColor.fromInt(kBrandSeed.toARGB32());

  pw.MemoryImage? logo;
  final logoUrl = resolveMediaUrl(inv.company.logo);
  if (logoUrl != null) {
    try {
      final res = await Dio().get<List<int>>(logoUrl, options: Options(responseType: ResponseType.bytes));
      if (res.data != null) logo = pw.MemoryImage(Uint8List.fromList(res.data!));
    } catch (_) {
      // Missing/unreachable logo just means the PDF ships without one.
    }
  }

  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(28),
      build: (context) => [
        _header(inv, brand, logo),
        pw.SizedBox(height: 4),
        pw.Divider(color: brand, thickness: 1.5),
        pw.SizedBox(height: 12),
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Expanded(child: _infoCard('DARI', [
              pw.Text(inv.company.name, style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
              if (inv.company.address?.isNotEmpty ?? false) pw.Text(inv.company.address!),
              if (inv.company.phone?.isNotEmpty ?? false) pw.Text('Telp: ${inv.company.phone}'),
            ])),
            pw.SizedBox(width: 16),
            pw.Expanded(child: _infoCard('KEPADA', [
              pw.Text(inv.customer.name, style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
              if (inv.customer.customerId?.isNotEmpty ?? false) _labelRow('ID Pelanggan', inv.customer.customerId!),
              if (inv.customer.phone?.isNotEmpty ?? false) _labelRow('Telp', inv.customer.phone!),
              if (inv.customer.username?.isNotEmpty ?? false) _labelRow('Username', inv.customer.username!),
              if (inv.customer.area?.isNotEmpty ?? false) _labelRow('Area', inv.customer.area!),
            ])),
          ],
        ),
        pw.SizedBox(height: 12),
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Expanded(child: _infoCard('DETAIL INVOICE', [
              _labelRow('No Invoice', inv.number),
              _labelRow('Tanggal', inv.date),
              _labelRow('Jatuh Tempo', inv.dueDate),
              if (inv.paidAt != null) _labelRow('Tgl Bayar', inv.paidAt!),
            ])),
            pw.SizedBox(width: 16),
            pw.Expanded(child: _infoCard('STATUS PEMBAYARAN', [
              pw.Text(
                inv.isPaid ? 'LUNAS' : (inv.status.toUpperCase() == 'OVERDUE' ? 'TERLAMBAT' : 'BELUM BAYAR'),
                style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
              ),
              if (inv.paidVia != null) _labelRow('Via', inv.paidVia == 'gateway' ? 'Payment Gateway' : 'Manual'),
            ])),
          ],
        ),
        pw.SizedBox(height: 16),
        pw.Text('RINCIAN LAYANAN', style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700, letterSpacing: 1)),
        pw.SizedBox(height: 6),
        _itemsTable(inv, brand),
        pw.SizedBox(height: 20),
        if (inv.isPaid)
          pw.Center(
            child: pw.Container(
              padding: const pw.EdgeInsets.symmetric(horizontal: 24, vertical: 10),
              decoration: pw.BoxDecoration(border: pw.Border.all(color: PdfColors.green700, width: 2.5), borderRadius: pw.BorderRadius.circular(8)),
              child: pw.Column(children: [
                pw.Text('LUNAS', style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold, color: PdfColors.green700, letterSpacing: 4)),
                if (inv.paidAt != null) pw.Text('Dibayar pada ${inv.paidAt}', style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
              ]),
            ),
          )
        else if (inv.company.bankAccounts.isNotEmpty) ...[
          pw.Text('PEMBAYARAN MANUAL', style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700, letterSpacing: 1)),
          pw.SizedBox(height: 6),
          pw.Wrap(
            spacing: 10,
            runSpacing: 10,
            children: inv.company.bankAccounts
                .map((ba) => pw.Container(
                      width: 160,
                      padding: const pw.EdgeInsets.all(10),
                      decoration: pw.BoxDecoration(border: pw.Border.all(color: brand, width: 0.7), borderRadius: pw.BorderRadius.circular(6)),
                      child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
                        pw.Text(ba.bankName, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: brand, fontSize: 11)),
                        pw.Text(ba.accountNumber, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 13)),
                        pw.Text('a/n ${ba.accountName}', style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
                      ]),
                    ))
                .toList(),
          ),
        ],
        pw.SizedBox(height: 24),
        pw.Divider(color: PdfColors.grey300),
        pw.Center(
          child: pw.Column(children: [
            pw.Text('Terima kasih atas kepercayaan Anda, ${inv.company.name}', style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey500)),
            if (inv.company.poweredBy?.isNotEmpty ?? false)
              pw.Text('Support by ${inv.company.poweredBy}', style: const pw.TextStyle(fontSize: 7.5, color: PdfColors.grey400)),
          ]),
        ),
      ],
    ),
  );

  return doc.save();
}

pw.Widget _header(InvoiceDetailData inv, PdfColor brand, pw.MemoryImage? logo) {
  return pw.Row(
    crossAxisAlignment: pw.CrossAxisAlignment.start,
    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
    children: [
      pw.Row(children: [
        if (logo != null) ...[
          pw.Container(width: 52, height: 52, alignment: pw.Alignment.center, child: pw.Image(logo, fit: pw.BoxFit.contain)),
          pw.SizedBox(width: 12),
        ],
        pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Text(inv.company.name, style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold, color: brand)),
          if (inv.company.address?.isNotEmpty ?? false) pw.Text(inv.company.address!, style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700)),
          if (inv.company.phone?.isNotEmpty ?? false) pw.Text('Telp: ${inv.company.phone}', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700)),
        ]),
      ]),
      pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
        pw.Text('INVOICE', style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold, letterSpacing: 2)),
        pw.Text(inv.number, style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: brand)),
        pw.SizedBox(height: 3),
        pw.Container(
          padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: pw.BoxDecoration(
            color: inv.isPaid ? PdfColors.green50 : PdfColors.orange50,
            borderRadius: pw.BorderRadius.circular(10),
          ),
          child: pw.Text(
            inv.isPaid ? 'SUDAH BAYAR' : 'BELUM BAYAR',
            style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: inv.isPaid ? PdfColors.green800 : PdfColors.orange800),
          ),
        ),
      ]),
    ],
  );
}

pw.Widget _infoCard(String title, List<pw.Widget> children) {
  return pw.Container(
    width: double.infinity,
    padding: const pw.EdgeInsets.all(10),
    decoration: pw.BoxDecoration(color: PdfColors.grey100, borderRadius: pw.BorderRadius.circular(8)),
    child: pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Text(title, style: pw.TextStyle(fontSize: 8, color: PdfColors.grey600, letterSpacing: 0.8)),
        pw.SizedBox(height: 4),
        ...children,
      ],
    ),
  );
}

pw.Widget _labelRow(String label, String value) {
  return pw.Padding(
    padding: const pw.EdgeInsets.only(top: 2),
    child: pw.RichText(
      text: pw.TextSpan(
        style: const pw.TextStyle(fontSize: 9, color: PdfColors.black),
        children: [
          pw.TextSpan(text: '$label: ', style: const pw.TextStyle(color: PdfColors.grey600)),
          pw.TextSpan(text: value),
        ],
      ),
    ),
  );
}

pw.Widget _itemsTable(InvoiceDetailData inv, PdfColor brand) {
  final rows = <List<String>>[
    for (final item in inv.items) [item.description, '${item.quantity}', formatCurrency(item.price), formatCurrency(item.total)],
    for (final fee in inv.additionalFees) [fee.name, '1', formatCurrency(fee.amount), formatCurrency(fee.amount)],
  ];

  return pw.Column(children: [
    pw.TableHelper.fromTextArray(
      headers: const ['Deskripsi', 'Qty', 'Harga', 'Total'],
      data: rows,
      headerStyle: pw.TextStyle(color: PdfColors.white, fontWeight: pw.FontWeight.bold, fontSize: 9),
      headerDecoration: pw.BoxDecoration(color: brand),
      cellStyle: const pw.TextStyle(fontSize: 9),
      cellAlignments: {0: pw.Alignment.centerLeft, 1: pw.Alignment.center, 2: pw.Alignment.centerRight, 3: pw.Alignment.centerRight},
      columnWidths: {0: const pw.FlexColumnWidth(3), 1: const pw.FlexColumnWidth(1), 2: const pw.FlexColumnWidth(1.5), 3: const pw.FlexColumnWidth(1.5)},
      border: null,
      oddRowDecoration: const pw.BoxDecoration(color: PdfColors.grey50),
      cellPadding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 5),
    ),
    if (inv.tax.hasTax) ...[
      pw.SizedBox(height: 4),
      _totalLine('Subtotal', formatCurrency(inv.tax.baseAmount), PdfColors.grey700),
      _totalLine('PPN ${inv.tax.taxRate.toStringAsFixed(0)}%', formatCurrency(inv.tax.taxAmount), PdfColors.orange800),
    ],
    pw.SizedBox(height: 4),
    pw.Container(
      padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: pw.BoxDecoration(color: PdfColors.grey100, borderRadius: pw.BorderRadius.circular(6)),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text('TOTAL', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12)),
          pw.Text(inv.amountFormatted, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 13)),
        ],
      ),
    ),
  ]);
}

pw.Widget _totalLine(String label, String value, PdfColor color) {
  return pw.Padding(
    padding: const pw.EdgeInsets.symmetric(vertical: 2, horizontal: 10),
    child: pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Text(label, style: pw.TextStyle(fontSize: 9, color: color)),
        pw.Text(value, style: pw.TextStyle(fontSize: 9, color: color)),
      ],
    ),
  );
}
