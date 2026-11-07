/**
 * Candidate SNMP profiles per OLT family. Where each profile comes from, and how far it
 * has been checked, is in docs/features/OLT-SNMP-REFERENCE.md.
 *
 * Sources: vendor MIB files (C-Data FD-ONU / CDATA-GPON, NSCRTV EPON and GPON, V-SOL V1600D,
 * all from the LibreNMS MIB set); field notes from a C-Data GPON walk on an FD1608S (V3.3.86)
 * and an FD1601S (V3.2.5) and a C-Data EPON OLT with 258 ONUs, in the KusumaVision NMS (MIT) and
 * the operator's own NMS; the OID table of the open source OLT_MGMT project for HSGQ.
 * None of these was run against live hardware by the author of this file, so every profile is a
 * candidate that discovery validates, not a promise.
 */
import type { PonProfile } from './pon-snmp';

const NSCRTV_EPON_ONU = '1.3.6.1.4.1.17409.2.3.4.1.1';
const NSCRTV_EPON_OPTICS = '1.3.6.1.4.1.17409.2.3.4.2.1';
const NSCRTV_GPON_ONU = '1.3.6.1.4.1.17409.2.8.4.1.1';
const NSCRTV_GPON_OPTICS = '1.3.6.1.4.1.17409.2.8.4.4.1';
const CDATA_GPON = '1.3.6.1.4.1.34592.1.5.1.1.2.18';
const FD_ONU = '1.3.6.1.4.1.34592.1.3.4.1.1';

/**
 * The China broadcast-industry EPON standard; C-Data, Hioso and others implement it.
 * The position is in the name ("epon 0/1/3 onu 5 label"), the index is a fallback.
 * Column .28 is not listed: on C-Data firmware it repeats the MAC (.7) for every ONU.
 */
export const NSCRTV_EPON: PonProfile = {
  id: 'nscrtv-epon',
  label: 'NSCRTV EPON (17409)',
  tech: 'EPON',
  index: 'epon-device',
  positionFromName: true,
  online: [1],
  scale: 'centi',
  columns: {
    status: `${NSCRTV_EPON_ONU}.8`,
    name: `${NSCRTV_EPON_ONU}.2`,
    mac: `${NSCRTV_EPON_ONU}.7`,
    distance: `${NSCRTV_EPON_ONU}.15`,
    rx: `${NSCRTV_EPON_OPTICS}.4`,
    tx: `${NSCRTV_EPON_OPTICS}.5`,
    // ponOpRxPowerOfOnu: "OLT pon port received onu optical power", centi-dBm, one index per ONU.
    oltRx: '1.3.6.1.4.1.17409.2.3.3.6.1.2',
  },
};

/**
 * C-Data GPON as verified on FD1608S and FD1601S. The index is a global sequence from
 * 0x480001, so the position and customer label come from the name ("gpon 0/0/3 onu 5 label").
 * Rx is centi-dBm with -1 for an offline ONU; the cause column says LOS or dying-gasp.
 */
export const NSCRTV_GPON: PonProfile = {
  id: 'nscrtv-gpon',
  label: 'NSCRTV GPON (17409)',
  tech: 'GPON',
  index: 'gpon-sequence',
  positionFromName: true,
  online: [1],
  scale: 'centi',
  columns: {
    status: `${NSCRTV_GPON_ONU}.7`,
    name: `${NSCRTV_GPON_ONU}.2`,
    serial: `${NSCRTV_GPON_ONU}.3`,
    distance: `${NSCRTV_GPON_ONU}.9`,
    // The operator's sheet lists Rx as column 3; the MIB makes column 3 the port index.
    rx: `${NSCRTV_GPON_OPTICS}.4`,
    tx: `${NSCRTV_GPON_OPTICS}.5`,
    mac: '1.3.6.1.4.1.17409.2.3.4.7.1.3',
    downCause: `${NSCRTV_GPON_ONU}.103`,
  },
};

/**
 * C-Data's own GPON tree. Field notes: not reliable on current firmware (an FD1601S lists no
 * ONUs there and an FD1608S reports three online ONUs as offline), so it is a last resort.
 */
export const CDATA_GPON_PROFILE: PonProfile = {
  id: 'cdata-gpon',
  label: 'C-Data GPON (34592.1.5)',
  tech: 'GPON',
  index: 'dotted',
  lastResort: true,
  online: [1],
  scale: 'auto',
  columns: {
    status: `${CDATA_GPON}.2.1.1`,
    serial: `${CDATA_GPON}.1.1.4`,
    name: `${CDATA_GPON}.1.1.8`,
    distance: `${CDATA_GPON}.2.1.4`,
    rx: `${CDATA_GPON}.6.1.4`,
    tx: `${CDATA_GPON}.6.1.2`,
  },
};

/**
 * C-Data FD-ONU-MIB. DeviceStatus is notPresent(1) offline(2) online(3) normal(4)
 * abnormal(5): online is 3 to 5, not 1. The 2017 revision of the MIB has Rx at .36;
 * the 2014 revision has it at .35, so both are listed. Neither table exists on the two
 * current GPON models, so this is for older firmware.
 */
export const FD_ONU_2017: PonProfile = {
  id: 'fd-onu-2017',
  label: 'C-Data FD-ONU (rev. 2017)',
  tech: 'EPON',
  index: 'dotted',
  online: [3, 4, 5],
  scale: 'auto',
  columns: {
    status: `${FD_ONU}.11`,
    name: `${FD_ONU}.4`,
    serial: `${FD_ONU}.3`,
    mac: `${FD_ONU}.7`,
    distance: `${FD_ONU}.13`,
    rx: `${FD_ONU}.36`,
    tx: `${FD_ONU}.37`,
  },
};

export const FD_ONU_2014: PonProfile = {
  ...FD_ONU_2017,
  id: 'fd-onu-2014',
  label: 'C-Data FD-ONU (rev. 2014)',
  columns: {
    status: `${FD_ONU}.11`,
    name: `${FD_ONU}.39`,
    serial: `${FD_ONU}.3`,
    mac: `${FD_ONU}.7`,
    distance: `${FD_ONU}.12`,
    rx: `${FD_ONU}.35`,
    tx: `${FD_ONU}.36`,
  },
};

/** The C-Data EPON table used by the operator's own NMS. Not checked against the MIB. */
export const CDATA_EPON_NMS: PonProfile = {
  id: 'cdata-epon-nms',
  label: 'C-Data EPON (34592.1.3.4.1.2)',
  tech: 'EPON',
  index: 'dotted',
  lastResort: true,
  online: [1],
  scale: 'auto',
  columns: {
    status: '1.3.6.1.4.1.34592.1.3.4.1.2.1.1.10',
    serial: '1.3.6.1.4.1.34592.1.3.4.1.2.1.1.3',
    name: '1.3.6.1.4.1.34592.1.3.4.1.2.1.1.7',
    rx: '1.3.6.1.4.1.34592.1.3.4.1.5.1.1.2',
  },
};

export const CDATA_PROFILES: PonProfile[] = [NSCRTV_EPON, NSCRTV_GPON, FD_ONU_2017, FD_ONU_2014, CDATA_GPON_PROFILE, CDATA_EPON_NMS];

/**
 * HSGQ (Shenzhen HS Fiber, 50224). Two table schemes exist and the model does not say which:
 * 50224.3.12 (firmware "ID", GPON) and 50224.3.3 (older EPON). The meaning of the status column is
 * claimed differently by three sources (3.12: column 3 or 5; 3.3: column 8 or 9) and was never seen
 * with an offline ONU, so every combination is a candidate and hsgq.ts picks the one whose online
 * count matches the OLT's own per-PON counters. Values are hundredths of a dBm / metre.
 */
const HSGQ_BASE: Pick<PonProfile, 'online' | 'scale' | 'index' | 'tech'> = { online: [1], scale: 'centi', index: 'hsgq', tech: 'EPON' };
const HSGQ_ID_TABLE = '1.3.6.1.4.1.50224.3.12.2.1';
const HSGQ_ID_OPTIC = '1.3.6.1.4.1.50224.3.12.3.1';
const HSGQ_OLD_TABLE = '1.3.6.1.4.1.50224.3.3.2.1';
const HSGQ_OLD_OPTIC = '1.3.6.1.4.1.50224.3.3.3.1';

const hsgqId = (id: string, statusColumn: number): PonProfile => ({
  ...HSGQ_BASE,
  id,
  label: `HSGQ 50224.3.12 (status kolom ${statusColumn})`,
  columns: {
    status: `${HSGQ_ID_TABLE}.${statusColumn}`,
    name: `${HSGQ_ID_TABLE}.2`,
    distance: `${HSGQ_ID_TABLE}.19`,
    downCause: `${HSGQ_ID_TABLE}.22`,
    rx: `${HSGQ_ID_OPTIC}.4`,
    tx: `${HSGQ_ID_OPTIC}.5`,
  },
});

const hsgqOld = (id: string, statusColumn: number): PonProfile => ({
  ...HSGQ_BASE,
  id,
  label: `HSGQ 50224.3.3 (status kolom ${statusColumn})`,
  columns: {
    status: `${HSGQ_OLD_TABLE}.${statusColumn}`,
    name: `${HSGQ_OLD_TABLE}.2`,
    mac: `${HSGQ_OLD_TABLE}.7`,
    distance: `${HSGQ_OLD_TABLE}.15`,
    rx: `${HSGQ_OLD_OPTIC}.4`,
    tx: `${HSGQ_OLD_OPTIC}.5`,
  },
});

export const HSGQ_PROFILES: PonProfile[] = [hsgqId('hsgq-id-3', 3), hsgqId('hsgq-id-5', 5), hsgqOld('hsgq-old-9', 9), hsgqOld('hsgq-old-8', 8)];

/** Per-PON ONU counters of the OLT itself (registered, online, offline), indexed by PON. */
export const HSGQ_PON_ONLINE = '1.3.6.1.4.1.50224.3.2.3.1.4';
/** Scalars: read with an exact GET. The system subtrees around them hold credentials. */
export const HSGQ_CPU = '1.3.6.1.4.1.50224.3.1.1.17';
export const HSGQ_MEMORY = '1.3.6.1.4.1.50224.3.1.1.18';

/** V-SOL branch seen on newer models (reported for a V1600G in an Observium ticket). */
export const VSOL_G: PonProfile = {
  id: 'vsol-g',
  label: 'V-SOL (37950.1.1.6)',
  tech: 'GPON',
  index: 'dotted',
  online: [1],
  scale: 'auto',
  columns: {
    status: '1.3.6.1.4.1.37950.1.1.6.1.1.1.1.5',
    rx: '1.3.6.1.4.1.37950.1.1.6.1.1.3.1.7',
    tx: '1.3.6.1.4.1.37950.1.1.6.1.1.3.1.6',
    distance: '1.3.6.1.4.1.37950.1.1.6.1.1.12.1.3',
  },
};

/**
 * The per-brand tables of the operator's NMS. That NMS was run on ZTE and Hioso; these rows were
 * not all seen on hardware, so each one is a candidate: V-SOL after the MIB tables above, the
 * others only when the brand's Telnet or SSH reader found nothing. Online is 1 unless noted.
 */
const nmsProfile = (
  id: string,
  label: string,
  columns: PonProfile['columns'],
  options: Partial<Pick<PonProfile, 'online' | 'index' | 'tech'>> = {},
): PonProfile => ({ id, label, tech: 'EPON', index: 'packed', online: [1], scale: 'auto', lastResort: true, columns, ...options });

export const VSOL_NMS = nmsProfile('vsol-nms', 'V-SOL (37950.1.1.5.12.1.1)', {
  serial: '1.3.6.1.4.1.37950.1.1.5.12.1.1.1.1',
  status: '1.3.6.1.4.1.37950.1.1.5.12.1.1.1.2',
  name: '1.3.6.1.4.1.37950.1.1.5.12.1.1.1.6',
  rx: '1.3.6.1.4.1.37950.1.1.5.12.1.3.1.2',
});

export const HUAWEI_NMS = nmsProfile('huawei-nms', 'Huawei GPON (2011.6.128)', {
  serial: '1.3.6.1.4.1.2011.6.128.1.1.2.43.1.3',
  status: '1.3.6.1.4.1.2011.6.128.1.1.2.46.1.15',
  name: '1.3.6.1.4.1.2011.6.128.1.1.2.43.1.9',
  distance: '1.3.6.1.4.1.2011.6.128.1.1.2.46.1.20',
  rx: '1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4',
}, { tech: 'GPON', index: 'huawei-ifindex' });

export const BDCOM_NMS = nmsProfile('bdcom-nms', 'BDCOM (3320.101.10)', {
  serial: '1.3.6.1.4.1.3320.101.10.1.1.3',
  status: '1.3.6.1.4.1.3320.101.10.1.1.26',
  name: '1.3.6.1.4.1.3320.101.10.1.1.8',
  distance: '1.3.6.1.4.1.3320.101.10.1.1.27',
  rx: '1.3.6.1.4.1.3320.101.10.5.1.5',
}, { online: [1, 3] });

export const FIBERHOME_NMS = nmsProfile('fiberhome-nms', 'FiberHome (5765.1.33)', {
  serial: '1.3.6.1.4.1.5765.1.33.1.2.1.1.2',
  status: '1.3.6.1.4.1.5765.1.33.1.2.1.1.3',
  name: '1.3.6.1.4.1.5765.1.33.1.2.1.1.6',
  rx: '1.3.6.1.4.1.5765.1.33.1.2.3.1.4',
});

export const RAISECOM_NMS = nmsProfile('raisecom-nms', 'Raisecom (8886.18.3)', {
  serial: '1.3.6.1.4.1.8886.18.3.1.3.1.1.2',
  status: '1.3.6.1.4.1.8886.18.3.1.3.1.1.17',
  name: '1.3.6.1.4.1.8886.18.3.1.3.1.1.20',
  distance: '1.3.6.1.4.1.8886.18.3.1.3.1.1.16',
  rx: '1.3.6.1.4.1.8886.18.3.1.3.3.1.1',
});

// V-SOL V1600D (EPON): the ONU list and the optical table are different tables, so it is read by vsol.ts.
export const VSOL_V1600D = {
  auth: '1.3.6.1.4.1.37950.1.1.5.12.1.12.1',
  diag: '1.3.6.1.4.1.37950.1.1.5.12.2.1.13.1',
} as const;
