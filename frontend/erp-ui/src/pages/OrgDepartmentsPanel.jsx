import { useEffect, useState } from 'react'
import api from '../api/client'

export default function OrgDepartmentsPanel() {
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  useEffect(()=>{ if(!success) return; const t=setTimeout(()=>setSuccess(''),4000); return()=>clearTimeout(t) },[success])

  const load = () => api.get('/org-departments').then(r => setItems(r.data)).catch(() => setError('Could not load departments.'))
  useEffect(() => { load() }, [])

  function startAdd() { setEditingId(null); setName(''); setError(''); setSuccess(''); setShowForm(true) }
  function edit(d) { setEditingId(d.orgDepartmentId); setName(d.departmentName); setError(''); setSuccess(''); setShowForm(true) }
  function close() { setShowForm(false); setEditingId(null); setName('') }

  async function save(e) {
    e.preventDefault(); setError(''); setSuccess('')
    try {
      if (editingId) await api.put(`/org-departments/${editingId}`, { departmentName: name.trim() })
      else await api.post('/org-departments', { departmentName: name.trim() })
      setSuccess(editingId ? 'Department updated.' : 'Department created.')
      close(); load()
    } catch (err) { setError(err.response?.data?.message || 'Could not save department.') }
  }

  async function remove(d) {
    if (!window.confirm(`Delete ${d.departmentName}?`)) return
    try { await api.delete(`/org-departments/${d.orgDepartmentId}`); setSuccess(`${d.departmentName} deleted.`); load() }
    catch (err) { setError(err.response?.data?.message || 'Could not delete department.') }
  }

  return (
    <>
      <div style={{display:'flex', justifyContent:'flex-end', marginBottom:16}}>
        <button type="button" className="btn-blue" onClick={startAdd}>＋ Add Department</button>
      </div>

      {error && <div className="auth-error" style={{marginBottom:16}}>{error}</div>}
      {success && <div className="success-note" style={{marginBottom:16}}>{success}</div>}

      {showForm && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-box" style={{maxWidth:460}} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editingId ? 'Edit Department' : 'Add Department'}</h3>
              <button type="button" className="icon-btn" onClick={close} title="Close">✕</button>
            </div>
            <form onSubmit={save}>
              <div className="field">
                <label>Department Name <span className="req">*</span></label>
                <input required autoFocus value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div style={{display:'flex', justifyContent:'flex-end', gap:10, marginTop:20, paddingTop:16, borderTop:'1px solid var(--line)'}}>
                <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
                <button className="btn-blue" type="submit">{editingId ? 'Update Department' : 'Save Department'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-card">
        <div className="table-scroll">
          <table className="emp-table">
            <thead><tr><th>Department</th><th></th></tr></thead>
            <tbody>
              {items.map(d => (
                <tr key={d.orgDepartmentId}>
                  <td><b>{d.departmentName}</b></td>
                  <td><div className="row-actions">
                    <button className="edit" title="Edit" onClick={() => edit(d)}>✎</button>
                    <button className="del" title="Delete" onClick={() => remove(d)}>🗑</button>
                  </div></td>
                </tr>
              ))}
              {items.length === 0 && <tr className="empty-row"><td colSpan="2">No departments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
