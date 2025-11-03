import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, API_BASE } from '../../api/client'

export default function TeacherDashboard() {
  const [templates, setTemplates] = useState([])
  const [batches, setBatches] = useState([])
  const [users, setUsers] = useState([])
  const [report, setReport] = useState(null)
  const [weak, setWeak] = useState([])
  const [selectedTopicIds, setSelectedTopicIds] = useState([])
  const [template, setTemplate] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [batchIds, setBatchIds] = useState([])
  const [studentIds, setStudentIds] = useState([])
  const [msg, setMsg] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [schedules, setSchedules] = useState([])
  const [weakStart, setWeakStart] = useState('')
  const [weakEnd, setWeakEnd] = useState('')
  const [editId, setEditId] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')

  useEffect(() => {
    api.listTemplates().then(setTemplates)
    api.listBatches().then(setBatches)
    api.listUsers().then(setUsers)
    // preload content for custom papers
    Promise.all([api.listModules(), api.listChapters(), api.listTopics()]).catch(()=>{})
  }, [])

  useEffect(() => {
    if (!selectedBatchId) { setSchedules([]); return }
    api.listSchedules({ batch: selectedBatchId }).then((list)=>{
      const now = new Date()
      setSchedules(list.filter(s => new Date(s.ends_at) >= now))
    })
    const now = new Date()
    const s = new Date(now.getTime() + 5*60*1000).toISOString().slice(0,16)
    const e = new Date(now.getTime() + 7*24*60*60*1000).toISOString().slice(0,16)
    setWeakStart(s); setWeakEnd(e)
  }, [selectedBatchId])

  async function assign(e){
    e.preventDefault()
    setMsg('Creating schedule...')
    try{
      const payload = { template: Number(template), starts_at: starts, ends_at: ends, batches: batchIds.map(Number), students: studentIds.map(Number) }
      await api.scheduleTest(payload)
      setMsg('Scheduled!')
    }catch(e){ setMsg('Failed to schedule') }
  }

  function toggle(arr, setArr, id){
    setArr(arr.includes(id) ? arr.filter(x=>x!==id) : [...arr, id])
  }

  const [meInfo, setMeInfo] = useState(null)
  useEffect(()=>{ api.me().then(setMeInfo).catch(()=>{}) },[])

  return (
    <div className="stack-lg">
      <h2 className="h2">Teacher Dashboard</h2>
      <div className="card">
        <div className="card__header"><div className="h4">Security</div><span className="badge">2FA: {meInfo?.two_factor_enabled ? 'ON' : 'OFF'}</span></div>
        <div className="card__actions" style={{justifyContent:'flex-start', gap:'.5rem'}}>
          <button className="btn" onClick={()=>api.toggle2FA(true).then(()=>api.me().then(setMeInfo))}>Enable 2FA</button>
          <button className="btn" onClick={()=>api.toggle2FA(false).then(()=>api.me().then(setMeInfo))}>Disable 2FA</button>
        </div>
      </div>
      <div className="card">
        <div className="h3">Assign Test</div>
        <form className="form" onSubmit={assign}>
          <label className="label">Template</label>
          <select className="input" value={template} onChange={(e)=>setTemplate(e.target.value)}>
            <option value="">Select</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label className="label">Starts at</label>
          <input className="input" type="datetime-local" value={starts} onChange={(e)=>setStarts(e.target.value)} />
          <label className="label">Ends at</label>
          <input className="input" type="datetime-local" value={ends} onChange={(e)=>setEnds(e.target.value)} />

          <div className="grid">
            <div className="card">
              <div className="h4">Batches</div>
              <div className="stack" style={{maxHeight:200, overflow:'auto'}}>
                {batches.map(b => (
                  <label key={b.id} className="choice">
                    <input type="checkbox" className="choice__input" checked={batchIds.includes(b.id)} onChange={()=>toggle(batchIds,setBatchIds,b.id)} />
                    <span className="choice__label">{b.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="h4">Students</div>
              <div className="stack" style={{maxHeight:200, overflow:'auto'}}>
                {users.filter(u => u.role === 'STUDENT').map(u => (
                  <label key={u.id} className="choice">
                    <input type="checkbox" className="choice__input" checked={studentIds.includes(u.id)} onChange={()=>toggle(studentIds,setStudentIds,u.id)} />
                    <span className="choice__label">{u.username}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <button className="btn btn-primary" type="submit">Assign</button>
          {msg && <span className="muted" style={{marginLeft:'.5rem'}}>{msg}</span>}
        </form>
      </div>

      <div className="card">
        <div className="h3">Upcoming Schedules</div>
        <ul>
          {schedules.map(s => (
            <li key={s.id}>
              #{s.id} · Template #{s.template}
              {s.override_config?.include_topics?.length ? <span className="badge" style={{marginLeft:8}}>topics: {s.override_config.include_topics.length}</span> : null}
              <button className="btn" style={{marginLeft:8}} onClick={async ()=>{
                try{ const ins = await api.scheduleInsights(s.id); alert(`Assigned: ${ins.assigned.length}\nSubmitted: ${ins.submitted.length}\nPending: ${ins.pending.length}\nAvg time/question: ${Math.round(ins.time_stats?.avg_time||0)}s`) }catch(e){ alert('Failed to load insights') }
              }}>Insights</button>
              {editId === s.id ? (
                <div className="form" style={{display:'inline-grid', gridTemplateColumns:'repeat(2,auto)', gap:8, marginLeft:8}}>
                  <input className="input" type="datetime-local" value={editStart} onChange={(e)=>setEditStart(e.target.value)} />
                  <input className="input" type="datetime-local" value={editEnd} min={editStart||new Date().toISOString().slice(0,16)} onChange={(e)=>setEditEnd(e.target.value)} />
                  <button className="btn btn-primary" onClick={async ()=>{
                    if (!editStart || !editEnd || editEnd <= editStart) { alert('End must be after start'); return }
                    try{
                      await api.updateSchedule(s.id, { template: s.template, starts_at: editStart, ends_at: editEnd, batches: [Number(selectedBatchId)], students: [], override_config: s.override_config||{} })
                      setEditId(''); api.listSchedules({ batch: selectedBatchId }).then(setSchedules)
                    }catch(e){ alert('Failed to update') }
                  }}>Save</button>
                  <button className="btn" onClick={()=>setEditId('')}>Cancel</button>
                </div>
              ) : (
                <>
                  <span className="muted"> · {new Date(s.starts_at).toLocaleString()} → {new Date(s.ends_at).toLocaleString()}</span>
                  <Link className="btn" style={{marginLeft:8}} to={`/teacher/schedule/${s.id}`}>View</Link>
                  <button className="btn" onClick={()=>{ setEditId(s.id); setEditStart(s.starts_at.slice(0,16)); setEditEnd(s.ends_at.slice(0,16)) }}>Edit</button>
                  <button className="btn" onClick={async ()=>{ if(confirm('Cancel this schedule?')) { try{ await api.deleteSchedule(s.id); api.listSchedules({ batch: selectedBatchId }).then(setSchedules) } catch(e){ alert('Failed to cancel') } } }}>Cancel</button>
                  <button className="btn" onClick={async ()=>{
                    const msg = prompt('Message to pending students (optional):')||''
                    const res = prompt('Resource URLs (comma separated, optional):')||''
                    const resources = res.split(',').map(s=>s.trim()).filter(Boolean)
                    try{ await api.scheduleNotify(s.id, { message: msg, resources, pending_only: true }); alert('Notification sent to pending students') }catch(e){ alert('Failed to notify') }
                  }}>Notify Pending</button>
                </>
              )}
            </li>
          ))}
          {!schedules.length && <li className="muted">No upcoming schedules for this batch</li>}
        </ul>
      </div>

      <div className="card">
        <div className="h3">Reports & Manual Grading</div>
        <div className="form">
          <label className="label">Template</label>
          <select className="input" value={template} onChange={(e)=>setTemplate(e.target.value)}>
            <option value="">Select</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label className="label">Batch</label>
          <select className="input" value={selectedBatchId} onChange={async (e)=>{
            const bid = e.target.value
            setSelectedBatchId(bid)
            if(!bid) { setReport(null); setWeak([]); return }
            const r = await api.teacherBatchReport(bid, 30)
            setReport(r)
            const w = await api.teacherWeakTopics({ batchId: bid, days: 90, limit: 10, min_total: 3 })
            setWeak(w.weak_topics||[])
            setSelectedTopicIds((w.weak_topics||[]).map(t=>t.topic_id).filter(Boolean))
          }}>
            <option value="">Select batch</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {report && <BatchReport report={report} weak={weak} selectedBatchId={selectedBatchId} templateId={template} />}
        <ReportList templateId={template} />
      </div>
    </div>
  )
}

function ReportList({ templateId }){
  const [attempts, setAttempts] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(()=>{
    if (!templateId) { setAttempts([]); setSelected(null); return }
    fetchAttempts()
    async function fetchAttempts(){
      const qs = new URLSearchParams({ template: templateId })
      const res = await fetch(`${API_BASE}/exams/attempts/?${qs.toString()}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } })
      const data = await res.json()
      setAttempts(data)
    }
  }, [templateId])

  if (!templateId) return <div className="muted">Select a template to view attempts.</div>

  return (
    <div className="grid">
      <div className="card">
        <div className="h4">Attempts</div>
        <div className="card__actions" style={{justifyContent:'flex-start',gap:'.5rem'}}>
          <button className="btn" onClick={async ()=>{
            const qs = new URLSearchParams({ template: templateId })
            const res = await fetch(`${API_BASE}/exams/attempts/export/?${qs.toString()}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } })
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = 'attempts.csv'; a.click(); URL.revokeObjectURL(url)
          }}>Export CSV</button>
          <button className="btn" onClick={async ()=>{
            const qs = new URLSearchParams({ template: templateId })
            const res = await fetch(`${API_BASE}/exams/attempts/export-json/?${qs.toString()}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } })
            const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = 'attempts.json'; a.click(); URL.revokeObjectURL(url)
          }}>Export JSON</button>
        </div>
        <ul>
          {attempts.map(a => (
            <li key={a.id}>
              #{a.id} · {a.user} · score {a.score} · acc {Number(a.accuracy||0).toFixed(0)}%
              <button className="btn" style={{marginLeft:'.5rem'}} onClick={()=>setSelected(a.id)}>Review</button>
            </li>
          ))}
        </ul>
      </div>
      <div className="card" style={{gridColumn:'span 2'}}>
        {selected ? <AttemptReview id={selected} /> : <div className="muted">Select an attempt</div>}
      </div>
    </div>
  )
}

function TimeBars({ items, focusId }){
  const max = Math.max(...items.map(i => i.time_spent_sec || 0), 1)
  return (
    <div style={{display:'flex',gap:4,margin:'.5rem 0'}}>
      {items.map(i => (
        <div key={i.id} title={`Q${i.id}: ${i.time_spent_sec||0}s`} style={{height:8,flex:1,background:i.id===focusId? '#3b82f6':'#17305a',opacity:(i.time_spent_sec||0)/max*0.8+0.2,borderRadius:2}} />
      ))}
    </div>
  )
}

function StudentRow({ s }){
  const [open, setOpen] = useState(false)
  const [topics, setTopics] = useState([])
  return (
    <div style={{marginBottom:8}}>
      <div>
        {s["user__username"]}: avg {Number(s.avg_score||0).toFixed(1)} ({Number(s.avg_accuracy||0).toFixed(0)}%) · attempts {s.attempts}
        <button className="btn" style={{marginLeft:8}} onClick={async ()=>{
          if(!open){
            const w = await api.teacherWeakTopics({ userId: s["user__id"], days: 90, limit: 8, min_total: 3 })
            setTopics(w.weak_topics||[])
          }
          setOpen(!open)
        }}>{open? 'Hide':'Weak topics'}</button>
      </div>
      {open && (
        <ul className="muted" style={{marginTop:6}}>
          {topics.map((t,i)=>(<li key={i}>{t.topic} · acc {Number((t.acc||0)*100).toFixed(0)}% · n={t.total}</li>))}
        </ul>
      )}
    </div>
  )
}

function BatchReport({ report, weak, selectedBatchId, templateId }){
  const [selectedTopicIds, setSelectedTopicIds] = useState([])
  const [weakStart, setWeakStart] = useState('')
  const [weakEnd, setWeakEnd] = useState('')
  useEffect(()=>{
    const now = new Date();
    setWeakStart(new Date(now.getTime() + 5*60*1000).toISOString().slice(0,16))
    setWeakEnd(new Date(now.getTime() + 7*24*60*60*1000).toISOString().slice(0,16))
    setSelectedTopicIds((weak||[]).map(t=>t.topic_id).filter(Boolean))
  }, [weak])
  return (
    <div className="grid">
      <div className="card">
        <div className="h4">Students</div>
        <ul>
          {report.students.map(s => (
            <StudentRow key={s["user__id"]} s={s} />
          ))}
        </ul>
      </div>
      <div className="card">
        <div className="h4">Weak Topics (class)</div>
        <div className="form" style={{gridTemplateColumns:'repeat(2,1fr)'}}>
          <div>
            <label className="label">Starts</label>
            <input className="input" type="datetime-local" value={weakStart} min={new Date().toISOString().slice(0,16)} onChange={(e)=>setWeakStart(e.target.value)} />
          </div>
          <div>
            <label className="label">Ends</label>
            <input className="input" type="datetime-local" value={weakEnd} min={weakStart||new Date().toISOString().slice(0,16)} onChange={(e)=>setWeakEnd(e.target.value)} />
          </div>
        </div>
        <div className="stack">
          {weak.map((t,i)=>(
            <label key={i} className="choice">
              <input type="checkbox" className="choice__input" checked={selectedTopicIds.includes(t.topic_id)} onChange={(e)=>{
                setSelectedTopicIds(prev => e.target.checked ? [...new Set([...prev, t.topic_id])] : prev.filter(id=>id!==t.topic_id))
              }} />
              <span className="choice__label">{t.topic} · acc {Number((t.acc||0)*100).toFixed(0)}% · n={t.total}</span>
            </label>
          ))}
          {!weak.length && <div className="muted">No weak topics for this batch window.</div>}
        </div>
        <div className="card__actions" style={{justifyContent:'flex-start', gap:'.5rem'}}>
          <button className="btn" onClick={()=>setSelectedTopicIds(weak.map(w=>w.topic_id).filter(Boolean))}>Select all</button>
          <button className="btn" onClick={()=>setSelectedTopicIds([])}>Clear</button>
          <button className="btn btn-primary" onClick={async ()=>{
            if ((!weak.length && !selectedTopicIds.length) || !templateId || !selectedBatchId) return alert('Pick a template and batch first')
            const include_topics = selectedTopicIds.length ? selectedTopicIds : weak.map(w => w.topic_id).filter(Boolean)
            if (!include_topics.length) return alert('No topics selected')
            try {
              await api.scheduleTest({ template: Number(templateId), starts_at: weakStart, ends_at: weakEnd, batches: [Number(selectedBatchId)], students: [], override_config: { include_topics } })
              alert('Scheduled practice from weak topics for the batch')
            } catch (e) {
              alert('Failed to schedule')
            }
          }}>Schedule class practice from weak topics</button>
        </div>
      </div>
    </div>
  )
}

function AttemptReview({ id }){
  const [attempt, setAttempt] = useState(null)

  useEffect(()=>{
    fetch(`${API_BASE}/exams/attempts/${id}/`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } })
      .then(r=>r.json()).then(setAttempt)
  }, [id])

  if (!attempt) return <div className="muted">Loading...</div>

  async function saveItem(itemId, score, notes){
    await api.gradeItem(attempt.id, itemId, score, notes)
    const updated = await fetch(`${API_BASE}/exams/attempts/${id}/`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } }).then(r=>r.json())
    setAttempt(updated)
  }

  async function finalize(){
    const updated = await api.finalizeGrades(attempt.id)
    setAttempt(updated)
  }

  return (
    <div className="stack">
      <div className="h4">Attempt #{attempt.id} · {attempt.status} · Score {attempt.score}/{attempt.total_marks} · Acc {Number(attempt.accuracy||0).toFixed(0)}%</div>
      <div className="stack">
        {attempt.items.map(it => (
          <div key={it.id} className="card">
            <div className="muted">Q: {it.question.qtype} · {it.question.marks} mark(s) · {it.question.difficulty}</div>
            <div className="h4" style={{marginTop:'.25rem'}}>{it.question.text}</div>
            <div className="muted">Response: {JSON.stringify(it.response)}</div>
            <div className="muted">Time spent: {it.time_spent_sec}s</div>
            <TimeBars items={attempt.items} focusId={it.id} />
            <div className="form" style={{marginTop:'.5rem'}}>
              <label className="label">Manual Score</label>
              <input className="input" type="number" step="0.25" defaultValue={it.manual_score ?? ''} onBlur={(e)=>saveItem(it.id, e.target.value, it.reviewer_notes||'')} />
              <label className="label">Reviewer Notes</label>
              <input className="input" defaultValue={it.reviewer_notes||''} onBlur={(e)=>saveItem(it.id, it.manual_score ?? 0, e.target.value)} />
            </div>
          </div>
        ))}
      </div>
      <div className="card__actions">
        <button className="btn btn-primary" onClick={finalize}>Finalize Grades & Recalculate</button>
      </div>

      <TopicSummary items={attempt.items} />
    </div>
  )
}

function TopicSummary({ items }){
  const map = new Map()
  for (const it of items) {
    const t = it.question.topic_name || '—'
    const cur = map.get(t) || { total:0, correct:0, time:0 }
    cur.total += 1; cur.correct += it.is_correct ? 1 : 0; cur.time += it.time_spent_sec||0
    map.set(t, cur)
  }
  const rows = Array.from(map.entries()).map(([topic, v])=>({ topic, ...v, acc: v.total? (v.correct/v.total*100):0 }))
  const maxTime = Math.max(...rows.map(r=>r.time), 1)
  return (
    <div className="card">
      <div className="h4">Topic Summary</div>
      <div className="stack">
        {rows.map(r => (
          <div key={r.topic}>
            <div className="muted">{r.topic}</div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{flex:1, height:8, background:'#17305a', borderRadius:4, position:'relative'}}>
                <div style={{position:'absolute', left:0, top:0, bottom:0, width:`${(r.time/maxTime)*100}%`, background:'#3b82f6', borderRadius:4}}/>
              </div>
              <div className="muted" style={{width:80, textAlign:'right'}}>{r.time}s</div>
              <div className="badge">{r.acc.toFixed(0)}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
