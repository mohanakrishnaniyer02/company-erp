import { useEffect, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

const empty = { departmentName:'', otAllowed:false, minOtMinutes:'', maxOtMinutes:'', requiredWorkMinutes:'480' }

function mins(v) {
  const n = Number(v || 0)
  return `${Math.floor(n / 60)}h ${n % 60}m`
}

export default function Departments() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = () => api.get('/departments').then(r => setItems(r.data)).catch(() => setError('Could not load departments.'))

  useEffect(() => { load() }, [])

  function set(field, value) { setForm(f => ({...f, [field]:value})) }

  function edit(d) {
    setEditingId(d.departmentId)
    setForm({
      departmentName:d.departmentName, otAllowed:d.otAllowed,
      minOtMinutes:d.minOtMinutes ?? '', maxOtMinutes:d.maxOtMinutes ?? '',
      requiredWorkMinutes:d.requiredWorkMinutes
    })
    setError(''); setSuccess(''); setShowForm(true)
  }

  function startAdd() { setEditingId(null); setForm(empty); setError(''); setSuccess(''); setShowForm(true) }

  function reset() { setEditingId(null); setForm(empty); setShowForm(false) }

  async function save(e) {
    e.preventDefault(); setError(''); setSuccess('')
    const payload = {
      departmentName: form.departmentName.trim(),
      otAllowed: form.otAllowed,
      minOtMinutes: form.otAllowed && form.minOtMinutes !== '' ? Number(form.minOtMinutes) : null,
      maxOtMinutes: form.otAllowed && form.maxOtMinutes !== '' ? Number(form.maxOtMinutes) : null,
      requiredWorkMinutes: Number(form.requiredWorkMinutes)
    }
    try {
      if (editingId) await api.put(`/departments/${editingId}`, payload)
      else await api.post('/departments', payload)
      setSuccess(editingId ? 'Department updated.' : 'Department created.')
      reset(); load()
    } catch (err) { setError(err.response?.data?.message || 'Could not save department.') }
  }

  async function remove(d) {
    if (!window.confirm(`Delete ${d.departmentName}?`)) return
    try { await api.delete(`/departments/${d.departmentId}`); load() }
    catch (err) { setError(err.response?.data?.message || 'Could not delete department.') }
  }

  return (
    <>
      <Topbar crumbs={<b>Departments</b>} />
      <div className="page-head">
        <div><h1>Departments</h1><p>Configure required work hours and department OT policy.</p></div>
        <button type="button" className="btn-blue" onClick={showForm?reset:startAdd}>{showForm?'Cancel':'＋ Add Department'}</button>
      </div>

      {error && <div className="auth-error" style={{marginBottom:16}}>{error}</div>}
      {success && <div className="success-note" style={{marginBottom:16}}>{success}</div>}

      {showForm && (
        <form className="card" onSubmit={save} style={{marginBottom:20}}>
          <h3>{editingId ? 'Edit Department' : 'Add Department'}</h3>
          <p className="card-sub">All work-hour values are stored in minutes.</p>
          <div className="form-grid two">
            <div className="field" style={{gridColumn:'1/-1'}}>
              <label>Department Name <span className="req">*</span></label>
              <input required value={form.departmentName} onChange={e=>set('departmentName',e.target.value)} />
            </div>
            <div className="field">
              <label>OT Allowed</label>
              <select value={form.otAllowed ? 'Yes':'No'} onChange={e=>set('otAllowed',e.target.value==='Yes')}>
                <option value="No">No</option><option value="Yes">Yes</option>
              </select>
            </div>
            {form.otAllowed && <>
              <div className="field"><label>Min OT Time (minutes)</label><input type="number" min="0" value={form.minOtMinutes} onChange={e=>set('minOtMinutes',e.target.value)} /></div>
              <div className="field"><label>Max OT Time (minutes)</label><input type="number" min="0" value={form.maxOtMinutes} onChange={e=>set('maxOtMinutes',e.target.value)} /></div>
            </>}
            <div className="field">
              <label>Required Work Hours (minutes) <span className="req">*</span></label>
              <input type="number" min="1" required value={form.requiredWorkMinutes} onChange={e=>set('requiredWorkMinutes',e.target.value)} />
              <small className="field-help">{mins(form.requiredWorkMinutes)} per payable day</small>
            </div>
          </div>
          <div className="footer-actions" style={{padding:'16px 0 0', marginTop:8}}>
            <button type="button" className="btn-ghost" onClick={reset}>Cancel</button>
            <button className="btn-blue" type="submit">{editingId ? 'Update Department':'Save Department'}</button>
          </div>
        </form>
      )}

      <div className="table-card">
        <div className="table-scroll">
          <table className="emp-table">
            <thead><tr><th>Department</th><th>OT</th><th>Min OT</th><th>Max OT</th><th>Required</th><th></th></tr></thead>
            <tbody>
              {items.map(d => (
                <tr key={d.departmentId}>
                  <td><b>{d.departmentName}</b></td>
                  <td><span className={'badge '+(d.otAllowed?'active':'inactive')}>{d.otAllowed?'Yes':'No'}</span></td>
                  <td>{d.minOtMinutes == null ? '—' : mins(d.minOtMinutes)}</td>
                  <td>{d.maxOtMinutes == null ? '—' : mins(d.maxOtMinutes)}</td>
                  <td>{mins(d.requiredWorkMinutes)}</td>
                  <td><div className="row-actions"><button className="edit" title="Edit" onClick={()=>edit(d)}>✎</button><button className="del" title="Delete" onClick={()=>remove(d)}>🗑</button></div></td>
                </tr>
              ))}
              {items.length===0 && <tr className="empty-row"><td colSpan="6">No departments configured.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
