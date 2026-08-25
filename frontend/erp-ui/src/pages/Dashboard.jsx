import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

function fmt(m){const n=Number(m||0);return `${Math.floor(n/60)}h ${String(n%60).padStart(2,'0')}m`}

function monthRange(monthStr){
  const [y,m]=monthStr.split('-').map(Number)
  const from=`${monthStr}-01`
  const lastDay=new Date(y,m,0).getDate()
  const to=`${monthStr}-${String(lastDay).padStart(2,'0')}`
  return [from,to]
}

function aggregateByEmployee(entries){
  const map={}
  entries.forEach(e=>{
    if(!map[e.employeeId]) map[e.employeeId]={employeeId:e.employeeId,employeeName:e.employeeName,empCode:e.empCode,present:0,absent:0,other:0,daysRecorded:0,totalWork:0,totalOt:0}
    const m=map[e.employeeId]
    m.daysRecorded++
    if(e.attendanceType==='PRESENT') m.present++
    else if(e.attendanceType==='ABSENT') m.absent++
    else m.other++
    m.totalWork+=e.actualWorkMinutes
    m.totalOt+=e.approvedOtMinutes
  })
  return Object.values(map).sort((x,y)=>x.employeeName.localeCompare(y.employeeName))
}

export default function Dashboard() {
  const [stats,setStats]=useState(null), [error,setError]=useState('')
  const navigate=useNavigate()

  const [employees,setEmployees]=useState([])
  const [month,setMonth]=useState(()=>new Date().toISOString().slice(0,7))
  const [employeeId,setEmployeeId]=useState('')
  const [attEntries,setAttEntries]=useState([])
  const [attError,setAttError]=useState('')

  useEffect(()=>{
    api.get('/dashboard/stats').then(r=>setStats(r.data))
      .catch(()=>setError('Could not load dashboard stats. Is the API running?'))
    api.get('/employees').then(r=>setEmployees(r.data)).catch(()=>{})
  },[])

  useEffect(()=>{
    const [fromDate,toDate]=monthRange(month)
    const params={fromDate,toDate}
    if(employeeId) params.employeeId=employeeId
    api.get('/attendance',{params}).then(r=>setAttEntries(r.data))
      .catch(()=>setAttError('Could not load attendance for this month.'))
  },[month,employeeId])

  const a=stats?.todayAttendance
  const employeeSummaries=aggregateByEmployee(attEntries)
  const selectedTotals=employeeId ? {
    present: attEntries.filter(e=>e.attendanceType==='PRESENT').length,
    absent: attEntries.filter(e=>e.attendanceType==='ABSENT').length,
    totalWork: attEntries.reduce((s,e)=>s+e.actualWorkMinutes,0),
    totalOt: attEntries.reduce((s,e)=>s+e.approvedOtMinutes,0),
  } : null

  return <>
    <Topbar crumbs={<b>Dashboard</b>}/>
    <div className="page-head">
      <div><h1>Dashboard</h1><p>Workforce, attendance and payroll-oriented work summary.</p></div>
    </div>
    {error&&<div className="auth-error" style={{marginBottom:16}}>{error}</div>}
    {stats&&<>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="lbl">Total Employees</div><div className="num">{stats.totalEmployees}</div><div className="sub">Across all companies</div></div>
        <div className="kpi-card"><div className="lbl">Active Employees</div><div className="num">{stats.activeEmployees}</div><div className="sub">{stats.totalEmployees-stats.activeEmployees} inactive / exited</div></div>
        <div className="kpi-card"><div className="lbl">Contract Employees</div><div className="num">{stats.contractEmployees}</div><div className="sub">{stats.totalEmployees-stats.contractEmployees} regular</div></div>
        <div className="kpi-card"><div className="lbl">Today Present</div><div className="num">{a.present}</div><div className="sub">{a.totalRecorded} attendance records today</div></div>
        <div className="kpi-card"><div className="lbl">Today Approved OT</div><div className="num">{fmt(a.totalOtMinutes)}</div><div className="sub">{a.totalOtMinutes} minutes</div></div>
      </div>

      <div className="card" style={{padding:'30px 32px 36px'}}>
        <div className="section-head-inline">
          <div><h3 style={{fontSize:18}}>Attendance Explorer</h3><p className="card-sub">Browse attendance by month, across everyone or one employee at a time</p></div>
          <button type="button" className="btn-ghost" onClick={()=>navigate('/attendance')}>Open Daily Attendance →</button>
        </div>
        <div className="form-grid two" style={{marginBottom:22, maxWidth:640}}>
          <div className="field"><label>Month</label><input type="month" value={month} onChange={e=>setMonth(e.target.value)} /></div>
          <div className="field"><label>Employee</label>
            <select value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>
              <option value="">All Employees</option>
              {employees.map(emp=><option key={emp.employeeId} value={emp.employeeId}>{emp.fullName} — {emp.empCode}</option>)}
            </select>
          </div>
        </div>

        {attError && <div className="auth-error" style={{marginBottom:16}}>{attError}</div>}

        {employeeId && selectedTotals && (
          <div className="kpi-grid" style={{marginBottom:20}}>
            <div className="kpi-card"><div className="lbl">Days Present</div><div className="num">{selectedTotals.present}</div></div>
            <div className="kpi-card"><div className="lbl">Days Absent</div><div className="num">{selectedTotals.absent}</div></div>
            <div className="kpi-card"><div className="lbl">Total Work</div><div className="num" style={{fontSize:20}}>{fmt(selectedTotals.totalWork)}</div></div>
            <div className="kpi-card"><div className="lbl">Total Approved OT</div><div className="num" style={{fontSize:20}}>{fmt(selectedTotals.totalOt)}</div></div>
          </div>
        )}

        <div className="table-scroll">
          <table className="emp-table">
            {employeeId ? (
              <>
                <thead><tr><th>Date</th><th>Status</th><th>Shift</th><th>Actual Work</th><th>Approved OT</th></tr></thead>
                <tbody>
                  {attEntries.length===0
                    ? <tr className="empty-row"><td colSpan="5">No attendance recorded for this employee this month.</td></tr>
                    : attEntries.slice().sort((a,b)=>a.attendanceDate.localeCompare(b.attendanceDate)).map(e=>(
                      <tr key={e.attendanceId}>
                        <td>{e.attendanceDate}</td>
                        <td>{e.attendanceType}</td>
                        <td>{e.shiftName}</td>
                        <td>{fmt(e.actualWorkMinutes)}</td>
                        <td><b>{fmt(e.approvedOtMinutes)}</b></td>
                      </tr>
                    ))}
                </tbody>
              </>
            ) : (
              <>
                <thead><tr><th>Employee</th><th>Days Present</th><th>Days Absent</th><th>Total Work</th><th>Total Approved OT</th></tr></thead>
                <tbody>
                  {employeeSummaries.length===0
                    ? <tr className="empty-row"><td colSpan="5">No attendance recorded for this month yet.</td></tr>
                    : employeeSummaries.map(s=>(
                      <tr key={s.employeeId}>
                        <td><b>{s.employeeName}</b><div className="meta">{s.empCode}</div></td>
                        <td>{s.present}</td>
                        <td>{s.absent}</td>
                        <td>{fmt(s.totalWork)}</td>
                        <td><b>{fmt(s.totalOt)}</b></td>
                      </tr>
                    ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      </div>
    </>}
  </>
}
