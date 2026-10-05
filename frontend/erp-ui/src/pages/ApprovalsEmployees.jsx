import { Fragment, useEffect, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

// Date only, on purpose: the database stores these timestamps without a timezone, so a time of
// day could be shifted by hours depending on where the server runs. The date is always right.
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmtDate = s => { if (!s) return '—'; const [y, m, d] = s.slice(0, 10).split('-'); return `${d} ${MONTHS[Number(m) - 1]} ${y}` }

export default function ApprovalsEmployees() {
  const [status, setStatus] = useState('PENDING')
  const [items, setItems] = useState([])
  const [open, setOpen] = useState({})
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  useEffect(()=>{ if(!success) return; const t=setTimeout(()=>setSuccess(''),4000); return()=>clearTimeout(t) },[success])

  const load = () => api.get('/approvals/employees', { params: { status } }).then(r => setItems(r.data)).catch(() => setError('Could not load approvals.'))
  useEffect(() => { load() }, [status])
  const changed = () => window.dispatchEvent(new Event('approvals-changed'))

  async function approve(it) {
    const what = it.requestType === 'EMPLOYEE_ADD' ? `Add ${it.fullName} (${it.empCode}) to the system?` : `Deactivate ${it.fullName} (${it.empCode})?`
    if (!window.confirm(what)) return
    setError(''); setSuccess(''); setBusy(it.approvalRequestId)
    try { const r = await api.post(`/approvals/employees/${it.approvalRequestId}/approve`); setSuccess(r.data.message); load(); changed() }
    catch (err) { setError(err.response?.data?.message || 'Could not approve this request.') }
    finally { setBusy(null) }
  }

  async function reject(it) {
    const note = window.prompt(`Reject this request for ${it.fullName}? You can add a reason (optional):`)
    if (note === null) return
    setError(''); setSuccess(''); setBusy(it.approvalRequestId)
    try { await api.post(`/approvals/employees/${it.approvalRequestId}/reject`, { note }); setSuccess('Request rejected.'); load(); changed() }
    catch (err) { setError(err.response?.data?.message || 'Could not reject this request.') }
    finally { setBusy(null) }
  }

  const Detail = ({ label, value }) => <div><div className="meta" style={{fontSize:11, textTransform:'uppercase', letterSpacing:'.05em'}}>{label}</div><div>{value || '—'}</div></div>

  return (
    <>
      <Topbar />
      <div className="page-head">
        <div><h1>Employee Approvals</h1><p>Requests to add or deactivate an employee. Nothing changes until you approve.</p></div>
      </div>
      {error && <div className="auth-error" style={{marginBottom:16}}>{error}</div>}
      {success && <div className="success-note" style={{marginBottom:16}}>{success}</div>}

      <div className="card" style={{marginBottom:20}}>
        <div className="form-grid two">
          <div className="field"><label>Show</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="PENDING">Pending</option><option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option><option value="ALL">All</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-card"><div className="table-scroll"><table className="emp-table">
        <thead><tr><th>Request</th><th>Employee</th><th>Role</th><th>Type</th><th>Department</th><th>Joining</th><th>Requested By</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {items.map(it => (
            <Fragment key={it.approvalRequestId}>
              <tr>
                <td><span className={'pill ' + (it.requestType === 'EMPLOYEE_ADD' ? 'add' : 'delete')}>{it.requestType === 'EMPLOYEE_ADD' ? 'Add employee' : 'Deactivate'}</span></td>
                <td><b>{it.fullName}</b><div className="meta">{it.empCode}{it.designation ? ` · ${it.designation}` : ''}</div></td>
                <td>{it.roleType || '—'}{it.hasLogin && <div className="meta">login access</div>}</td>
                <td>{it.type || '—'}</td>
                <td>{it.department || '—'}<div className="meta">{it.payrollDepartment ? `Payroll: ${it.payrollDepartment}` : ''}</div></td>
                <td className="mono">{it.dateOfJoining || '—'}</td>
                <td>{it.requestedBy || '—'}<div className="meta">{fmtDate(it.requestedAt)}</div></td>
                <td>
                  <span className={'pill ' + it.status.toLowerCase()}>{it.status[0] + it.status.slice(1).toLowerCase()}</span>
                  {it.status !== 'PENDING' && <div className="meta">{it.decidedBy ? `by ${it.decidedBy}` : ''}<br />{fmtDate(it.decidedAt)}{it.decisionNote ? <><br />“{it.decisionNote}”</> : null}</div>}
                </td>
                <td>
                  <div style={{display:'flex', gap:6, justifyContent:'flex-end'}}>
                    <button type="button" className="icon-act" title="Details" onClick={() => setOpen(o => ({...o, [it.approvalRequestId]: !o[it.approvalRequestId]}))}>{open[it.approvalRequestId] ? '▴' : '▾'}</button>
                    {it.status === 'PENDING' && <>
                      <button type="button" className="icon-act ok" title="Approve" disabled={busy === it.approvalRequestId} onClick={() => approve(it)}>✓</button>
                      <button type="button" className="icon-act no" title="Reject" disabled={busy === it.approvalRequestId} onClick={() => reject(it)}>✕</button>
                    </>}
                  </div>
                </td>
              </tr>
              {open[it.approvalRequestId] && (
                <tr><td colSpan="9" style={{background:'var(--blue-50)'}}>
                  <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:14, padding:'6px 4px'}}>
                    <Detail label="Company" value={it.company} />
                    <Detail label="Shift" value={it.shift} />
                    <Detail label="Location" value={it.location} />
                    <Detail label="Email" value={it.email} />
                    <Detail label="Phone" value={it.phoneNumber} />
                    <Detail label="Payroll Department" value={it.payrollDepartment} />
                  </div>
                </td></tr>
              )}
            </Fragment>
          ))}
          {items.length === 0 && <tr className="empty-row"><td colSpan="9">{status === 'PENDING' ? 'Nothing waiting for approval.' : 'No requests to show.'}</td></tr>}
        </tbody>
      </table></div></div>
    </>
  )
}
