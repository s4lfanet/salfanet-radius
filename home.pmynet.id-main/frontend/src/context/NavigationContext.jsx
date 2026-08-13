import { createContext, useContext } from 'react'

export const NavigationContext = createContext(null)

/** Gunakan di page components sebagai pengganti prop navigateTo, activeTab, setActiveTab */
export const useNavCtx = () => useContext(NavigationContext)
