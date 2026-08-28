import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const ROLE_RANK = { User: 0, HR: 1, Admin: 2, SuperAdmin: 3 }
const canManage = (callerRole, targetRole) => (ROLE_RANK[callerRole] ?? 0) >= (ROLE_RANK[targetRole] ?? 0)

export default function EmployeeList() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (location.state?.message) {
      setSuccess(location.state.message)
      navigate(location.pathname, { replace: true, state: {} }) // clear flash message so it doesn't reappear on back/refresh
    }
  }, [location.state])

  const load = useCallback(() => {
    const params = {}
    if (search) params.search = search
    if (filter !== 'all') params.type = filter
    if (roleFilter !== 'all') params.roleType = roleFilter
    api.get('/employees', { params })
      .then(res => setEmployees(res.data))
      .catch(() => setError('Could not load employees. Is the API running?'))
  }, [search, filter, roleFilter])

  useEffect(() => { load() }, [load])

  async function handleDelete(emp) {
    if (!window.confirm(`Deactivate ${emp.fullName} (${emp.empCode})? Their record is retained but marked Inactive.`)) return
    try {
      await api.delete(`/employees/${emp.employeeId}`)
      setSuccess(`${emp.fullName} deactivated.`)
      load()
    } catch {
      setError('Could not delete this employee.')
    }
  }

  async function handleReactivate(emp) {
    if (!window.confirm(`Reactivate ${emp.fullName} (${emp.empCode})? Their status will be set back to Active.`)) return
    try {
      await api.put(`/employees/${emp.employeeId}/reactivate`)
      setSuccess(`${emp.fullName} reactivated.`)
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reactivate this employee.')
    }
  }

  return (
    <>
      <Topbar crumbs={<b>Employees</b>} search={search} onSearch={setSearch} />

      <div className="page-head">
        <div><h1>Employees</h1><p>All employees across the company and its sub-entities.</p></div>
        <button type="button" className="btn-blue" onClick={() => navigate('/employees/new')}>＋ Add Employee</button>
      </div>

      <div className="filter-chips">
        <button type="button" className={'chip' + (filter==='all'?' active':'')} onClick={() => setFilter('all')}>All</button>
        <button type="button" className={'chip' + (filter==='Regular'?' active':'')} onClick={() => setFilter('Regular')}>Regular</button>
        <button type="button" className={'chip' + (filter==='Contract'?' active':'')} onClick={() => setFilter('Contract')}>Contract</button>
      </div>
      <div className="filter-chips" style={{marginTop:-6}}>
        <button type="button" className={'chip' + (roleFilter==='all'?' active':'')} onClick={() => setRoleFilter('all')}>All Roles</button>
        <button type="button" className={'chip' + (roleFilter==='User'?' active':'')} onClick={() => setRoleFilter('User')}>User</button>
        <button type="button" className={'chip' + (roleFilter==='HR'?' active':'')} onClick={() => setRoleFilter('HR')}>HR</button>
        <button type="button" className={'chip' + (roleFilter==='Admin'?' active':'')} onClick={() => setRoleFilter('Admin')}>Admin</button>
        <button type="button" className={'chip' + (roleFilter==='SuperAdmin'?' active':'')} onClick={() => setRoleFilter('SuperAdmin')}>SuperAdmin</button>
      </div>

      {error && <div className="auth-error" style={{marginBottom:16}}>{error}</div>}
      {success && <div className="success-note" style={{marginBottom:16}}>{success}</div>}

      <div className="table-card">
        <div className="table-scroll">
          <table className="emp-table">
            <thead>
              <tr><th>Employee</th><th>Designation</th><th>Department</th><th>Shift</th><th>Role</th><th>Type</th><th>Status</th><th>Location</th><th></th></tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr className="empty-row"><td colSpan="9">No employees match this filter.</td></tr>
              ) : employees.map(e => {
                const editable = canManage(user?.role, e.roleType)
                return (
                <tr key={e.employeeId}>
                  <td>
                    <div className="emp-cell">
                      <div className="av">{e.fullName.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div>
                      <div>
                        <div className={editable ? 'name' : ''} onClick={() => editable && navigate(`/employees/${e.employeeId}`)} style={editable ? undefined : {cursor:'default', color:'var(--text)'}}>{e.fullName}</div>
                        <div className="id">{e.empCode}</div>
                      </div>
                    </div>
                  </td>
                  <td>{e.designation}</td>
                  <td>{e.department}</td>
                  <td>{e.shiftName || '—'}</td>
                  <td><span className="badge regular">{e.roleType}</span></td>
                  <td><span className={'badge ' + e.type.toLowerCase()}>{e.type}</span></td>
                  <td><span className={'badge ' + e.status.toLowerCase()}>{e.status}</span></td>
                  <td>{e.location}</td>
                  <td>
                    {editable && (
                      <div className="row-actions">
                        <button type="button" className="edit" title="Edit" onClick={() => navigate(`/employees/${e.employeeId}`)}>✎</button>
                        {e.status === 'Inactive'
                          ? <button type="button" className="edit" title="Reactivate" onClick={() => handleReactivate(e)}>↺</button>
                          : <button type="button" className="del" title="Delete" onClick={() => handleDelete(e)}>🗑</button>}
                      </div>
                    )}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
