import 'server-only';
import { createHash } from 'crypto';
import { unzipSync } from 'fflate';

/** What an APK says about itself: enough to offer it as an in-app update. */
export interface ApkMeta {
  packageName: string;
  versionCode: number;
  versionName?: string;
  /** SHA-256 of the signing certificate. Android installs an update only when it matches the installed app. */
  signerSha256?: string;
}

// android:versionCode / android:versionName resource ids, for manifests
// whose attribute names were stripped to resource references.
const ATTR_VERSION_CODE = 0x0101021b;
const ATTR_VERSION_NAME = 0x0101021c;

/** Reads package, version and signer from an APK file, or null if it is not a readable APK. */
export function readApkMeta(apk: Uint8Array): ApkMeta | null {
  try {
    const files = unzipSync(apk, { filter: (f) => f.name === 'AndroidManifest.xml' });
    const xml = files['AndroidManifest.xml'];
    if (!xml) return null;
    const manifest = parseManifest(Buffer.from(xml.buffer, xml.byteOffset, xml.byteLength));
    if (!manifest) return null;
    return { ...manifest, signerSha256: signerSha256(Buffer.from(apk.buffer, apk.byteOffset, apk.byteLength)) };
  } catch {
    return null;
  }
}

/** The <manifest> element's package, versionCode and versionName from compiled (binary) XML. */
function parseManifest(b: Buffer): Omit<ApkMeta, 'signerSha256'> | null {
  if (b.readUInt16LE(0) !== 0x0003) return null;
  let strings: string[] = [];
  let resIds: number[] = [];
  let off = b.readUInt16LE(2);
  while (off + 8 <= b.length) {
    const type = b.readUInt16LE(off);
    const headerSize = b.readUInt16LE(off + 2);
    const size = b.readUInt32LE(off + 4);
    if (size < 8) return null;
    if (type === 0x0001) {
      strings = readStringPool(b, off);
    } else if (type === 0x0180) {
      resIds = [];
      for (let p = off + headerSize; p < off + size; p += 4) resIds.push(b.readUInt32LE(p));
    } else if (type === 0x0102) {
      // The first element is <manifest>.
      const attrStart = off + headerSize + b.readUInt16LE(off + 24);
      const attrSize = b.readUInt16LE(off + 26);
      const attrCount = b.readUInt16LE(off + 28);
      let packageName = '';
      let versionCode: number | undefined;
      let versionName: string | undefined;
      for (let i = 0; i < attrCount; i++) {
        const a = attrStart + i * attrSize;
        const nameIdx = b.readUInt32LE(a + 4);
        const raw = b.readUInt32LE(a + 8);
        const dataType = b.readUInt8(a + 15);
        const data = b.readUInt32LE(a + 16);
        const name = strings[nameIdx] ?? '';
        const resId = resIds[nameIdx];
        const str = raw !== 0xffffffff ? strings[raw] : dataType === 0x03 ? strings[data] : undefined;
        if (name === 'package') packageName = str ?? '';
        else if (name === 'versionCode' || resId === ATTR_VERSION_CODE) versionCode = dataType === 0x03 ? Number(str) : data;
        else if (name === 'versionName' || resId === ATTR_VERSION_NAME) versionName = str;
      }
      if (!packageName || versionCode === undefined || !Number.isFinite(versionCode)) return null;
      return { packageName, versionCode, versionName };
    }
    off += size;
  }
  return null;
}

function readStringPool(b: Buffer, chunk: number): string[] {
  const count = b.readUInt32LE(chunk + 8);
  const utf8 = (b.readUInt32LE(chunk + 16) & 0x100) !== 0;
  const stringsStart = chunk + b.readUInt32LE(chunk + 20);
  const offsets = chunk + b.readUInt16LE(chunk + 2);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let p = stringsStart + b.readUInt32LE(offsets + i * 4);
    if (utf8) {
      // Character count, then byte count; each one or two bytes.
      p += b[p] & 0x80 ? 2 : 1;
      let len = b[p];
      if (len & 0x80) {
        len = ((len & 0x7f) << 8) | b[p + 1];
        p += 2;
      } else p += 1;
      out.push(b.toString('utf8', p, p + len));
    } else {
      let len = b.readUInt16LE(p);
      if (len & 0x8000) {
        len = ((len & 0x7fff) << 16) | b.readUInt16LE(p + 2);
        p += 4;
      } else p += 2;
      out.push(b.toString('utf16le', p, p + len * 2));
    }
  }
  return out;
}

/**
 * SHA-256 of the first signer's certificate, from the APK Signing Block
 * (signature scheme v2, else v3). Undefined for an APK without one.
 */
function signerSha256(b: Buffer): string | undefined {
  // End of central directory record: at least 22 bytes from the end, plus a comment of up to 64 KB.
  let eocd = -1;
  for (let p = b.length - 22; p >= Math.max(0, b.length - 22 - 0xffff); p--) {
    if (b.readUInt32LE(p) === 0x06054b50) {
      eocd = p;
      break;
    }
  }
  if (eocd < 0) return undefined;
  const cdOffset = b.readUInt32LE(eocd + 16);
  if (cdOffset < 32 || b.toString('latin1', cdOffset - 16, cdOffset) !== 'APK Sig Block 42') return undefined;
  const blockSize = Number(b.readBigUInt64LE(cdOffset - 24));
  const blockStart = cdOffset - blockSize - 8;
  if (blockStart < 0) return undefined;

  const pairs = new Map<number, Buffer>();
  for (let p = blockStart + 8; p < cdOffset - 24; ) {
    const len = Number(b.readBigUInt64LE(p));
    pairs.set(b.readUInt32LE(p + 8), b.subarray(p + 12, p + 8 + len));
    p += 8 + len;
  }
  const scheme = pairs.get(0x7109871a) ?? pairs.get(0xf05368c0);
  if (!scheme) return undefined;

  // signers → first signer → signed data → (digests, certificates → first certificate)
  const prefixed = (buf: Buffer, at: number) => buf.subarray(at + 4, at + 4 + buf.readUInt32LE(at));
  const signers = prefixed(scheme, 0);
  const signer = prefixed(signers, 0);
  const signedData = prefixed(signer, 0);
  const digests = prefixed(signedData, 0);
  const certificates = prefixed(signedData, 4 + digests.length);
  const cert = prefixed(certificates, 0);
  return cert.length ? createHash('sha256').update(cert).digest('hex') : undefined;
}
