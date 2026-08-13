import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/** Gunakan di page components sebagai pengganti prop currentUser & authHeader */
export const useAuthCtx = () => useContext(AuthContext)
