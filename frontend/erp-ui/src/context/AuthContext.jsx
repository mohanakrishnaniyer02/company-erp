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

  async function signup(fullName, email, password, role) {
    const { data } = await api.post('/auth/signup', { fullName, email, password, role })
    persist(data)
    return data
  }

  function persist(data) {
    localStorage.setItem('company_token', data.token)
    localStorage.setItem('company_user', JSON.stringify(data))
    setUser(data)
  }

  function logout() {
    localStorage.removeItem('company_token')
    localStorage.removeItem('company_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
