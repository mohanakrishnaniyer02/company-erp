import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api/client'

export default function AppShell() {
  const { user } = useAuth()
  const canManage = ['HR','Admin','SuperAdmin'].includes(user?.role)
  const canApprove = ['Admin','SuperAdmin'].includes(user?.role)
  const [collapsed, setCollapsed] = useState(true)
  const [pending, setPending] = useState({ employees: 0, overtime: 0 })
  const location = useLocation()

  // Pending counts for the badges — refreshed on every page change, and whenever an approval is decided.
  const refreshPending = () => { if (canApprove) api.get('/approvals/summary').then(r => setPending(r.data)).catch(() => {}) }
  useEffect(() => { refreshPending() }, [location.pathname, canApprove])
  useEffect(() => {
    window.addEventListener('approvals-changed', refreshPending)
    return () => window.removeEventListener('approvals-changed', refreshPending)
  }, [canApprove])

  return (
    <div id="app-grid">
      <button type="button" className="sidebar-toggle-floating" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Show menu' : 'Hide menu'}>☰</button>
      <div className={'sidebar' + (collapsed ? ' collapsed' : '')}>
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
          <NavLink to="/shift-mapping" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')} title="Shift Mapping">
            <span className="ic">⇄</span><span className="label">Shift Mapping</span>
          </NavLink>
          <NavLink to="/shift-calendar" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')} title="Shift Calendar">
            <span className="ic">▦</span><span className="label">Shift Calendar</span>
          </NavLink>
          <NavLink to="/attendance" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')} title="Daily Attendance">
            <span className="ic">✓</span><span className="label">Daily Attendance</span>
          </NavLink>
          <NavLink to="/leave" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')} title="Leave">
            <span className="ic">◐</span><span className="label">Leave</span>
          </NavLink>
        </>}
        {canApprove && (
          <NavLink to="/attendance-rules" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')} title="Attendance Rules">
            <span className="ic">⚖</span><span className="label">Attendance Rules</span>
          </NavLink>
        )}
        {canApprove && <>
          <div className="side-group"><span className="label">Approvals</span></div>
          <NavLink to="/approvals/employees" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')} title="Employee Approvals">
            <span className="ic">☑</span><span className="label">Employee Approvals</span>
            {pending.employees > 0 && <span className="side-badge">{pending.employees}</span>}
          </NavLink>
          <NavLink to="/approvals/overtime" className={({isActive}) => 'side-link' + (isActive ? ' active' : '')} title="OT Approvals">
            <span className="ic">◔</span><span className="label">OT Approvals</span>
            {pending.overtime > 0 && <span className="side-badge">{pending.overtime}</span>}
          </NavLink>
        </>}
      </div>
      <div className="main">
        <Outlet />
        <footer className="app-footer" style={{left: collapsed ? 64 : 196}}>
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
