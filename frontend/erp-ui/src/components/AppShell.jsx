import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function AppShell() {
  const { user } = useAuth()
  const canManage = ['HR','Admin','SuperAdmin'].includes(user?.role)
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div id="app-grid">
      <div className={'sidebar' + (collapsed ? ' collapsed' : '')}>
        <button type="button" className="sidebar-toggle" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>☰</button>
        <div className="brand-mark"><div className="sq">C</div><span>Company HR</span></div>
        <NavLink to="/dashboard" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')} title="Dashboard">
          <span className="ic">▢</span><span className="label">Dashboard</span>
        </NavLink>
        <NavLink to="/employees" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')} title="Employees">
          <span className="ic">◉</span><span className="label">Employees</span>
        </NavLink>
        {canManage && <>
          <NavLink to="/departments" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')} title="Departments">
            <span className="ic">▤</span><span className="label">Departments</span>
          </NavLink>
          <NavLink to="/shifts" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')} title="Shifts">
            <span className="ic">◷</span><span className="label">Shifts</span>
          </NavLink>
          <NavLink to="/attendance" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')} title="Daily Attendance">
            <span className="ic">✓</span><span className="label">Daily Attendance</span>
          </NavLink>
        </>}
      </div>
      <div className="main">
        <Outlet />
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} Company HR. All rights reserved.</span>
          <span className="app-footer-links">
            <a href="mailto:support@company.com">Report an issue</a>
            <span className="dot">·</span>
            <span>v1.0.0</span>
          </span>
        </footer>
      </div>
    </div>
  )
}
