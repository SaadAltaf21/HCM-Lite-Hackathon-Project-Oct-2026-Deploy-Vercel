import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcm_user') || 'null') } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('hcm_token'))

  useEffect(() => {
    if (token) localStorage.setItem('hcm_token', token)
    else localStorage.removeItem('hcm_token')
  }, [token])
  useEffect(() => {
    if (user) localStorage.setItem('hcm_user', JSON.stringify(user))
    else localStorage.removeItem('hcm_user')
  }, [user])

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    setToken(data.token)
    setUser(data.user)
    return data.user
  }
  const logout = () => { setToken(null); setUser(null) }
  const value = useMemo(() => ({ user, token, login, logout, setUser }), [user, token])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
