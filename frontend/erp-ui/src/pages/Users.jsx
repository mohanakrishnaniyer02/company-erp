import { useEffect, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

const emptyForm = { fullName: '', email: '', password: '', role: 'User' }

export default function Users() {
  const [users, setUsers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function load() {
    api.get('/users').then(r => setUsers(r.data)).catch(() => setError('Could not load users.'))
  }
  useEffect(() => { load() }, [])

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleCreate(e) {
    e.preventDefault()
    setError(''); setSuccess('')
    try {
      await api.post('/auth/create-user', form)
      setSuccess(`Account created for ${form.fullName} (${form.role}).`)
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create user.')
    }
  }

  return (
    <>
      <Topbar crumbs={<b>Users</b>} />

      <div className="page-head">
        <div><h1>Users</h1><p>Everyone with access to this system, and their role.</p></div>
        <button type="button" className="btn-blue" onClick={() => { setShowForm(s => !s); setError(''); setSuccess('') }}>
          {showForm ? 'Cancel' : '＋ Add User'}
        </button>
      </div>

      {error && <div className="auth-error" style={{marginBottom:16}}>{error}</div>}
      {success && <div className="success-note" style={{marginBottom:16}}>{success}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="table-card" style={{padding:24, marginBottom:20}}>
          <div className="form-grid two">
            <div className="field"><label>Full Name</label>
              <input required value={form.fullName} onChange={e => set('fullName', e.target.value)} />
            </div>
            <div className="field"><label>Email</label>
              <input type="email" required value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="field"><label>Password</label>
              <input type="password" required value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 8 characters, letters + numbers" />
            </div>
            <div className="field"><label>Role</label>
              <select value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="User">User</option>
                <option value="HR">HR</option>
                <option value="Admin">Admin</option>
                <option value="SuperAdmin">SuperAdmin</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn-blue">Create Account</button>
        </form>
      )}

      <div className="table-card">
        <div className="table-scroll">
          <table className="emp-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr className="empty-row"><td colSpan="5">No users yet.</td></tr>
              ) : users.map(u => (
                <tr key={u.userId}>
                  <td>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td><span className="badge regular">{u.role}</span></td>
                  <td><span className={'badge ' + (u.isActive ? 'active' : 'inactive')}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
