import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

const emptyPunches = {in1:'',out1:'',in2:'',out2:'',in3:'',out3:'',in4:'',out4:'',in5:'',out5:''}

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
        setPunches({
          in1:(a.in1||'').slice(0,5),out1:(a.out1||'').slice(0,5),in2:(a.in2||'').slice(0,5),out2:(a.out2||'').slice(0,5),
          in3:(a.in3||'').slice(0,5),out3:(a.out3||'').slice(0,5),in4:(a.in4||'').slice(0,5),out4:(a.out4||'').slice(0,5),
          in5:(a.in5||'').slice(0,5),out5:(a.out5||'').slice(0,5)
        })
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
        const payload={employeeId:Number(employeeId),shiftId:Number(shiftId),
          in1:punches.in1||null,out1:punches.out1||null,in2:punches.in2||null,out2:punches.out2||null,
          in3:punches.in3||null,out3:punches.out3||null,in4:punches.in4||null,out4:punches.out4||null,
          in5:punches.in5||null,out5:punches.out5||null}
        const r=await api.post('/attendance/calculate',payload)
        setCalc(r.data)
        if(approvedOt==='' || Number(approvedOt)===calc.roundedOtMinutes) setApprovedOt(String(r.data.roundedOtMinutes))
      }catch{}
    },300)
    return()=>clearTimeout(timer)
  },[employeeId,shiftId,...Object.values(punches)])

  function setPunch(k,v){setPunches(p=>({...p,[k]:v}))}

  async function save(e){
    e.preventDefault();setError('');setSuccess('')
    if(!employeeId||!shiftId||!attendanceStatusId){setError('Employee, shift and attendance type are required.');return}
    try{
      await api.post('/attendance',{
        employeeId:Number(employeeId),attendanceDate:date,shiftId:Number(shiftId),attendanceStatusId:Number(attendanceStatusId),
        entryType,in1:punches.in1||null,out1:punches.out1||null,in2:punches.in2||null,out2:punches.out2||null,
        in3:punches.in3||null,out3:punches.out3||null,in4:punches.in4||null,out4:punches.out4||null,
        in5:punches.in5||null,out5:punches.out5||null,
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

      <div className="card">
        <div className="section-head-inline"><div><h3>In / Out Punches</h3><p className="card-sub">Five punch pairs are stored directly on the attendance row for predictable performance.</p></div></div>
        <div className="punch-grid">
          {[1,2,3,4,5].map(n=><div className="punch-pair" key={n}>
            <div className="punch-number">{n}</div>
            <div className="field"><label>In{n}</label><input type="time" value={punches[`in${n}`]} onChange={e=>setPunch(`in${n}`,e.target.value)}/></div>
            <div className="field"><label>Out{n}</label><input type="time" value={punches[`out${n}`]} onChange={e=>setPunch(`out${n}`,e.target.value)}/></div>
          </div>)}
        </div>
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

    <div className="card" style={{marginTop:20}}>
      <h3>OT Rounding Rules</h3><p className="card-sub">The default rules reproduce the supplied 0/30/60/90-minute rounding table. Rules are stored as a master table so payroll policy can change without changing code.</p>
      <form className="form-grid" onSubmit={addRoundingRule} style={{marginBottom:18}}>
        <div className="field"><label>From Minutes</label><input type="number" min="0" value={ruleForm.fromMinutes} onChange={e=>setRuleForm(f=>({...f,fromMinutes:e.target.value}))}/></div>
        <div className="field"><label>To Minutes</label><input type="number" min="0" value={ruleForm.toMinutes} onChange={e=>setRuleForm(f=>({...f,toMinutes:e.target.value}))}/></div>
        <div className="field"><label>Payroll OT Minutes</label><input type="number" min="0" value={ruleForm.roundedMinutes} onChange={e=>setRuleForm(f=>({...f,roundedMinutes:e.target.value}))}/></div>
        <div className="field" style={{display:'flex',alignItems:'end'}}><button className="btn-blue" type="submit">＋ Add Rule</button></div>
      </form>
      <div className="table-scroll"><table className="emp-table"><thead><tr><th>Actual OT From</th><th>Actual OT To</th><th>Payroll OT</th></tr></thead>
      <tbody>{roundingRules.map(r=><tr key={r.otRoundingRuleId}><td>{formatMinutes(r.fromMinutes)}</td><td>{formatMinutes(r.toMinutes)}</td><td><b>{formatMinutes(r.roundedMinutes)}</b></td></tr>)}</tbody></table></div>
    </div>
  </>
}
