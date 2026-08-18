import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const canManage = ['HR','Admin','SuperAdmin'].includes(user?.role)

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
        {canManage && <>
          <NavLink to="/departments" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>
            <span className="ic">▤</span> Departments
          </NavLink>
          <NavLink to="/shifts" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>
            <span className="ic">◷</span> Shifts
          </NavLink>
          <NavLink to="/attendance" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')}>
            <span className="ic">✓</span> Daily Attendance
          </NavLink>
        </>}
        <div className="sidebar-bottom">
          Signed in as <b style={{color:'#fff'}}>{user?.role}</b>
          <button type="button" onClick={handleLogout}>← Log out</button>
        </div>
      </div>
      <div className="main"><Outlet /></div>
    </div>
  )
}
