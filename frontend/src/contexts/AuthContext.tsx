/** Authentication context for managing API keys. */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { apiClient } from '../lib/api'

interface AuthContextType {
  apiKey: string | null
  setApiKey: (key: string | null) => void
  isAuthenticated: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(() => {
    // Load from localStorage
    return localStorage.getItem('api_key')
  })

  useEffect(() => {
    if (apiKey) {
      apiClient.setApiKey(apiKey)
      localStorage.setItem('api_key', apiKey)
    } else {
      apiClient.clearApiKey()
      localStorage.removeItem('api_key')
    }
  }, [apiKey])

  const setApiKey = (key: string | null) => {
    setApiKeyState(key)
  }

  const logout = () => {
    setApiKey(null)
  }

  return (
    <AuthContext.Provider
      value={{
        apiKey,
        setApiKey,
        isAuthenticated: !!apiKey,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

