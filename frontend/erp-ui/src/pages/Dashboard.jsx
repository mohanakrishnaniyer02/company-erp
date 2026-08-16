import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(res => setStats(res.data))
      .catch(() => setError('Could not load dashboard stats. Is the API running?'))
  }, [])

  const maxDept = stats?.byDepartment?.length
    ? Math.max(...stats.byDepartment.map(d => d.count))
    : 1

  return (
    <>
      <Topbar crumbs={<b>Dashboard</b>} />

      <div className="page-head">
        <div><h1>Dashboard</h1><p>A quick snapshot of your workforce.</p></div>
        <button type="button" className="btn-blue" onClick={() => navigate('/employees/new')}>＋ Add Employee</button>
      </div>

      {error && <div className="auth-error" style={{marginBottom:16}}>{error}</div>}

      {stats && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="lbl">Total Employees</div>
              <div className="num">{stats.totalEmployees}</div>
              <div className="sub">Across all companies</div>
            </div>
            <div className="kpi-card">
              <div className="lbl">Active</div>
              <div className="num">{stats.activeEmployees}</div>
              <div className="sub">{stats.totalEmployees - stats.activeEmployees} inactive / exited</div>
            </div>
            <div className="kpi-card">
              <div className="lbl">On Contract</div>
              <div className="num">{stats.contractEmployees}</div>
              <div className="sub">{stats.totalEmployees - stats.contractEmployees} regular</div>
            </div>
            <div className="kpi-card">
              <div className="lbl">Departments</div>
              <div className="num">{stats.byDepartment.length}</div>
              <div className="sub">Currently staffed</div>
            </div>
          </div>

          <div className="dash-grid">
            <div className="card">
              <h3>Headcount by department</h3>
              <p className="card-sub">Live count from the current employee list</p>
              {stats.byDepartment.map(d => (
                <div className="bar-row" key={d.department}>
                  <div className="lbl">{d.department}</div>
                  <div className="bar-track"><div className="bar-fill" style={{width: `${Math.round((d.count / maxDept) * 100)}%`}} /></div>
                  <div className="val">{d.count}</div>
                </div>
              ))}
            </div>
            <div className="card">
              <h3>Recent joiners</h3>
              <p className="card-sub">Most recently added employees</p>
              {stats.recentJoiners.map(e => (
                <div className="recent-row" key={e.employeeId}>
                  <div className="who">
                    <div className="av">{e.fullName.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div>
                    <div>{e.fullName}<div className="meta">{e.designation}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
