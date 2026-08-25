import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

const emptyPunches = [{in:'',out:''},{in:'',out:''}]

function punchesToPayload(punches) {
  return punches
    .filter(p => p.in || p.out)
    .map(p => ({punchIn: p.in || null, punchOut: p.out || null}))
}

function formatMinutes(value) {
  const n = Number(value || 0)
  return `${Math.floor(n / 60)}h ${String(n % 60).padStart(2,'0')}m`
}

export default function Attendance() {
  const today = new Date().toISOString().slice(0,10)
  const [employees,setEmployees] = useState([]), [shifts,setShifts] = useState([]), [statuses,setStatuses] = useState([])
  const [entries,setEntries] = useState([]), [roundingRules,setRoundingRules] = useState([])
  const [date,setDate] = useState(today), [employeeId,setEmployeeId] = useState('')
  const [shiftId,setShiftId] = useState(''), [attendanceStatusId,setAttendanceStatusId] = useState('')
  const [entryType,setEntryType] = useState('User'), [punches,setPunches] = useState(emptyPunches)
  const [calc,setCalc] = useState({actualWorkMinutes:0,requiredWorkMinutes:0,calculatedOtMinutes:0,roundedOtMinutes:0,approvedOtMinutes:0})
  const [approvedOt,setApprovedOt] = useState(''), [reason,setReason] = useState('')
  const [ruleForm,setRuleForm] = useState({fromMinutes:0,toMinutes:29,roundedMinutes:0})
  const [showRoundingModal,setShowRoundingModal] = useState(false)
  const [error,setError] = useState(''), [success,setSuccess] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/employees'), api.get('/shifts'), api.get('/attendance/statuses'), api.get('/attendance/rounding-rules')
    ]).then(([e,s,a,r]) => {
      setEmployees(e.data); setShifts(s.data); setStatuses(a.data); setRoundingRules(r.data)
      const present=a.data.find(x=>x.status==='PRESENT'); if(present) setAttendanceStatusId(String(present.attendanceStatusId))
    }).catch(()=>setError('Could not load attendance masters.'))
  },[])

  const loadEntries = () => {
    api.get('/attendance',{params:{date}}).then(r=>setEntries(r.data)).catch(()=>setError('Could not load attendance entries.'))
  }
  useEffect(()=>{loadEntries()},[date])

  const selectedEmployee = useMemo(()=>employees.find(e=>String(e.employeeId)===String(employeeId)),[employees,employeeId])

  useEffect(()=>{
    if(!selectedEmployee) return
    if(selectedEmployee.shiftId) setShiftId(String(selectedEmployee.shiftId))
    const existing=entries.find(x=>x.employeeId===selectedEmployee.employeeId)
    if(existing){
      api.get(`/attendance/${existing.attendanceId}`).then(r=>{
        const a=r.data
        setShiftId(String(a.shiftId)); setAttendanceStatusId(String(a.attendanceStatusId)); setEntryType(a.entryType)
        const loaded = (a.punches || [])
          .slice().sort((x,y)=>x.sequenceNo-y.sequenceNo)
          .map(p => ({in:(p.punchIn||'').slice(0,5), out:(p.punchOut||'').slice(0,5)}))
        setPunches(loaded.length ? loaded : emptyPunches)
        setApprovedOt(String(a.approvedOtMinutes??a.roundedOtMinutes??0)); setReason(a.reason||'')
        setCalc({actualWorkMinutes:a.actualWorkMinutes,requiredWorkMinutes:a.requiredWorkMinutes,calculatedOtMinutes:a.calculatedOtMinutes,roundedOtMinutes:a.roundedOtMinutes,approvedOtMinutes:a.approvedOtMinutes})
      })
    } else {
      setPunches(emptyPunches); setApprovedOt(''); setReason('')
      setCalc({actualWorkMinutes:0,requiredWorkMinutes:0,calculatedOtMinutes:0,roundedOtMinutes:0,approvedOtMinutes:0})
    }
  },[selectedEmployee,entries])

  useEffect(()=>{
    if(!employeeId || !shiftId) return
    const timer=setTimeout(async()=>{
      try{
        const payload={employeeId:Number(employeeId),shiftId:Number(shiftId),punches:punchesToPayload(punches)}
        const r=await api.post('/attendance/calculate',payload)
        setCalc(r.data)
        if(approvedOt==='' || Number(approvedOt)===calc.roundedOtMinutes) setApprovedOt(String(r.data.roundedOtMinutes))
      }catch{}
    },300)
    return()=>clearTimeout(timer)
  },[employeeId,shiftId,JSON.stringify(punches)])

  function setPunch(index,field,value){
    setPunches(rows => rows.map((r,i) => i===index ? {...r,[field]:value} : r))
  }
  function addPunchRow(){
    setPunches(rows => [...rows, {in:'',out:''}])
  }
  function removePunchRow(index){
    setPunches(rows => rows.length<=1 ? rows : rows.filter((_,i)=>i!==index))
  }

  async function save(e){
    e.preventDefault();setError('');setSuccess('')
    if(!employeeId||!shiftId||!attendanceStatusId){setError('Employee, shift and attendance type are required.');return}
    try{
      await api.post('/attendance',{
        employeeId:Number(employeeId),attendanceDate:date,shiftId:Number(shiftId),attendanceStatusId:Number(attendanceStatusId),
        entryType,punches:punchesToPayload(punches),
        approvedOtMinutes:approvedOt===''?null:Number(approvedOt),reason:reason||null
      })
      setSuccess(`Attendance saved for ${selectedEmployee?.fullName}.`)
      loadEntries()
    }catch(err){setError(err.response?.data?.message||'Could not save attendance.')}
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

  function chooseEmployee(v){setEmployeeId(v)}

  return <>
    <Topbar crumbs={<b>Daily Attendance Entry</b>}/>
    <div className="page-head">
      <div><h1>Daily Attendance Entry</h1><p>Record attendance, punches and payroll-ready work/OT calculations.</p></div>
    </div>
    {error&&<div className="auth-error" style={{marginBottom:16}}>{error}</div>}
    {success&&<div className="success-note" style={{marginBottom:16}}>{success}</div>}

    <form onSubmit={save} className="attendance-page">
      <div className="card">
        <div className="form-grid">
          <div className="section-label">Attendance Details</div>
          <div className="field"><label>Date *</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
          <div className="field"><label>Employee *</label>
            <select value={employeeId} onChange={e=>chooseEmployee(e.target.value)}>
              <option value="">Select employee…</option>
              {employees.filter(e=>e.status==='Active').map(e=><option key={e.employeeId} value={e.employeeId}>{e.fullName} — {e.empCode}</option>)}
            </select>
          </div>
          <div className="field"><label>Employee ID</label><input className="mono" value={selectedEmployee?.empCode||''} disabled/></div>
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
        </div>
      </div>

      <div style={{display:'flex', justifyContent:'flex-end', marginBottom:16}}>
        <button type="button" className="btn-ghost" onClick={()=>setShowRoundingModal(true)}>⚙ OT Rounding Rules</button>
      </div>

      <div className="card">
        <div className="section-head-inline"><div><h3>In / Out Punches</h3><p className="card-sub">Add as many In/Out pairs as this employee actually punched that day — no fixed limit.</p></div></div>
        {punches.map((p,i)=>(
          <div className="rep-row" key={i}>
            <div className="field" style={{margin:0}}><label>In {i+1}</label><input type="time" value={p.in} onChange={e=>setPunch(i,'in',e.target.value)}/></div>
            <div className="field" style={{margin:0}}><label>Out {i+1}</label><input type="time" value={p.out} onChange={e=>setPunch(i,'out',e.target.value)}/></div>
            <div></div>
            <button type="button" className="icon-btn" onClick={()=>removePunchRow(i)} title="Remove this pair">✕</button>
          </div>
        ))}
        <button type="button" className="add-row-btn" onClick={addPunchRow}>＋ Add another In/Out</button>
      </div>

      <div className="card">
        <div className="section-label">Time Calculation</div>
        <div className="calc-grid">
          <div className="calc-box"><span>Actual Work</span><strong>{formatMinutes(calc.actualWorkMinutes)}</strong><small>{calc.actualWorkMinutes} minutes</small></div>
          <div className="calc-box"><span>Required Work</span><strong>{formatMinutes(calc.requiredWorkMinutes)}</strong><small>{calc.requiredWorkMinutes} minutes</small></div>
          <div className="calc-box"><span>Calculated OT</span><strong>{formatMinutes(calc.calculatedOtMinutes)}</strong><small>{calc.calculatedOtMinutes} minutes</small></div>
          <div className="calc-box"><span>Rounded OT</span><strong>{formatMinutes(calc.roundedOtMinutes)}</strong><small>{calc.roundedOtMinutes} minutes</small></div>
          <div className="field"><label>Approved OT (editable)</label><input type="number" min="0" value={approvedOt} onChange={e=>setApprovedOt(e.target.value)}/><small className="field-help">Stored in minutes · {formatMinutes(approvedOt)}</small></div>
          <div className="field" style={{gridColumn:'span 2'}}><label>Reason</label><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Required when approved OT differs from rounded OT"/></div>
        </div>
        <div className="footer-actions" style={{padding:'20px 0 0'}}>
          <button type="button" className="btn-ghost" onClick={()=>{setEmployeeId('');setPunches(emptyPunches);setApprovedOt('');setReason('')}}>Cancel</button>
          <button type="submit" className="btn-blue">Save Attendance</button>
        </div>
      </div>
    </form>

    <div className="card" style={{marginTop:20}}>
      <div className="section-head-inline"><div><h3>Attendance Entries — {date}</h3><p className="card-sub">Saved daily records and payroll calculation values.</p></div></div>
      <div className="table-scroll"><table className="emp-table">
        <thead><tr><th>Employee</th><th>Type</th><th>Shift</th><th>Work</th><th>Calculated OT</th><th>Rounded OT</th><th>Approved OT</th></tr></thead>
        <tbody>{entries.map(a=><tr key={a.attendanceId}>
          <td><b>{a.employeeName}</b><div className="meta">{a.empCode}</div></td><td>{a.attendanceType}</td><td>{a.shiftName}</td>
          <td>{formatMinutes(a.actualWorkMinutes)}</td><td>{formatMinutes(a.calculatedOtMinutes)}</td><td>{formatMinutes(a.roundedOtMinutes)}</td><td><b>{formatMinutes(a.approvedOtMinutes)}</b></td>
        </tr>)}{entries.length===0&&<tr className="empty-row"><td colSpan="7">No attendance entries for this date.</td></tr>}</tbody>
      </table></div>
    </div>

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
