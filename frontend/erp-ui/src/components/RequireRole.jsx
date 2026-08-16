import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Gate a route to specific roles. Anyone else is bounced back to the Dashboard
// rather than shown an error page.
export default function RequireRole({ roles }) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
