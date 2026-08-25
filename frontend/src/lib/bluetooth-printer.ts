/**
 * Web Bluetooth ESC/POS thermal printer utility.
 *
 * Connects directly to BLE thermal printers (58mm/80mm) using the Web Bluetooth API.
 * Sends ESC/POS commands for printing receipts without a print dialog.
 *
 * Browser support:
 * - Chrome/Edge Android: ✅ Full support (Web Bluetooth)
 * - Chrome/Edge desktop: ✅ Full support (Web Bluetooth)
 * - Safari iOS: ❌ Not supported (fallback to browser print dialog)
 * - Firefox: ❌ Not supported (fallback to browser print dialog)
 * - Salfanet Android APK (WebView): ✅ Full support via native BluetoothPrinterBridge
 *
 * In the Salfanet Android APK, Web Bluetooth is not available in WebView.
 * Instead, a native Kotlin BluetoothPrinterBridge is injected as `AndroidBluetoothPrinter`
 * JavaScript interface. This class auto-detects and uses the native bridge when available.
 *
 * Usage:
 *   const printer = new BluetoothPrinter();
 *   await printer.connect();        // Opens Bluetooth device picker (Web) or pairs with bonded device (APK)
 *   await printer.printReceipt(data);
 *   await printer.disconnect();
 */

// Detect native Android Bluetooth bridge (injected by Salfanet APK WebView)
declare global {
  interface Window {
    AndroidBluetoothPrinter?: {
      isSupported(): boolean;
      isConnected(): boolean;
      getBondedDevices(): string;
      connect(address: string): boolean;
      disconnect(): boolean;
      print(base64Data: string): boolean;
      printText(text: string): boolean;
    };
  }
}

function getNativeBridge(): Window['AndroidBluetoothPrinter'] | null {
  if (typeof window !== 'undefined' && window.AndroidBluetoothPrinter) {
    return window.AndroidBluetoothPrinter;
  }
  return null;
}

function isAndroidWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /SalfanetApp\//.test(navigator.userAgent);
}

// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Common ESC/POS service UUIDs for BLE thermal printers
const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Common BLE printer service
  '0000ff00-0000-1000-8000-00805f9b34fb', // Another common BLE printer service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/MPT printer service
];

// Characteristic UUIDs for write
const PRINTER_CHAR_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb', // Common write characteristic
  '0000ff02-0000-1000-8000-00805f9b34fb', // Alternative write characteristic
  '49535343-8841-43f4-a8d4-ecbe34729bb3', // ISSC write characteristic
];

export interface ThermalReceiptData {
  company: {
    name: string;
    address?: string | null;
    phone?: string | null;
    logo?: string | null;
  };
  customer: {
    name: string;
    customerId?: string | null;
    phone?: string | null;
    username?: string | null;
    area?: string | null;
  };
  invoice: {
    number: string;
    date: string;
    dueDate: string;
    paidAt?: string | null;
    status: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  additionalFees?: Array<{
    name: string;
    amount: number;
  }>;
  amountFormatted: string;
  collectorName?: string;
}

function formatCurrency(value: number) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

export class BluetoothPrinter {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private connected = false;
  private nativeBridge: Window['AndroidBluetoothPrinter'] | null = null;

  /**
   * Check if Bluetooth printing is available — either Web Bluetooth or native Android bridge
   */
  static isSupported(): boolean {
    if (typeof window !== 'undefined' && window.AndroidBluetoothPrinter) {
      return window.AndroidBluetoothPrinter.isSupported();
    }
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  /**
   * Connect to a thermal printer.
   * In Android APK: uses native bridge — shows bonded devices, user selects one.
   * In browser: uses Web Bluetooth device picker.
   */
  async connect(): Promise<boolean> {
    // Check for native Android bridge first
    this.nativeBridge = getNativeBridge();
    if (this.nativeBridge) {
      return this.connectNative();
    }

    if (!BluetoothPrinter.isSupported()) {
      throw new Error('Browser tidak mendukung Web Bluetooth. Gunakan Chrome/Edge di Android atau APK Salfanet.');
    }

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: PRINTER_SERVICE_UUIDS },
        ],
        optionalServices: PRINTER_SERVICE_UUIDS,
      });

      if (!this.device) return false;

      this.device.addEventListener('gattserverdisconnected', () => {
        this.connected = false;
        this.characteristic = null;
      });

      const server = await this.device.gatt?.connect();
      if (!server) throw new Error('Gagal connect ke GATT server');

      // Try each known service/characteristic
      for (const serviceUuid of PRINTER_SERVICE_UUIDS) {
        try {
          const service = await server.getPrimaryService(serviceUuid);
          for (const charUuid of PRINTER_CHAR_UUIDS) {
            try {
              this.characteristic = await service.getCharacteristic(charUuid);
              if (this.characteristic) break;
            } catch { /* try next */ }
          }
          if (this.characteristic) break;
        } catch { /* try next service */ }
      }

      if (!this.characteristic) {
        // Fallback: enumerate all services and characteristics
        const services = await server.getPrimaryServices();
        for (const service of services) {
          const chars = await service.getCharacteristics();
          // Find a writable characteristic
          const writableChar = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
          if (writableChar) {
            this.characteristic = writableChar;
            break;
          }
        }
      }

      if (!this.characteristic) {
        throw new Error('Tidak dapat menemukan karakteristik printer yang dapat ditulis');
      }

      this.connected = true;
      return true;
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        throw new Error('Tidak ada perangkat Bluetooth yang dipilih');
      }
      throw new Error(`Gagal connect ke printer: ${err.message || err}`);
    }
  }

  /**
   * Connect via native Android Bluetooth bridge.
   * Gets list of bonded (paired) Bluetooth devices and lets user select one.
   */
  private async connectNative(): Promise<boolean> {
    if (!this.nativeBridge) throw new Error('Native Bluetooth bridge tidak tersedia');

    const devicesJson = this.nativeBridge.getBondedDevices();
    let devices: Array<{ name: string; address: string }> = [];
    try {
      devices = JSON.parse(devicesJson);
    } catch {
      throw new Error('Gagal membaca daftar perangkat Bluetooth yang sudah dipasangkan');
    }

    if (devices.length === 0) {
      throw new Error('Tidak ada printer Bluetooth yang dipasangkan. Pasangkan printer di Pengaturan Bluetooth Android terlebih dahulu.');
    }

    // Filter for likely printer devices (name-based heuristic)
    const printerDevices = devices.filter(d =>
      /printer|print|thermal|receipt|58mm|80mm|pos|mpt|esc/i.test(d.name)
    );
    const candidates = printerDevices.length > 0 ? printerDevices : devices;

    // If only one candidate, connect directly
    if (candidates.length === 1) {
      const ok = this.nativeBridge.connect(candidates[0].address);
      if (!ok) throw new Error(`Gagal terhubung ke ${candidates[0].name}`);
      this.connected = true;
      return true;
    }

    // Multiple candidates — prompt user to select
    const deviceList = candidates.map((d, i) => `${i + 1}. ${d.name}`).join('\n');
    const selection = prompt(`Pilih printer Bluetooth:\n\n${deviceList}`);
    if (!selection) throw new Error('Tidak ada printer yang dipilih');

    const idx = parseInt(selection, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= candidates.length) {
      throw new Error('Pilihan tidak valid');
    }

    const selected = candidates[idx];
    const ok = this.nativeBridge.connect(selected.address);
    if (!ok) throw new Error(`Gagal terhubung ke ${selected.name}`);
    this.connected = true;
    return true;
  }

  /**
   * Send raw bytes to the printer
   */
  private async write(data: Uint8Array): Promise<void> {
    // Native Android bridge path
    if (this.nativeBridge) {
      // Convert to base64 for JNI transfer
      const base64 = btoa(String.fromCharCode(...data));
      const ok = this.nativeBridge.print(base64);
      if (!ok) throw new Error('Gagal mengirim data ke printer (native)');
      return;
    }

    if (!this.characteristic) throw new Error('Printer belum terhubung');

    // Split into chunks (BLE has MTU limits, typically 20-512 bytes)
    const chunkSize = 180;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
      try {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } catch {
        // Fallback to writeValue
        await this.characteristic.writeValue(chunk);
      }
      // Small delay between chunks to avoid buffer overflow
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  /**
   * Print a thermal receipt using ESC/POS commands
   */
  async printReceipt(data: ThermalReceiptData): Promise<void> {
    if (!this.connected) throw new Error('Printer belum terhubung');

    const encoder = new TextEncoder();
    const commands: number[] = [];

    // Initialize printer
    commands.push(ESC, 0x40); // ESC @ — init
    commands.push(ESC, 0x21, 0x00); // ESC ! — normal font

    // Company name (centered, bold, double height)
    commands.push(ESC, 0x61, 0x01); // ESC a 1 — center
    commands.push(ESC, 0x21, 0x30); // ESC ! 0x30 — double height + width + bold
    commands.push(...encoder.encode(data.company.name));
    commands.push(LF);
    commands.push(ESC, 0x21, 0x00); // Reset font

    // Company address
    if (data.company.address) {
      commands.push(...encoder.encode(data.company.address));
      commands.push(LF);
    }
    if (data.company.phone) {
      commands.push(...encoder.encode(`Telp: ${data.company.phone}`));
      commands.push(LF);
    }

    // Separator
    commands.push(...encoder.encode('-'.repeat(32)));
    commands.push(LF);

    // Invoice header
    commands.push(ESC, 0x61, 0x01); // Center
    commands.push(ESC, 0x21, 0x08); // Bold
    commands.push(...encoder.encode('BUKTI PEMBAYARAN'));
    commands.push(LF);
    commands.push(ESC, 0x21, 0x00); // Reset
    commands.push(ESC, 0x61, 0x00); // Left

    // Separator
    commands.push(...encoder.encode('-'.repeat(32)));
    commands.push(LF);

    // Invoice details (left aligned)
    commands.push(...encoder.encode(`No    : ${data.invoice.number}`));
    commands.push(LF);
    commands.push(...encoder.encode(`Tgl   : ${data.invoice.date}`));
    commands.push(LF);
    if (data.invoice.paidAt) {
      commands.push(...encoder.encode(`Bayar : ${data.invoice.paidAt}`));
      commands.push(LF);
    }
    if (data.collectorName) {
      commands.push(...encoder.encode(`Kolek : ${data.collectorName}`));
      commands.push(LF);
    }

    // Separator
    commands.push(...encoder.encode('-'.repeat(32)));
    commands.push(LF);

    // Customer info
    commands.push(...encoder.encode(`Pelanggan: ${data.customer.name}`));
    commands.push(LF);
    if (data.customer.customerId) {
      commands.push(...encoder.encode(`ID       : ${data.customer.customerId}`));
      commands.push(LF);
    }
    if (data.customer.username) {
      commands.push(...encoder.encode(`User     : ${data.customer.username}`));
      commands.push(LF);
    }
    if (data.customer.area) {
      commands.push(...encoder.encode(`Area     : ${data.customer.area}`));
      commands.push(LF);
    }

    // Separator
    commands.push(...encoder.encode('-'.repeat(32)));
    commands.push(LF);

    // Items
    for (const item of data.items) {
      commands.push(...encoder.encode(item.description));
      commands.push(LF);
      const qtyStr = `  ${item.quantity}x`;
      const priceStr = formatCurrency(item.price);
      const totalStr = formatCurrency(item.total);
      commands.push(...encoder.encode(`${qtyStr.padEnd(12)}${priceStr.padStart(10)}${totalStr.padStart(10)}`));
      commands.push(LF);
    }

    // Additional fees
    if (data.additionalFees) {
      for (const fee of data.additionalFees) {
        commands.push(...encoder.encode(fee.name));
        commands.push(LF);
        commands.push(...encoder.encode(`  1x${formatCurrency(fee.amount).padStart(22)}`));
        commands.push(LF);
      }
    }

    // Separator
    commands.push(...encoder.encode('-'.repeat(32)));
    commands.push(LF);

    // Total (bold, double height)
    commands.push(ESC, 0x21, 0x10); // Double height
    commands.push(ESC, 0x61, 0x01); // Center
    commands.push(...encoder.encode(`TOTAL: ${data.amountFormatted}`));
    commands.push(LF);
    commands.push(ESC, 0x21, 0x00); // Reset
    commands.push(ESC, 0x61, 0x00); // Left

    // Status
    if (data.invoice.status === 'PAID') {
      commands.push(LF);
      commands.push(ESC, 0x61, 0x01); // Center
      commands.push(ESC, 0x21, 0x08); // Bold
      commands.push(...encoder.encode('** LUNAS **'));
      commands.push(LF);
      commands.push(ESC, 0x21, 0x00); // Reset
      commands.push(ESC, 0x61, 0x00); // Left
    }

    // Separator
    commands.push(...encoder.encode('-'.repeat(32)));
    commands.push(LF);

    // Footer
    commands.push(ESC, 0x61, 0x01); // Center
    commands.push(...encoder.encode('Terima kasih'));
    commands.push(LF);
    commands.push(...encoder.encode('Powered by Salfanet Radius'));
    commands.push(LF);

    // Feed and cut
    commands.push(LF, LF, LF, LF); // Feed 4 lines
    commands.push(GS, 0x56, 0x00); // GS V 0 — partial cut

    await this.write(new Uint8Array(commands));
  }

  /**
   * Disconnect from the printer
   */
  async disconnect(): Promise<void> {
    if (this.nativeBridge) {
      this.nativeBridge.disconnect();
      this.connected = false;
      this.nativeBridge = null;
      return;
    }
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.connected = false;
    this.characteristic = null;
    this.device = null;
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}
