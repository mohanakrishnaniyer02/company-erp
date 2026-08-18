import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

function fmt(m){const n=Number(m||0);return `${Math.floor(n/60)}h ${String(n%60).padStart(2,'0')}m`}

export default function Dashboard() {
  const [stats,setStats]=useState(null), [error,setError]=useState('')
  const navigate=useNavigate()

  useEffect(()=>{
    api.get('/dashboard/stats').then(r=>setStats(r.data))
      .catch(()=>setError('Could not load dashboard stats. Is the API running?'))
  },[])

  const maxDept=stats?.byDepartment?.length?Math.max(...stats.byDepartment.map(d=>d.count)):1
  const a=stats?.todayAttendance

  return <>
    <Topbar crumbs={<b>Dashboard</b>}/>
    <div className="page-head">
      <div><h1>Dashboard</h1><p>Workforce, attendance and payroll-oriented work summary.</p></div>
      <button type="button" className="btn-blue" onClick={()=>navigate('/employees/new')}>＋ Add Employee</button>
    </div>
    {error&&<div className="auth-error" style={{marginBottom:16}}>{error}</div>}
    {stats&&<>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="lbl">Total Employees</div><div className="num">{stats.totalEmployees}</div><div className="sub">Across all companies</div></div>
        <div className="kpi-card"><div className="lbl">Active Employees</div><div className="num">{stats.activeEmployees}</div><div className="sub">{stats.totalEmployees-stats.activeEmployees} inactive / exited</div></div>
        <div className="kpi-card"><div className="lbl">Today Present</div><div className="num">{a.present}</div><div className="sub">{a.totalRecorded} attendance records today</div></div>
        <div className="kpi-card"><div className="lbl">Today Approved OT</div><div className="num">{fmt(a.totalOtMinutes)}</div><div className="sub">{a.totalOtMinutes} minutes</div></div>
      </div>

      <div className="attendance-summary-grid">
        <div className="card">
          <h3>Today's attendance</h3><p className="card-sub">{a.date} · recorded employee status</p>
          <div className="status-grid">
            <div><b>{a.present}</b><span>Present</span></div><div><b>{a.absent}</b><span>Absent</span></div>
            <div><b>{a.halfDay}</b><span>Half Day</span></div><div><b>{a.paidLeave}</b><span>Paid Leave</span></div>
            <div><b>{a.onDuty}</b><span>On Duty</span></div><div><b>{a.other}</b><span>Other</span></div>
          </div>
        </div>
        <div className="card">
          <h3>Today's work summary</h3><p className="card-sub">Based on saved attendance punch pairs</p>
          <div className="work-summary-row"><span>Total work recorded</span><b>{fmt(a.totalWorkMinutes)}</b></div>
          <div className="work-summary-row"><span>Approved OT</span><b>{fmt(a.totalOtMinutes)}</b></div>
          <button className="add-row-btn" style={{marginTop:14}} onClick={()=>navigate('/attendance')}>Open Daily Attendance →</button>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card"><h3>Headcount by department</h3><p className="card-sub">Live count from the employee master</p>
          {stats.byDepartment.map(d=><div className="bar-row" key={d.department}><div className="lbl">{d.department}</div><div className="bar-track"><div className="bar-fill" style={{width:`${Math.round((d.count/maxDept)*100)}%`}}/></div><div className="val">{d.count}</div></div>)}
        </div>
        <div className="card"><h3>Recent joiners</h3><p className="card-sub">Most recently added employees</p>
          {stats.recentJoiners.map(e=><div className="recent-row" key={e.employeeId}><div className="who"><div className="av">{e.fullName.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div><div>{e.fullName}<div className="meta">{e.designation} · {e.shiftName||'No shift'}</div></div></div></div>)}
        </div>
      </div>
    </>}
  </>
}
