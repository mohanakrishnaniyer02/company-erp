import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'
import useDepartmentNames from '../hooks/useDepartmentNames'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const emptyForm = () => ({ startDate: todayStr(), endDate: todayStr(), employeeId: '', shiftId: '' })

function daysBetween(a, b) {
  const [ay,am,ad] = a.split('-').map(Number), [by,bm,bd] = b.split('-').map(Number)
  return Math.round((new Date(by,bm-1,bd) - new Date(ay,am-1,ad)) / 86400000) + 1
}

export default function ShiftMapping() {
  const [items, setItems] = useState([])
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [showPast, setShowPast] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [formDept, setFormDept] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  useEffect(()=>{ if(!success) return; const t=setTimeout(()=>setSuccess(''),4000); return()=>clearTimeout(t) },[success])

  const load = () => {
    const params = {}
    if (employeeFilter) params.employeeId = employeeFilter
    api.get('/shift-mappings', { params }).then(r => setItems(r.data)).catch(() => setError('Could not load shift mappings.'))
  }
  useEffect(() => { load() }, [employeeFilter])
  useEffect(() => {
    api.get('/employees').then(r => setEmployees(r.data)).catch(() => {})
    api.get('/shifts').then(r => setShifts(r.data)).catch(() => {})
  }, [])

  const departments = useDepartmentNames()
  const formEmployee = employees.find(e => String(e.employeeId) === String(form.employeeId))
  const set = (f, v) => setForm(x => ({ ...x, [f]: v }))
  const today = todayStr()
  const statusOf = m => m.endDate < today ? 'Past' : (m.startDate > today ? 'Upcoming' : 'Active now')

  const visible = items
    .filter(m => showPast || m.endDate >= today)
    .slice().sort((a, b) => a.startDate.localeCompare(b.startDate))

  function startAdd() { setEditingId(null); setForm(emptyForm()); setFormDept(''); setError(''); setSuccess(''); setShowForm(true) }
  function startEdit(m) {
    const emp = employees.find(e => e.employeeId === m.employeeId)
    setEditingId(m.shiftMappingId)
    setForm({ startDate: m.startDate, endDate: m.endDate, employeeId: String(m.employeeId), shiftId: String(m.shiftId) })
    setFormDept(emp?.orgDepartment || ''); setError(''); setSuccess(''); setShowForm(true)
  }
  function close() { setShowForm(false); setEditingId(null) }

  async function save(e) {
    e.preventDefault(); setError(''); setSuccess('')
    if (!form.employeeId || !form.shiftId) { setError('Employee and shift are required.'); return }
    const payload = { employeeId: Number(form.employeeId), shiftId: Number(form.shiftId), startDate: form.startDate, endDate: form.endDate }
    try {
      if (editingId) await api.put(`/shift-mappings/${editingId}`, payload)
      else await api.post('/shift-mappings', payload)
      setSuccess(editingId ? 'Shift mapping updated.' : 'Shift mapping added.')
      close(); load()
    } catch (err) { setError(err.response?.data?.message || 'Could not save the mapping.') }
  }

  async function remove(m) {
    if (!window.confirm(`Remove ${m.employeeName}'s ${m.shiftName} mapping (${m.startDate} to ${m.endDate})?`)) return
    try { await api.delete(`/shift-mappings/${m.shiftMappingId}`); setSuccess('Shift mapping removed.'); load() }
    catch (err) { setError(err.response?.data?.message || 'Could not remove the mapping.') }
  }

  return (
    <>
      <Topbar />
      <div className="page-head">
        <div><h1>Shift Mapping</h1><p>Move an employee to a different shift for a date range. Outside any mapping, their own shift applies.</p></div>
        <button type="button" className="btn-blue" onClick={startAdd}>＋ Add Mapping</button>
      </div>

      {error && !showForm && <div className="auth-error" style={{marginBottom:16}}>{error}</div>}
      {success && <div className="success-note" style={{marginBottom:16}}>{success}</div>}

      <div className="card" style={{marginBottom:20}}>
        <div className="form-grid two">
          <div className="field"><label>Employee</label>
            <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}>
              <option value="">All Employees</option>
              {employees.map(e => <option key={e.employeeId} value={e.employeeId}>{e.fullName} — {e.empCode}</option>)}
            </select>
          </div>
          <div className="field" style={{justifyContent:'flex-end'}}>
            <label style={{display:'flex', alignItems:'center', gap:8, fontWeight:600, marginTop:22}}>
              <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} style={{width:'auto'}} /> Show past mappings
            </label>
          </div>
        </div>
      </div>

      <div className="table-card"><div className="table-scroll"><table className="emp-table">
        <thead><tr><th>Employee</th><th>Shift</th><th>Start Date</th><th>End Date</th><th>Days</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {visible.map(m => (
            <tr key={m.shiftMappingId}>
              <td><b>{m.employeeName}</b><div className="meta">{m.empCode}</div></td>
              <td>{m.shiftName} <span className="meta">({m.shiftCode})</span></td>
              <td className="mono">{m.startDate}</td><td className="mono">{m.endDate}</td>
              <td>{daysBetween(m.startDate, m.endDate)}</td>
              <td><span className={'badge ' + (statusOf(m) === 'Past' ? 'inactive' : 'active')}>{statusOf(m)}</span></td>
              <td><div className="row-actions">
                <button className="edit" title="Edit" onClick={() => startEdit(m)}>✎</button>
                <button className="del" title="Remove" onClick={() => remove(m)}>🗑</button>
              </div></td>
            </tr>
          ))}
          {visible.length === 0 && <tr className="empty-row"><td colSpan="7">No shift mappings{showPast ? '' : ' current or upcoming'}.</td></tr>}
        </tbody>
      </table></div></div>

      {showForm && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-box" style={{maxWidth:640}} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editingId ? 'Edit Shift Mapping' : 'Add Shift Mapping'}</h3>
              <button type="button" className="icon-btn" onClick={close} title="Close">✕</button>
            </div>
            <form onSubmit={save}>
              {error && <div className="auth-error" style={{marginBottom:14}}>{error}</div>}
              <div className="form-grid two">
                <div className="field"><label>Start Date *</label><input type="date" required value={form.startDate} onChange={e => set('startDate', e.target.value)} /></div>
                <div className="field"><label>End Date *</label><input type="date" required min={form.startDate} value={form.endDate} onChange={e => set('endDate', e.target.value)} /></div>
                <div className="field"><label>Department</label>
                  <select value={formDept} onChange={e => { setFormDept(e.target.value); set('employeeId', '') }} disabled={!!editingId}>
                    <option value="">All Departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="field"><label>Employee *</label>
                  <select required value={form.employeeId} onChange={e => set('employeeId', e.target.value)} disabled={!!editingId}>
                    <option value="">Select employee…</option>
                    {employees.filter(e => e.status === 'Active' && (!formDept || e.orgDepartment === formDept))
                      .map(e => <option key={e.employeeId} value={e.employeeId}>{e.fullName} — {e.empCode}</option>)}
                  </select>
                </div>
                <div className="field"><label>Shift *</label>
                  <select required value={form.shiftId} onChange={e => set('shiftId', e.target.value)}>
                    <option value="">Select shift…</option>
                    {shifts.filter(s => s.status === 'Active').map(s => <option key={s.shiftId} value={s.shiftId}>{s.shiftName} — {s.shiftCode}</option>)}
                  </select>
                  {formEmployee && <small className="field-help">Their usual shift: {formEmployee.shiftName || 'none allocated'}</small>}
                </div>
              </div>
              <div style={{display:'flex', justifyContent:'flex-end', gap:10, marginTop:20, paddingTop:16, borderTop:'1px solid var(--line)'}}>
                <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
                <button className="btn-blue" type="submit">{editingId ? 'Update Mapping' : 'Save Mapping'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
