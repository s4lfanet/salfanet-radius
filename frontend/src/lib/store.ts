import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setCurrentTimezone } from './timezone';

interface CompanySettings {
  name: string;
  email: string;
  phone: string;
  address: string;
  baseUrl: string;
  adminPhone: string;
  logo?: string;
  timezone: string;
  poweredBy?: string;
}

interface AppState {
  locale: 'id';
  company: CompanySettings;
  setLocale: (locale: string) => void;
  setCompany: (company: Partial<CompanySettings>) => void;
  initializeTimezone: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      locale: 'id',
      company: {
        name: 'SALFANET RADIUS',
        email: 'admin@salfanet.com',
        phone: '+62 812-3456-7890',
        address: 'Jakarta, Indonesia',
        baseUrl: '',
        adminPhone: '+62 812-3456-7890',
        timezone: 'Asia/Jakarta',
      },
      setLocale: () => {},
      setCompany: (company) => {
        // Update timezone lib when company timezone changes
        if (company.timezone) {
          setCurrentTimezone(company.timezone);
        }
        set((state) => ({
          company: { ...state.company, ...company },
        }));
      },
      initializeTimezone: async () => {
        // Initialize timezone from server on app load
        try {
          const response = await fetch('/api/company');
          if (response.ok) {
            const data = await response.json();
            if (data?.timezone) {
              setCurrentTimezone(data.timezone);
              set((state) => ({
                company: { ...state.company, timezone: data.timezone },
              }));
            }
          }
        } catch (error) {
          console.error('Error initializing timezone:', error);
          // Use stored timezone from persist
          const currentTz = get().company.timezone;
          setCurrentTimezone(currentTz);
        }
      },
    }),
    {
      name: 'salfanet-settings',
      onRehydrateStorage: () => (state) => {
        // Sync timezone lib after rehydration
        if (state?.company.timezone) {
          setCurrentTimezone(state.company.timezone);
        }
      },
    }
  )
);
