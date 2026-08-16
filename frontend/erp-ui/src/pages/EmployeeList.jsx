import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

export default function EmployeeList() {
  const [employees, setEmployees] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const load = useCallback(() => {
    const params = {}
    if (search) params.search = search
    if (filter !== 'all') params.type = filter
    api.get('/employees', { params })
      .then(res => setEmployees(res.data))
      .catch(() => setError('Could not load employees. Is the API running?'))
  }, [search, filter])

  useEffect(() => { load() }, [load])

  async function handleDelete(emp) {
    if (!window.confirm(`Deactivate ${emp.fullName} (${emp.empCode})? Their record is retained but marked Inactive.`)) return
    try {
      await api.delete(`/employees/${emp.employeeId}`)
      load()
    } catch {
      setError('Could not delete this employee.')
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

      {error && <div className="auth-error" style={{marginBottom:16}}>{error}</div>}

      <div className="table-card">
        <div className="table-scroll">
          <table className="emp-table">
            <thead>
              <tr><th>Employee</th><th>Designation</th><th>Department</th><th>Type</th><th>Status</th><th>Location</th><th></th></tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr className="empty-row"><td colSpan="7">No employees match this filter.</td></tr>
              ) : employees.map(e => (
                <tr key={e.employeeId}>
                  <td>
                    <div className="emp-cell">
                      <div className="av">{e.fullName.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div>
                      <div>
                        <div className="name" onClick={() => navigate(`/employees/${e.employeeId}`)}>{e.fullName}</div>
                        <div className="id">{e.empCode}</div>
                      </div>
                    </div>
                  </td>
                  <td>{e.designation}</td>
                  <td>{e.department}</td>
                  <td><span className={'badge ' + e.type.toLowerCase()}>{e.type}</span></td>
                  <td><span className={'badge ' + e.status.toLowerCase()}>{e.status}</span></td>
                  <td>{e.location}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="edit" title="Edit" onClick={() => navigate(`/employees/${e.employeeId}`)}>✎</button>
                      <button type="button" className="del" title="Delete" onClick={() => handleDelete(e)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
