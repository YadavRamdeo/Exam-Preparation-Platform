import React, { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function ContentManager(){
  const [quals, setQuals] = useState([])
  const [papers, setPapers] = useState([])
  const [modules, setModules] = useState([])
  const [chapters, setChapters] = useState([])
  const [topics, setTopics] = useState([])

  const [qName, setQName] = useState('')
  const [pName, setPName] = useState('')
  const [mName, setMName] = useState('')
  const [cName, setCName] = useState('')
  const [tName, setTName] = useState('')

  const [selQual, setSelQual] = useState('')
  const [selPaper, setSelPaper] = useState('')
  const [selModule, setSelModule] = useState('')
  const [selChapter, setSelChapter] = useState('')
  const [selTopic, setSelTopic] = useState('')

  const [qText, setQText] = useState('')
  const [qType, setQType] = useState('MCQ_SINGLE')
  const [qDiff, setQDiff] = useState('MEDIUM')
  const [qSkill, setQSkill] = useState('KNOWLEDGE')
  const [qMarks, setQMarks] = useState(1)
  const [qChoices, setQChoices] = useState('[{"label":"A","value":"A"},{"label":"B","value":"B"}]')
  const [qCorrect, setQCorrect] = useState('{"value":"A"}')
  const [msg, setMsg] = useState('')

  async function refresh(){
    const [qs, ps, ms, cs, ts] = await Promise.all([
      api.listQualifications(), api.listPapers(), api.listModules(), api.listChapters(), api.listTopics()
    ])
    setQuals(qs); setPapers(ps); setModules(ms); setChapters(cs); setTopics(ts)
  }
  useEffect(()=>{ refresh() }, [])

  return (
    <div className="stack">
      <div className="card">
        <div className="h3">Manage Taxonomy</div>
        <div className="grid">
          <div className="stack">
            <div className="h4">Qualification</div>
            <input className="input" placeholder="Name" value={qName} onChange={(e)=>setQName(e.target.value)} />
            <button className="btn" onClick={async()=>{ await api.createQualification({ name: qName }); setQName(''); refresh() }}>Add</button>
            <ul className="muted">{quals.map(q=>(<li key={q.id}>#{q.id} {q.name}</li>))}</ul>
          </div>
          <div className="stack">
            <div className="h4">Paper</div>
            <select className="input" value={selQual} onChange={(e)=>setSelQual(e.target.value)}>
              <option value="">Qualification</option>
              {quals.map(q=><option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
            <input className="input" placeholder="Name" value={pName} onChange={(e)=>setPName(e.target.value)} />
            <button className="btn" onClick={async()=>{ if(!selQual) return; await api.createPaper({ qualification: Number(selQual), name: pName }); setPName(''); refresh() }}>Add</button>
            <ul className="muted">{papers.map(p=>(<li key={p.id}>#{p.id} {p.name}</li>))}</ul>
          </div>
          <div className="stack">
            <div className="h4">Module</div>
            <select className="input" value={selPaper} onChange={(e)=>setSelPaper(e.target.value)}>
              <option value="">Paper</option>
              {papers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className="input" placeholder="Name" value={mName} onChange={(e)=>setMName(e.target.value)} />
            <button className="btn" onClick={async()=>{ if(!selPaper) return; await api.createModule({ paper: Number(selPaper), name: mName }); setMName(''); refresh() }}>Add</button>
            <ul className="muted">{modules.map(m=>(<li key={m.id}>#{m.id} {m.name}</li>))}</ul>
          </div>
          <div className="stack">
            <div className="h4">Chapter</div>
            <select className="input" value={selModule} onChange={(e)=>setSelModule(e.target.value)}>
              <option value="">Module</option>
              {modules.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input className="input" placeholder="Name" value={cName} onChange={(e)=>setCName(e.target.value)} />
            <button className="btn" onClick={async()=>{ if(!selModule) return; await api.createChapter({ module: Number(selModule), name: cName }); setCName(''); refresh() }}>Add</button>
            <ul className="muted">{chapters.map(c=>(<li key={c.id}>#{c.id} {c.name}</li>))}</ul>
          </div>
          <div className="stack">
            <div className="h4">Topic</div>
            <select className="input" value={selChapter} onChange={(e)=>setSelChapter(e.target.value)}>
              <option value="">Chapter</option>
              {chapters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="input" placeholder="Name" value={tName} onChange={(e)=>setTName(e.target.value)} />
            <button className="btn" onClick={async()=>{ if(!selChapter) return; await api.createTopic({ chapter: Number(selChapter), name: tName }); setTName(''); refresh() }}>Add</button>
            <ul className="muted">{topics.map(t=>(<li key={t.id}>#{t.id} {t.name}</li>))}</ul>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="h3">Add Question</div>
        <div className="grid" style={{gridTemplateColumns:'repeat(2,1fr)'}}>
          <div className="stack">
            <label className="label">Qualification</label>
            <select className="input" value={selQual} onChange={(e)=>setSelQual(e.target.value)}>
              <option value="">Select</option>
              {quals.map(q=><option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
            <label className="label">Paper</label>
            <select className="input" value={selPaper} onChange={(e)=>setSelPaper(e.target.value)}>
              <option value="">Select</option>
              {papers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label className="label">Module</label>
            <select className="input" value={selModule} onChange={(e)=>setSelModule(e.target.value)}>
              <option value="">Select</option>
              {modules.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <label className="label">Chapter</label>
            <select className="input" value={selChapter} onChange={(e)=>setSelChapter(e.target.value)}>
              <option value="">Select</option>
              {chapters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="label">Topic</label>
            <select className="input" value={selTopic} onChange={(e)=>setSelTopic(e.target.value)}>
              <option value="">Select</option>
              {topics.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="stack">
            <label className="label">Text</label>
            <textarea className="textarea" rows={6} value={qText} onChange={(e)=>setQText(e.target.value)} />
            <div className="grid" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
              <div>
                <label className="label">Type</label>
                <select className="input" value={qType} onChange={(e)=>setQType(e.target.value)}>
                  <option value="MCQ_SINGLE">MCQ_SINGLE</option>
                  <option value="MCQ_MULTI">MCQ_MULTI</option>
                  <option value="TRUE_FALSE">TRUE_FALSE</option>
                  <option value="SHORT">SHORT</option>
                  <option value="LONG">LONG</option>
                </select>
              </div>
              <div>
                <label className="label">Difficulty</label>
                <select className="input" value={qDiff} onChange={(e)=>setQDiff(e.target.value)}>
                  <option value="EASY">EASY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HARD">HARD</option>
                </select>
              </div>
              <div>
                <label className="label">Marks</label>
                <input className="input" type="number" step="0.5" value={qMarks} onChange={(e)=>setQMarks(e.target.value)} />
              </div>
            </div>
            <label className="label">Skill</label>
            <select className="input" value={qSkill} onChange={(e)=>setQSkill(e.target.value)}>
              <option value="KNOWLEDGE">KNOWLEDGE</option>
              <option value="APPLICATION">APPLICATION</option>
              <option value="PROFESSIONAL">PROFESSIONAL</option>
            </select>
            <label className="label">Choices JSON</label>
            <textarea className="textarea" rows={4} value={qChoices} onChange={(e)=>setQChoices(e.target.value)} />
            <label className="label">Correct JSON</label>
            <textarea className="textarea" rows={3} value={qCorrect} onChange={(e)=>setQCorrect(e.target.value)} />
            <button className="btn btn-primary" onClick={async()=>{
              try{
                await api.createQuestion({
                  qualification: Number(selQual), paper: Number(selPaper), module: Number(selModule), chapter: Number(selChapter), topic: Number(selTopic),
                  qtype: qType, difficulty: qDiff, skill_type: qSkill, text: qText, marks: Number(qMarks), choices: JSON.parse(qChoices||'[]'), correct_answer: JSON.parse(qCorrect||'{}')
                })
                setMsg('Question added'); setQText('')
              }catch(e){ setMsg('Failed to add question') }
            }}>Add Question</button>
            {msg && <div className="muted">{msg}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
