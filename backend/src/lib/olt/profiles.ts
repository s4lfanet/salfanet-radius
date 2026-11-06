/**
 * Candidate SNMP profiles per OLT family. Where each profile comes from, and how far it
 * has been checked, is in docs/features/OLT-SNMP-REFERENCE.md.
 *
 * Sources: vendor MIB files (C-Data FD-ONU / CDATA-GPON, NSCRTV EPON and GPON, V-SOL V1600D,
 * all from the LibreNMS MIB set), a C-Data OID sheet supplied by the operator, and the OID
 * table of the open source OLT_MGMT project for HSGQ. None of these was run against live
 * hardware by the author of this file, so every profile is a candidate that discovery
 * validates, not a promise.
 */
import type { PonProfile } from './pon-snmp';

const NSCRTV_EPON_ONU = '1.3.6.1.4.1.17409.2.3.4.1.1';
const NSCRTV_EPON_OPTICS = '1.3.6.1.4.1.17409.2.3.4.2.1';
const NSCRTV_GPON_ONU = '1.3.6.1.4.1.17409.2.8.4.1.1';
const NSCRTV_GPON_OPTICS = '1.3.6.1.4.1.17409.2.8.4.4.1';
const CDATA_GPON = '1.3.6.1.4.1.34592.1.5.1.1.2.18';
const FD_ONU = '1.3.6.1.4.1.34592.1.3.4.1.1';

/** The China broadcast-industry EPON standard; C-Data, Hioso and others implement it. */
export const NSCRTV_EPON: PonProfile = {
  id: 'nscrtv-epon',
  label: 'NSCRTV EPON (17409)',
  tech: 'EPON',
  index: 'nscrtv',
  online: [1],
  scale: 'centi',
  columns: {
    status: `${NSCRTV_EPON_ONU}.8`,
    name: `${NSCRTV_EPON_ONU}.2`,
    mac: `${NSCRTV_EPON_ONU}.7`,
    distance: `${NSCRTV_EPON_ONU}.15`,
    rx: `${NSCRTV_EPON_OPTICS}.4`,
    tx: `${NSCRTV_EPON_OPTICS}.5`,
  },
};

export const NSCRTV_GPON: PonProfile = {
  id: 'nscrtv-gpon',
  label: 'NSCRTV GPON (17409)',
  tech: 'GPON',
  index: 'nscrtv',
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
  },
};

/** C-Data's own GPON tree. Power is a DisplayString, so units come with the text. */
export const CDATA_GPON_PROFILE: PonProfile = {
  id: 'cdata-gpon',
  label: 'C-Data GPON (34592.1.5)',
  tech: 'GPON',
  index: 'dotted',
  online: [1],
  scale: 'auto',
  columns: {
    status: `${CDATA_GPON}.2.1.1`,
    name: `${CDATA_GPON}.1.1.8`,
    distance: `${CDATA_GPON}.2.1.4`,
    rx: `${CDATA_GPON}.6.1.4`,
    tx: `${CDATA_GPON}.6.1.2`,
  },
};

/**
 * C-Data FD-ONU-MIB. DeviceStatus is notPresent(1) offline(2) online(3) normal(4)
 * abnormal(5): online is 3 to 5, not 1. The 2017 revision of the MIB has Rx at .36;
 * the 2014 revision has it at .35, so both are listed.
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

export const CDATA_PROFILES: PonProfile[] = [NSCRTV_EPON, NSCRTV_GPON, CDATA_GPON_PROFILE, FD_ONU_2017, FD_ONU_2014];

/**
 * HSGQ. Taken from the OID table of the OLT_MGMT project (name, status, Rx, Tx under
 * 50224.3.12), where values are divided by 100. How the two tables are indexed is not
 * documented, so the profile joins on whatever the status table's index looks like.
 */
export const HSGQ: PonProfile = {
  id: 'hsgq',
  label: 'HSGQ (50224)',
  tech: 'EPON',
  index: 'dotted',
  online: [1],
  scale: 'centi',
  columns: {
    status: '1.3.6.1.4.1.50224.3.12.2.1.5',
    name: '1.3.6.1.4.1.50224.3.12.2.1.2',
    rx: '1.3.6.1.4.1.50224.3.12.3.1.4',
    tx: '1.3.6.1.4.1.50224.3.12.3.1.5',
  },
};

export const HSGQ_PROFILES: PonProfile[] = [HSGQ];

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

// V-SOL V1600D (EPON): the ONU list and the optical table are different tables, so it is read by vsol.ts.
export const VSOL_V1600D = {
  auth: '1.3.6.1.4.1.37950.1.1.5.12.1.12.1',
  diag: '1.3.6.1.4.1.37950.1.1.5.12.2.1.13.1',
} as const;
