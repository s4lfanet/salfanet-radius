import { createContext, useContext } from 'react'

export const UIContext = createContext(null)

/** Gunakan di page components sebagai pengganti prop showToast, requestConfirm, requestCritical, hideAmounts, toggleHideAmounts */
export const useUICtx = () => useContext(UIContext)
