import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute() {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />

  // No forced password change — whatever password was set at account
  // creation (or a later reset) is what the person keeps using.
  return <Outlet />
}
