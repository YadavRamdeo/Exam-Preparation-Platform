import React, { useEffect, useState } from 'react'
import { api, API_BASE } from '../../api/client'
import ContentManager from '../../components/ContentManager'

export default function AdminDashboard() {
  const [templates, setTemplates] = useState([])
  const [quals, setQuals] = useState([])
  const [papers, setPapers] = useState([])
  const [bulkMsg, setBulkMsg] = useState('')
  const [global, setGlobal] = useState(null)
  const [leaders, setLeaders] = useState([])
  const [users, setUsers] = useState([])
  const [batches, setBatches] = useState([])
  const [newBatchName, setNewBatchName] = useState('')
  const [nuUsername, setNuUsername] = useState('')
  const [nuEmail, setNuEmail] = useState('')
  const [nuPassword, setNuPassword] = useState('')
  const [nuRole, setNuRole] = useState('STUDENT')
  const [nuMsg, setNuMsg] = useState('')

  // Template form state
  const [tName, setTName] = useState('')
  const [tMode, setTMode] = useState('EXAM')
  const [tQual, setTQual] = useState('')
  const [tPaper, setTPaper] = useState('')
  const [tCount, setTCount] = useState(20)
  const [tNeg, setTNeg] = useState(0)
  const [tPartial, setTPartial] = useState(true)

  // Schedule form state
  const [sTemplate, setSTemplate] = useState('')
  const [sStart, setSStart] = useState('')
  const [sEnd, setSEnd] = useState('')

  useEffect(() => {
    api.listTemplates().then(setTemplates)
    api.listQualifications().then(setQuals)
    api.listPapers().then(setPapers)
    api.listUsers().then(setUsers).catch(()=>setUsers([]))
    api.listBatches().then(setBatches).catch(()=>setBatches([]))
    api.leaderboard(30).then(setLeaders)
    api.myTrends(1) // no-op to warm
    api.myAnalytics() // warm
    fetch(`${API_BASE}/analytics/global/`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` } }).then(r=>r.json()).then(setGlobal).catch(()=>{})
  }, [])

  async function createTemplate(e) {
    e.preventDefault()
    const payload = {
      name: tName,
      mode: tMode,
      qualification: Number(tQual),
      paper: Number(tPaper),
      config: { count: Number(tCount), negative_mark: Number(tNeg), partial_multi: Boolean(tPartial), randomize: true }
    }
    await api.createTemplate(payload)
    setTName('')
    api.listTemplates().then(setTemplates)
  }

  async function scheduleTest(e){
    e.preventDefault()
    await api.scheduleTest({ template: Number(sTemplate), starts_at: sStart, ends_at: sEnd })
    setSStart(''); setSEnd('')
  }

  async function onBulk(e){
    const file = e.target.files?.[0]
    if(!file) return
    setBulkMsg('Uploading...')
    try{ const res = await api.bulkUploadQuestions(file); setBulkMsg(`Created: ${res.created}`) }catch(err){ setBulkMsg('Upload failed') }
  }

  const [meInfo, setMeInfo] = useState(null)
  useEffect(()=>{ api.me().then(setMeInfo).catch(()=>{}) },[])

  return (
    <div className="stack-lg">
      <h2 className="h2">Admin Dashboard</h2>
      <div className="card">
        <div className="card__header"><div className="h4">Security</div><span className="badge">2FA: {meInfo?.two_factor_enabled ? 'ON' : 'OFF'}</span></div>
        <div className="card__actions" style={{justifyContent:'flex-start', gap:'.5rem'}}>
          <button className="btn" onClick={()=>api.toggle2FA(true).then(()=>api.me().then(setMeInfo))}>Enable 2FA</button>
          <button className="btn" onClick={()=>api.toggle2FA(false).then(()=>api.me().then(setMeInfo))}>Disable 2FA</button>
        </div>
      </div>

      <div className="grid">
        <div className="card" style={{gridColumn:'span 2'}}>
          <div className="h3">User & Role Management</div>
          <div className="grid">
            <div className="stack">
              <div className="h4">Create Batch</div>
              <div className="form" style={{gridTemplateColumns:'2fr auto'}}>
                <input className="input" placeholder="Batch name" value={newBatchName} onChange={(e)=>setNewBatchName(e.target.value)} />
                <button className="btn" onClick={async()=>{ if(!newBatchName) return; await api.createBatch({ name: newBatchName }); setNewBatchName(''); api.listBatches().then(setBatches) }}>Add</button>
              </div>
              <div className="muted">Batches: {(batches||[]).map(b=>b.name).join(', ')||'—'}</div>
            </div>
            <div className="stack" style={{gridColumn:'span 2'}}>
              <div className="h4">Create User</div>
              <form className="form" onSubmit={async (e)=>{
                e.preventDefault()
                setNuMsg('Creating...')
                try {
                  await api.createUser({ username: nuUsername, email: nuEmail, password: nuPassword, role: nuRole })
                  setNuMsg('User created')
                  setNuUsername(''); setNuEmail(''); setNuPassword(''); setNuRole('STUDENT')
                  api.listUsers().then(setUsers)
                } catch (e) {
                  setNuMsg('Failed to create user')
                }
              }}>
                <div className="grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
                  <input className="input" placeholder="Username" value={nuUsername} onChange={(e)=>setNuUsername(e.target.value)} required />
                  <input className="input" placeholder="Email (optional)" value={nuEmail} onChange={(e)=>setNuEmail(e.target.value)} />
                  <input className="input" type="password" placeholder="Password" value={nuPassword} onChange={(e)=>setNuPassword(e.target.value)} required />
                  <select className="input" value={nuRole} onChange={(e)=>setNuRole(e.target.value)}>
                    <option value="STUDENT">STUDENT</option>
                    <option value="TEACHER">TEACHER</option>
                    <option value="PARENT">PARENT</option>
                  </select>
                </div>
                <div className="card__actions" style={{justifyContent:'flex-start', gap:'.5rem'}}>
                  <button className="btn btn-primary" type="submit">Create</button>
                  {nuMsg && <span className="muted">{nuMsg}</span>}
                </div>
              </form>

              <div className="h4">Users</div>
              <div className="stack" style={{maxHeight: 280, overflow: 'auto'}}>
                {users.map(u => (
                  <div key={u.id} className="card" style={{padding:'.5rem'}}>
                    <div style={{display:'flex', alignItems:'center', gap:8, justifyContent:'space-between'}}>
                      <div><b>{u.username}</b> <span className="muted">({u.email||'no email'})</span></div>
                      <div style={{display:'flex', gap:8, alignItems:'center'}}>
                        <select className="input" value={u.role} onChange={async (e)=>{ await api.setUserRole(u.id, e.target.value); const list = await api.listUsers(); setUsers(list) }}>
                          <option value="ADMIN">ADMIN</option>
                          <option value="TEACHER">TEACHER</option>
                          <option value="STUDENT">STUDENT</option>
                          <option value="PARENT">PARENT</option>
                        </select>
                        <details>
                          <summary className="btn">Assign Batches</summary>
                          <div className="stack" style={{paddingTop:8}}>
                            {(batches||[]).map(b => (
                              <label key={b.id} className="choice">
                                <input type="checkbox" className="choice__input" defaultChecked={(u.batch_ids||[]).includes(b.id)} onChange={async (e)=>{
                                  const cur = new Set(u.batch_ids||[])
                                  const next = e.target.checked ? [...cur, b.id] : [...cur].filter(x=>x!==b.id)
                                  await api.assignUserBatches(u.id, next)
                                  const list = await api.listUsers(); setUsers(list)
                                }} />
                                <span className="choice__label">{b.name}</span>
                              </label>
                            ))}
                          </div>
                        </details>
                        {u.role === 'PARENT' && (
                          <details>
                            <summary className="btn">Link Children</summary>
                            <div className="stack" style={{paddingTop:8}}>
                              {users.filter(x=>x.role==='STUDENT').map(s => (
                                <label key={s.id} className="choice">
                                  <input type="checkbox" className="choice__input" defaultChecked={(u.child_ids||[]).includes(s.id)} onChange={async (e)=>{
                                    const cur = new Set(u.child_ids||[])
                                    const next = e.target.checked ? [...cur, s.id] : [...cur].filter(x=>x!==s.id)
                                    await api.setParentChildren(u.id, next)
                                    const list = await api.listUsers(); setUsers(list)
                                  }} />
                                  <span className="choice__label">{s.username}</span>
                                </label>
                              ))}
                              {!users.some(x=>x.role==='STUDENT') && <div className="muted">No students available</div>}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="h3">Global Analytics</div>
          {global ? (
            <div className="stats">
              <div className="stat"><div className="stat__label">Attempts</div><div className="stat__value">{global.attempts}</div></div>
              <div className="stat"><div className="stat__label">Avg Score</div><div className="stat__value">{Number(global.avg_score||0).toFixed(1)}</div></div>
            </div>
          ) : <div className="muted">No data</div>}
          <div className="grid">
            <div>
              <div className="muted">Top Modules</div>
              <ul>
                {(global?.top_modules||[]).map((m,i)=>(<li key={i}>{m["question__module__name"]}: {Number(m.acc*100||0).toFixed(0)}%</li>))}
              </ul>
            </div>
            <div>
              <div className="muted">Lowest Modules</div>
              <ul>
                {(global?.lowest_modules||[]).map((m,i)=>(<li key={i}>{m["question__module__name"]}: {Number(m.acc*100||0).toFixed(0)}%</li>))}
              </ul>
            </div>
          </div>
          <div className="card__actions" style={{justifyContent:'flex-start', gap:'.5rem'}}>
            <a className="btn" href={`${API_BASE}/analytics/export/attempts.csv`} target="_blank" rel="noreferrer">Download CSV</a>
            <a className="btn" href={`${API_BASE}/analytics/export/attempts.xlsx`} target="_blank" rel="noreferrer">Download Excel</a>
            <a className="btn" href={`${API_BASE}/analytics/export/attempts.pdf`} target="_blank" rel="noreferrer">Download PDF</a>
            <button className="btn" onClick={async ()=>{
              const to = prompt('Enter comma-separated emails to notify:')
              if(!to) return; try{ await fetch(`${API_BASE}/analytics/share/`, { method:'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}`, 'Content-Type':'application/json' }, body: JSON.stringify({ to: to.split(',').map(s=>s.trim()).filter(Boolean) }) }); alert('Notification sent') } catch(e){ alert('Failed to send') }
            }}>Share via Email</button>
          </div>
        </div>

        <div className="card">
          <div className="h3">Create Test Template</div>
          <form className="form" onSubmit={createTemplate}>
            <label className="label">Name</label>
            <input className="input" value={tName} onChange={(e)=>setTName(e.target.value)} />

            <label className="label">Mode</label>
            <select className="input" value={tMode} onChange={(e)=>setTMode(e.target.value)}>
              <option value="EXAM">Exam</option>
              <option value="PRACTICE">Practice</option>
            </select>

            <label className="label">Qualification</label>
            <select className="input" value={tQual} onChange={(e)=>setTQual(e.target.value)}>
              <option value="">Select</option>
              {quals.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>

            <label className="label">Paper</label>
            <select className="input" value={tPaper} onChange={(e)=>setTPaper(e.target.value)}>
              <option value="">Select</option>
              {papers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'.5rem'}}>
              <div>
                <label className="label">Question Count</label>
                <input className="input" type="number" value={tCount} onChange={(e)=>setTCount(e.target.value)} />
              </div>
              <div>
                <label className="label">Negative Mark</label>
                <input className="input" type="number" step="0.01" value={tNeg} onChange={(e)=>setTNeg(e.target.value)} />
              </div>
              <div>
                <label className="label">Partial Multi</label>
                <select className="input" value={String(tPartial)} onChange={(e)=>setTPartial(e.target.value === 'true')}>
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
            </div>

            <button className="btn btn-primary" type="submit">Create</button>
          </form>
        </div>

        <div className="card">
          <div className="h3">Schedule Test</div>
          <form className="form" onSubmit={scheduleTest}>
            <label className="label">Template</label>
            <select className="input" value={sTemplate} onChange={(e)=>setSTemplate(e.target.value)}>
              <option value="">Select</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <label className="label">Starts at</label>
            <input className="input" type="datetime-local" value={sStart} onChange={(e)=>setSStart(e.target.value)} />
            <label className="label">Ends at</label>
            <input className="input" type="datetime-local" value={sEnd} onChange={(e)=>setSEnd(e.target.value)} />
            <button className="btn btn-primary" type="submit">Schedule</button>
          </form>
        </div>

        <div className="card">
          <div className="h3">Bulk Upload Questions (CSV)</div>
          <input className="input" type="file" accept=".csv" onChange={onBulk} />
          {bulkMsg && <div className="muted" style={{marginTop:'.5rem'}}>{bulkMsg}</div>}
        </div>

        <div className="card" style={{gridColumn:'span 2'}}>
          <div className="h3">Content Management</div>
          <ContentManager />
        </div>
      </div>

      <div className="stack">
        <h3 className="h3">Existing Templates</h3>
        <div className="grid">
          {templates.map(t => (
            <div key={t.id} className="card">
              <div className="card__header">
                <div className="h4">{t.name}</div>
                <span className="badge">{t.mode}</span>
              </div>
              <div className="muted">Qualification #{t.qualification} · Paper #{t.paper}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
