import { apiAdmin } from './client';

export interface Installer {
  id: string;
  name: string;
  isActive: boolean;
  technicianId: string | null;
  createdAt: string;
  customerCount: number;
}

/** '' = semua, 'none' = belum ditentukan, else an installer id. */
export const INSTALLER_NONE = 'none';
export const INSTALLER_UNSET_LABEL = 'Belum ditentukan';

export const installerApi = {
  list(): Promise<{ installers: Installer[]; unassignedCount: number | null }> {
    return apiAdmin('/api/pppoe/installers');
  },

  listActive(): Promise<{ installers: Installer[] }> {
    return apiAdmin('/api/pppoe/installers?active=1');
  },

  create(name: string): Promise<{ installer: Installer }> {
    return apiAdmin('/api/pppoe/installers', { method: 'POST', body: JSON.stringify({ name }) });
  },

  update(id: string, data: { name?: string; isActive?: boolean }): Promise<{ installer: Installer }> {
    return apiAdmin(`/api/pppoe/installers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },

  psbPending(): Promise<{ count: number }> {
    return apiAdmin('/api/pppoe/installers/import-technicians');
  },

  importFromPsb(): Promise<{ assigned: number; technicians: number }> {
    return apiAdmin('/api/pppoe/installers/import-technicians', { method: 'POST' });
  },
};
