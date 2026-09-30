import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type User } from '../lib/api'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  signIn: (email: string, password: string, remember: boolean) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  setUser: (user: User | null) => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: User | null }>('/auth/me')
      setUser(data.user)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    void refresh().finally(() => setIsLoading(false))
  }, [refresh])

  const signIn = async (email: string, password: string, remember: boolean) => {
    const data = await api<{ user: User }>('/auth/login', { body: { email, password, remember } })
    setUser(data.user)
  }
  const register = async (username: string, email: string, password: string) => {
    const data = await api<{ user: User }>('/auth/register', { body: { username, email, password } })
    setUser(data.user)
  }
  const signOut = async () => {
    await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, register, signOut, setUser, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
