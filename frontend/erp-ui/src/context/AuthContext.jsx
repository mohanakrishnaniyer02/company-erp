import { createContext, useContext, useState } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('company_user')
    return raw ? JSON.parse(raw) : null
  })

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    persist(data)
    return data
  }

  function persist(data) {
    localStorage.setItem('company_token', data.token)
    localStorage.setItem('company_user', JSON.stringify(data))
    setUser(data)
  }

  // Called after a successful password change so the mandatory-change
  // redirect stops firing, without needing the user to log in again.
  function clearMustChangePassword() {
    setUser(u => {
      if (!u) return u
      const updated = { ...u, mustChangePassword: false }
      localStorage.setItem('company_user', JSON.stringify(updated))
      return updated
    })
  }

  function logout() {
    localStorage.removeItem('company_token')
    localStorage.removeItem('company_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, clearMustChangePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
