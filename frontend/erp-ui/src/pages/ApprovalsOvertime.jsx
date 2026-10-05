import { useEffect, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

const fmt = v => { const n = Number(v || 0); return `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}m` }
const hhmm = t => t ? String(t).slice(0, 5) : '—'
const monthNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }

export default function ApprovalsOvertime() {
  const [status, setStatus] = useState('PENDING')
  const [month, setMonth] = useState(monthNow())
  const [items, setItems] = useState([])
  const [edits, setEdits] = useState({})          // attendanceId -> { minutes, note }
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  useEffect(()=>{ if(!success) return; const t=setTimeout(()=>setSuccess(''),4000); return()=>clearTimeout(t) },[success])

  const load = () => api.get('/approvals/overtime', { params: { status, month } }).then(r => { setItems(r.data); setEdits({}) }).catch(() => setError('Could not load overtime approvals.'))
  useEffect(() => { load() }, [status, month])
  const changed = () => window.dispatchEvent(new Event('approvals-changed'))

  const edit = it => edits[it.attendanceId] ?? { minutes: it.roundedOtMinutes, note: '' }
  const setEdit = (it, patch) => setEdits(e => ({ ...e, [it.attendanceId]: { ...edit(it), ...patch } }))

  async function approve(it) {
    const { minutes, note } = edit(it)
    setError(''); setSuccess(''); setBusy(it.attendanceId)
    try {
      await api.post(`/approvals/overtime/${it.attendanceId}/approve`, { approvedMinutes: Number(minutes), note: note || null })
      setSuccess(`Overtime approved for ${it.employeeName} (${fmt(minutes)}).`); load(); changed()
    } catch (err) { setError(err.response?.data?.message || 'Could not approve this overtime.') }
    finally { setBusy(null) }
  }

  async function reject(it) {
    const note = window.prompt(`Reject ${fmt(it.roundedOtMinutes)} of overtime for ${it.employeeName} on ${it.attendanceDate}? You can add a reason (optional):`)
    if (note === null) return
    setError(''); setSuccess(''); setBusy(it.attendanceId)
    try { await api.post(`/approvals/overtime/${it.attendanceId}/reject`, { note }); setSuccess('Overtime rejected — that time won\'t count.'); load(); changed() }
    catch (err) { setError(err.response?.data?.message || 'Could not reject this overtime.') }
    finally { setBusy(null) }
  }

  const pendingView = status === 'PENDING'

  return (
    <>
      <Topbar />
      <div className="page-head">
        <div><h1>OT Approvals</h1><p>Overtime waits here until you decide. Approved OT counts toward work hours — you can change the minutes; rejected OT is skipped.</p></div>
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
          {!pendingView && <div className="field"><label>Month</label><input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></div>}
        </div>
      </div>

      <div className="table-card"><div className="table-scroll"><table className="emp-table">
        <thead><tr>
          <th>Date</th><th>Employee</th><th>Shift</th><th>In – Out</th><th>Worked</th><th>Required</th><th>OT (rounded)</th>
          {pendingView ? <><th>Approve as</th><th>Note</th></> : <><th>Approved</th><th>Decision</th></>}
          <th></th>
        </tr></thead>
        <tbody>
          {items.map(it => {
            const e = edit(it)
            const differs = Number(e.minutes) !== it.roundedOtMinutes
            return (
              <tr key={it.attendanceId}>
                <td className="mono">{it.attendanceDate}</td>
                <td><b>{it.employeeName}</b><div className="meta">{it.empCode}</div></td>
                <td>{it.shiftName}</td>
                <td>{hhmm(it.firstIn)} – {hhmm(it.lastOut)}</td>
                <td>{fmt(it.actualWorkMinutes)}</td>
                <td>{fmt(it.requiredWorkMinutes)}</td>
                <td><b>{fmt(it.roundedOtMinutes)}</b><div className="meta" title="Calculated before rounding">{fmt(it.calculatedOtMinutes)} calc.</div></td>
                {it.otStatus === 'PENDING' ? <>
                  <td style={{minWidth:150}}>
                    <div style={{display:'flex', alignItems:'center', gap:6}}>
                      <input type="number" min="1" max={it.calculatedOtMinutes} value={e.minutes} onChange={ev => setEdit(it, { minutes: ev.target.value })} style={{width:84}} />
                      <span className="meta">min</span>
                    </div>
                    <div className="meta">= {fmt(e.minutes)} · max {it.calculatedOtMinutes}</div>
                  </td>
                  <td style={{minWidth:180}}>
                    <input value={e.note} onChange={ev => setEdit(it, { note: ev.target.value })} placeholder={differs ? 'Note required — why changed?' : 'Optional note'}
                      style={differs && !e.note ? {borderColor:'var(--amber)'} : undefined} />
                  </td>
                  <td>
                    <div style={{display:'flex', gap:6, justifyContent:'flex-end'}}>
                      <button type="button" className="icon-act ok" title="Approve" disabled={busy === it.attendanceId} onClick={() => approve(it)}>✓</button>
                      <button type="button" className="icon-act no" title="Reject" disabled={busy === it.attendanceId} onClick={() => reject(it)}>✕</button>
                    </div>
                  </td>
                </> : <>
                  <td><b>{it.otStatus === 'APPROVED' ? fmt(it.approvedOtMinutes) : '—'}</b></td>
                  <td>
                    <span className={'pill ' + it.otStatus.toLowerCase()}>{it.otStatus[0] + it.otStatus.slice(1).toLowerCase()}</span>
                    <div className="meta">{it.decidedBy ? `by ${it.decidedBy}` : ''}{it.note ? ` · “${it.note}”` : ''}</div>
                  </td>
                  <td></td>
                </>}
              </tr>
            )
          })}
          {items.length === 0 && <tr className="empty-row"><td colSpan="10">{pendingView ? 'No overtime waiting for approval.' : 'No overtime to show for this selection.'}</td></tr>}
        </tbody>
      </table></div></div>
    </>
  )
}
