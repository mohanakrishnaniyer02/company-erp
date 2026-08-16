import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div id="app-grid">
      <div className="sidebar">
        <div className="brand-mark"><div className="sq">C</div><span>Company HR</span></div>
        <NavLink to="/dashboard" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>
          <span className="ic">▢</span> Dashboard
        </NavLink>
        <NavLink to="/employees" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>
          <span className="ic">◉</span> Employees
        </NavLink>
        {(user?.role === 'Admin' || user?.role === 'SuperAdmin') && (
          <NavLink to="/users" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>
            <span className="ic">◫</span> Users
          </NavLink>
        )}
        <div className="sidebar-bottom">
          Signed in as <b style={{color:'#fff'}}>{user?.role}</b>
          <button type="button" onClick={handleLogout}>← Log out</button>
        </div>
      </div>
      <div className="main">
        <Outlet />
      </div>
    </div>
  )
}
