import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

const emptyPunches = [{in:'',out:''},{in:'',out:''}]
const today = new Date().toISOString().slice(0,10)
const thisMonth = today.slice(0,7)

function punchesToPayload(punches) {
  return punches
    .filter(p => p.in || p.out)
    .map(p => ({punchIn: p.in || null, punchOut: p.out || null}))
}
function formatMinutes(value) {
  const n = Number(value || 0)
  return `${Math.floor(n / 60)}h ${String(n % 60).padStart(2,'0')}m`
}
function toMinutes(t) { const [h,m] = t.split(':').map(Number); return h*60 + (m||0) }
function weekdayOf(dateStr) {
  const [y,m,d] = dateStr.split('-').map(Number)
  return new Date(y, m-1, d).toLocaleDateString('en-US', {weekday:'short'})
}
// Break time between consecutive punch pairs — e.g. lunch — derived purely from
// the gap between one Out and the next In. Correctly reflects however long the
// break actually was, regardless of the shift's configured lunch window.
// Total raw span covered by all punches, with no lunch exclusion applied —
// used together with the backend's actualWorkMinutes to derive the TRUE
// total break/lunch time, whether it came from an explicit gap between
// punch pairs or the shift's automatic deduction for a single continuous
// punch. Gap-only totals (totalBreakMinutes above) miss the latter case.
function totalRawSpanMinutes(punches) {
  let total = 0
  for (const p of (punches||[])) {
    if (!p.punchIn || !p.punchOut) continue
    let s = toMinutes(p.punchIn), e = toMinutes(p.punchOut)
    if (e < s) e += 24*60
    total += (e - s)
  }
  return total
}
function monthRange(monthStr) {
  const [y,m] = monthStr.split('-').map(Number)
  const from = `${monthStr}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${monthStr}-${String(lastDay).padStart(2,'0')}`
  return {from, to, daysInMonth: lastDay}
}

export default function Attendance() {
  const [employees,setEmployees] = useState([]), [shifts,setShifts] = useState([]), [statuses,setStatuses] = useState([])
  const [departments,setDepartments] = useState([]), [departmentFilter,setDepartmentFilter] = useState('')
  const [month,setMonth] = useState(thisMonth), [employeeId,setEmployeeId] = useState('')
  const [entries,setEntries] = useState([]), [roundingRules,setRoundingRules] = useState([])
  const [ruleForm,setRuleForm] = useState({fromMinutes:0,toMinutes:29,roundedMinutes:0})
  const [showRoundingModal,setShowRoundingModal] = useState(false)
  const [showEntryModal,setShowEntryModal] = useState(false)
  const [error,setError] = useState(''), [success,setSuccess] = useState('')
  useEffect(()=>{ if(!success) return; const t=setTimeout(()=>setSuccess(''),4000); return()=>clearTimeout(t) },[success])

  // ---- entry modal's own form state ----
  const [editingId,setEditingId] = useState(null)
  const [formEmployeeId,setFormEmployeeId] = useState(''), [formDepartmentFilter,setFormDepartmentFilter] = useState(''), [date,setDate] = useState(today)
  const [shiftId,setShiftId] = useState(''), [attendanceStatusId,setAttendanceStatusId] = useState('')
  const [entryType,setEntryType] = useState('User'), [punches,setPunches] = useState(emptyPunches)
  const [calc,setCalc] = useState({actualWorkMinutes:0,requiredWorkMinutes:0,calculatedOtMinutes:0,roundedOtMinutes:0,approvedOtMinutes:0})
  const [approvedOt,setApprovedOt] = useState(''), [reason,setReason] = useState(''), [comments,setComments] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/employees'), api.get('/shifts'), api.get('/attendance/statuses'), api.get('/attendance/rounding-rules'), api.get('/departments')
    ]).then(([e,s,a,r,d]) => {
      setEmployees(e.data); setShifts(s.data); setStatuses(a.data); setRoundingRules(r.data); setDepartments(d.data)
      const present=a.data.find(x=>x.status==='PRESENT'); if(present) setAttendanceStatusId(String(present.attendanceStatusId))
    }).catch(()=>setError('Could not load attendance masters.'))
  },[])

  const {from, to, daysInMonth} = useMemo(()=>monthRange(month),[month])
  const loadEntries = () => {
    const params = {fromDate:from, toDate:to}
    if (employeeId) params.employeeId = employeeId
    api.get('/attendance',{params}).then(r=>setEntries(r.data)).catch(()=>setError('Could not load attendance entries.'))
  }
  useEffect(()=>{loadEntries()},[month,employeeId])

  const formSelectedEmployee = useMemo(()=>employees.find(e=>String(e.employeeId)===String(formEmployeeId)),[employees,formEmployeeId])
  const viewSelectedEmployee = useMemo(()=>employees.find(e=>String(e.employeeId)===String(employeeId)),[employees,employeeId])

  // Month summary — only meaningful once a specific employee is being viewed.
  const summary = useMemo(()=>{
    if (!employeeId) return null
    const s = {entered:entries.length, present:0, halfDay:0, leave:0, holiday:0, absent:0, weeklyOff:0, other:0}
    for (const e of entries) {
      if (e.attendanceType==='PRESENT'||e.attendanceType==='ON_DUTY') s.present++
      else if (e.attendanceType==='HALF_DAY') s.halfDay++
      else if (e.attendanceType==='PAID_LEAVE'||e.attendanceType==='UNPAID_LEAVE') s.leave++
      else if (e.attendanceType==='HOLIDAY') s.holiday++
      else if (e.attendanceType==='ABSENT') s.absent++
      else if (e.attendanceType==='WEEKLY_OFF') s.weeklyOff++
      else s.other++
    }
    return s
  },[entries,employeeId])
  function resetForm(){
    setEditingId(null); setFormEmployeeId(employeeId||''); setFormDepartmentFilter(departmentFilter||''); setDate(today); setShiftId(''); setEntryType('User')
    const present=statuses.find(x=>x.status==='PRESENT'); setAttendanceStatusId(present?String(present.attendanceStatusId):'')
    setPunches(emptyPunches); setApprovedOt(''); setReason(''); setComments('')
    setCalc({actualWorkMinutes:0,requiredWorkMinutes:0,calculatedOtMinutes:0,roundedOtMinutes:0,approvedOtMinutes:0})
  }
  function openAdd(){
    resetForm()
    const emp = employees.find(e=>String(e.employeeId)===String(employeeId))
    if (emp?.shiftId) setShiftId(String(emp.shiftId))
    setError(''); setSuccess(''); setShowEntryModal(true)
  }
  function openEdit(a){
    setEditingId(a.attendanceId); setFormEmployeeId(String(a.employeeId))
    const emp = employees.find(e=>e.employeeId===a.employeeId)
    setFormDepartmentFilter(emp?.department||''); setDate(a.attendanceDate)
    setShiftId(String(a.shiftId))
    const st = statuses.find(x=>x.status===a.attendanceType); setAttendanceStatusId(st?String(st.attendanceStatusId):'')
    setEntryType(a.entryType)
    const loaded = (a.punches||[]).map(p=>({in:(p.punchIn||'').slice(0,5), out:(p.punchOut||'').slice(0,5)}))
    setPunches(loaded.length ? loaded : emptyPunches)
    setApprovedOt(String(a.approvedOtMinutes ?? 0)); setReason(''); setComments(a.comments||'')
    setCalc({actualWorkMinutes:a.actualWorkMinutes,requiredWorkMinutes:a.requiredWorkMinutes,calculatedOtMinutes:a.calculatedOtMinutes,roundedOtMinutes:a.roundedOtMinutes,approvedOtMinutes:a.approvedOtMinutes})
    setError(''); setSuccess(''); setShowEntryModal(true)
  }
  function closeModal(){ setShowEntryModal(false) }

  // Auto-fill the shift when picking an employee inside the modal (only for a brand-new entry).
  useEffect(()=>{
    if(!formSelectedEmployee || editingId) return
    if(formSelectedEmployee.shiftId) setShiftId(String(formSelectedEmployee.shiftId))
  },[formSelectedEmployee])

  // Debounced live calculation as punches/shift change, same as before.
  useEffect(()=>{
    if(!showEntryModal || !formEmployeeId || !shiftId) return
    const timer=setTimeout(async()=>{
      try{
        const payload={employeeId:Number(formEmployeeId),shiftId:Number(shiftId),punches:punchesToPayload(punches)}
        const r=await api.post('/attendance/calculate',payload)
        setCalc(r.data)
        setApprovedOt(prev => (prev==='' ? String(r.data.roundedOtMinutes) : prev))
      }catch{}
    },300)
    return()=>clearTimeout(timer)
  },[formEmployeeId,shiftId,JSON.stringify(punches),showEntryModal])

  function setPunch(index,field,value){ setPunches(rows => rows.map((r,i) => i===index ? {...r,[field]:value} : r)) }
  function addPunchRow(){ setPunches(rows => [...rows, {in:'',out:''}]) }
  function removePunchRow(index){ setPunches(rows => rows.length<=1 ? rows : rows.filter((_,i)=>i!==index)) }

  async function save(e){
    e.preventDefault(); setError(''); setSuccess('')
    if(!formEmployeeId||!shiftId||!attendanceStatusId){setError('Employee, shift and attendance type are required.');return}
    try{
      await api.post('/attendance',{
        employeeId:Number(formEmployeeId),attendanceDate:date,shiftId:Number(shiftId),attendanceStatusId:Number(attendanceStatusId),
        entryType,punches:punchesToPayload(punches),
        approvedOtMinutes:approvedOt===''?null:Number(approvedOt),reason:reason||null,comments:comments||null
      })
      setSuccess(`Attendance saved for ${formSelectedEmployee?.fullName}.`)
      setShowEntryModal(false)
      loadEntries()
    }catch(err){setError(err.response?.data?.message||'Could not save attendance.')}
  }

  async function removeEntry(a){
    if(!window.confirm(`Delete the ${a.attendanceDate} entry for ${a.employeeName}?`)) return
    try{ await api.delete(`/attendance/${a.attendanceId}`); setSuccess('Attendance entry deleted.'); loadEntries() }
    catch(err){ setError(err.response?.data?.message||'Could not delete this entry.') }
  }

  async function addRoundingRule(e){
    e.preventDefault(); setError('')
    try{
      await api.post('/attendance/rounding-rules',{
        fromMinutes:Number(ruleForm.fromMinutes),toMinutes:Number(ruleForm.toMinutes),
        roundedMinutes:Number(ruleForm.roundedMinutes),isActive:true
      })
      const r=await api.get('/attendance/rounding-rules'); setRoundingRules(r.data)
      setSuccess('OT rounding rule added.')
    }catch(err){setError(err.response?.data?.message||'Could not add rounding rule.')}
  }
  async function deleteRoundingRule(id, label){
    if (!window.confirm(`Delete the rounding rule "${label}"?`)) return
    setError('')
    try{
      await api.delete(`/attendance/rounding-rules/${id}`)
      setRoundingRules(rules=>rules.filter(r=>r.otRoundingRuleId!==id))
      setSuccess('OT rounding rule deleted.')
    }catch(err){setError(err.response?.data?.message||'Could not delete rounding rule.')}
  }

  return <>
    <Topbar/>
    <div className="page-head">
      <div><h1>Daily Attendance</h1><p>Record attendance, punches and payroll-ready work/OT calculations.</p></div>
      <div style={{display:'flex', gap:10}}>
        <button type="button" className="btn-ghost" onClick={()=>setShowRoundingModal(true)}>⚙ OT Rounding Rules</button>
        <button type="button" className="btn-blue" onClick={openAdd}>＋ Add Entry</button>
      </div>
    </div>
    {error&&<div className="auth-error" style={{marginBottom:16}}>{error}</div>}
    {success&&<div className="success-note" style={{marginBottom:16}}>{success}</div>}

    <div className="card" style={{marginBottom:20}}>
      <div className="form-grid two">
        <div className="field"><label>Month</label><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div>
        <div className="field"><label>Department</label>
          <select value={departmentFilter} onChange={e=>{setDepartmentFilter(e.target.value); setEmployeeId('')}}>
            <option value="">All Departments</option>
            {departments.map(d=><option key={d.departmentId} value={d.departmentName}>{d.departmentName}</option>)}
          </select>
        </div>
        <div className="field"><label>Employee</label>
          <select value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>
            <option value="">All Employees</option>
            {employees.filter(e=>!departmentFilter || e.department===departmentFilter).map(e=><option key={e.employeeId} value={e.employeeId}>{e.fullName} — {e.empCode}</option>)}
          </select>
        </div>
        {viewSelectedEmployee && <div className="field"><label>Employee ID</label><input className="mono" value={viewSelectedEmployee.empCode} disabled/></div>}
      </div>
    </div>

    {summary && (
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))'}}>
        <div className="kpi-card"><div className="lbl">Total Entered Days</div><div className="num">{summary.entered}</div></div>
        <div className="kpi-card"><div className="lbl">Total Working Days</div><div className="num">{daysInMonth}</div></div>
        <div className="kpi-card"><div className="lbl">Total Present Days</div><div className="num">{summary.present}</div></div>
        <div className="kpi-card"><div className="lbl">Total Half-a-Days</div><div className="num">{summary.halfDay}</div></div>
        <div className="kpi-card"><div className="lbl">Total Leave Days</div><div className="num">{summary.leave}</div></div>
        <div className="kpi-card"><div className="lbl">Total Holidays</div><div className="num">{summary.holiday}</div></div>
        <div className="kpi-card"><div className="lbl">Total Absent Days</div><div className="num">{summary.absent}</div></div>
      </div>
    )}

    <div className="table-card">
      <div className="table-scroll"><table className="emp-table">
        <thead><tr>
          <th>Date</th><th>Day</th>{!employeeId && <th>Employee</th>}<th>Status</th>
          <th>In</th><th>Out</th><th>Break</th><th>Work Hrs</th><th>OT</th><th>Comments</th><th></th>
        </tr></thead>
        <tbody>{entries.slice().sort((a,b)=>a.attendanceDate.localeCompare(b.attendanceDate)).map(a=>{
          const valid=(a.punches||[]).filter(p=>p.punchIn&&p.punchOut)
          const firstIn = valid.length ? valid.slice().sort((x,y)=>x.punchIn.localeCompare(y.punchIn))[0].punchIn.slice(0,5) : '—'
          const lastOut = valid.length ? valid.slice().sort((x,y)=>y.punchOut.localeCompare(x.punchOut))[0].punchOut.slice(0,5) : '—'
          const brk = Math.max(0, totalRawSpanMinutes(a.punches) - a.actualWorkMinutes)
          return (
            <tr key={a.attendanceId}>
              <td className="mono">{a.attendanceDate}</td><td>{weekdayOf(a.attendanceDate)}</td>
              {!employeeId && <td><b>{a.employeeName}</b><div className="meta">{a.empCode}</div></td>}
              <td><span className={'badge '+(a.attendanceType==='PRESENT'||a.attendanceType==='ON_DUTY'?'active':'inactive')}>{a.attendanceType}</span></td>
              <td>{firstIn}</td><td>{lastOut}</td><td>{brk>0?formatMinutes(brk):'—'}</td>
              <td>{formatMinutes(a.actualWorkMinutes)}</td><td><b>{formatMinutes(a.approvedOtMinutes)}</b></td>
              <td className="meta" style={{maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={a.comments||''}>{a.comments||'—'}</td>
              <td><div className="row-actions">
                <button type="button" className="edit" title="Edit" onClick={()=>openEdit(a)}>✎</button>
                <button type="button" className="del" title="Delete" onClick={()=>removeEntry(a)}>🗑</button>
              </div></td>
            </tr>
          )
        })}
        {entries.length===0&&<tr className="empty-row"><td colSpan={employeeId?9:10}>No attendance entries for this month.</td></tr>}
        </tbody>
      </table></div>
    </div>

    {showEntryModal && (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal-box" style={{maxWidth:760}} onClick={e=>e.stopPropagation()}>
          <div className="modal-head">
            <h3>{editingId ? 'Edit Attendance Entry' : 'Add Attendance Entry'}</h3>
            <button type="button" className="icon-btn" onClick={closeModal} title="Close">✕</button>
          </div>
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="field"><label>Date *</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><small className="field-help">{weekdayOf(date)}</small></div>
              <div className="field"><label>Department</label>
                <select value={formDepartmentFilter} onChange={e=>{setFormDepartmentFilter(e.target.value); setFormEmployeeId('')}} disabled={!!editingId}>
                  <option value="">All Departments</option>
                  {departments.map(d=><option key={d.departmentId} value={d.departmentName}>{d.departmentName}</option>)}
                </select>
              </div>
              <div className="field"><label>Employee *</label>
                <select value={formEmployeeId} onChange={e=>setFormEmployeeId(e.target.value)} disabled={!!editingId}>
                  <option value="">Select employee…</option>
                  {employees.filter(e=>e.status==='Active' && (!formDepartmentFilter || e.department===formDepartmentFilter)).map(e=><option key={e.employeeId} value={e.employeeId}>{e.fullName} — {e.empCode}</option>)}
                </select>
              </div>
              <div className="field"><label>Employee ID</label><input className="mono" value={formSelectedEmployee?.empCode||''} disabled/></div>
              <div className="field"><label>Shift *</label>
                <select value={shiftId} onChange={e=>setShiftId(e.target.value)}>
                  <option value="">Select shift…</option>{shifts.filter(s=>s.status==='Active').map(s=><option key={s.shiftId} value={s.shiftId}>{s.shiftName} — {s.shiftCode}</option>)}
                </select>
              </div>
              <div className="field"><label>Attendance Type *</label>
                <select value={attendanceStatusId} onChange={e=>setAttendanceStatusId(e.target.value)}>
                  <option value="">Select type…</option>{statuses.map(s=><option key={s.attendanceStatusId} value={s.attendanceStatusId}>{s.status} — {s.meaning}</option>)}
                </select>
              </div>
              <div className="field"><label>Entry Type *</label><select value={entryType} onChange={e=>setEntryType(e.target.value)}><option>User</option><option>Biometric</option></select></div>
              <div className="field" style={{gridColumn:'1/-1'}}><label>Comments</label><input value={comments} onChange={e=>setComments(e.target.value)} placeholder="Any general note about this day (optional)"/></div>
            </div>

            <div style={{marginTop:18, marginBottom:6}}>
              <b style={{fontSize:13.5}}>In / Out Punches</b>
              <p className="card-sub" style={{margin:'2px 0 12px'}}>Add as many pairs as actually happened. A gap between one Out and the next In is automatically treated as a break.</p>
            </div>
            {punches.map((p,i)=>(
              <div key={i}>
                <div className="rep-row">
                  <div className="field" style={{margin:0}}><label>In {i+1}</label><input type="time" value={p.in} onChange={e=>setPunch(i,'in',e.target.value)}/></div>
                  <div className="field" style={{margin:0}}><label>Out {i+1}</label><input type="time" value={p.out} onChange={e=>setPunch(i,'out',e.target.value)}/></div>
                  <div></div>
                  <button type="button" className="icon-btn" onClick={()=>removePunchRow(i)} title="Remove this pair">✕</button>
                </div>
                {i < punches.length-1 && punches[i].in && punches[i].out && punches[i+1].in && punches[i+1].out && toMinutes(punches[i+1].in) > toMinutes(punches[i].out) && (
                  <div className="field-help" style={{margin:'-6px 0 10px 2px'}}>↳ Break: {formatMinutes(toMinutes(punches[i+1].in) - toMinutes(punches[i].out))}</div>
                )}
              </div>
            ))}
            <button type="button" className="add-row-btn" onClick={addPunchRow}>＋ Add another In/Out</button>

            <div className="section-label" style={{marginTop:18}}>Time Calculation</div>
            <div className="calc-grid">
              <div className="calc-box"><span>Actual Work</span><strong>{formatMinutes(calc.actualWorkMinutes)}</strong><small>{calc.actualWorkMinutes} minutes</small></div>
              <div className="calc-box"><span>Required Work</span><strong>{formatMinutes(calc.requiredWorkMinutes)}</strong><small>{calc.requiredWorkMinutes} minutes</small></div>
              <div className="calc-box"><span>Calculated OT</span><strong>{formatMinutes(calc.calculatedOtMinutes)}</strong><small>{calc.calculatedOtMinutes} minutes</small></div>
              <div className="calc-box"><span>Rounded OT</span><strong>{formatMinutes(calc.roundedOtMinutes)}</strong><small>{calc.roundedOtMinutes} minutes</small></div>
              <div className="field"><label>Approved OT (editable)</label><input type="number" min="0" value={approvedOt} onChange={e=>setApprovedOt(e.target.value)}/><small className="field-help">Stored in minutes · {formatMinutes(approvedOt)}</small></div>
              <div className="field" style={{gridColumn:'span 2'}}><label>Reason</label><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Required when approved OT differs from rounded OT"/></div>
            </div>

            <div style={{display:'flex', justifyContent:'flex-end', gap:10, marginTop:20, paddingTop:16, borderTop:'1px solid var(--line)'}}>
              <button type="button" className="btn-ghost" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn-blue">Save Attendance</button>
            </div>
          </form>
        </div>
      </div>
    )}

    {showRoundingModal && (
      <div className="modal-overlay" onClick={()=>setShowRoundingModal(false)}>
        <div className="modal-box" onClick={e=>e.stopPropagation()}>
          <div className="modal-head">
            <h3>OT Rounding Rules</h3>
            <button type="button" className="icon-btn" onClick={()=>setShowRoundingModal(false)} title="Close">✕</button>
          </div>
          <form className="form-grid" onSubmit={addRoundingRule} style={{marginBottom:18}}>
            <div className="field"><label>From Minutes</label><input type="number" min="0" value={ruleForm.fromMinutes} onChange={e=>setRuleForm(f=>({...f,fromMinutes:e.target.value}))}/></div>
            <div className="field"><label>To Minutes</label><input type="number" min="0" value={ruleForm.toMinutes} onChange={e=>setRuleForm(f=>({...f,toMinutes:e.target.value}))}/></div>
            <div className="field"><label>Payroll OT Minutes</label><input type="number" min="0" value={ruleForm.roundedMinutes} onChange={e=>setRuleForm(f=>({...f,roundedMinutes:e.target.value}))}/></div>
            <div className="field" style={{display:'flex',alignItems:'end'}}><button className="btn-blue" type="submit">＋ Add Rule</button></div>
          </form>
          <div className="table-scroll" style={{maxHeight:280, overflowY:'auto'}}><table className="emp-table"><thead><tr><th>Actual OT From</th><th>Actual OT To</th><th>Payroll OT</th><th></th></tr></thead>
          <tbody>{roundingRules.map(r=>(
            <tr key={r.otRoundingRuleId}>
              <td>{formatMinutes(r.fromMinutes)}</td><td>{formatMinutes(r.toMinutes)}</td><td><b>{formatMinutes(r.roundedMinutes)}</b></td>
              <td><button type="button" className="icon-btn" onClick={()=>deleteRoundingRule(r.otRoundingRuleId, `${formatMinutes(r.fromMinutes)} – ${formatMinutes(r.toMinutes)}`)} title="Delete this rule">🗑</button></td>
            </tr>
          ))}</tbody></table></div>
        </div>
      </div>
    )}
  </>
}
