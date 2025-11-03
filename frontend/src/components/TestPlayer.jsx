import React, { useMemo, useState } from 'react'
import { api } from '../api/client'

function CodingEditor({ item, answers, setAnswers, onSelect, attemptId }) {
  const template = `class Solution:\n    def isAnagram(self, s: str, t: str) -> bool:\n        # Write your code here\n        return False\n`
  const initial = answers[item.id]?.text ?? template
  const [code, setCode] = React.useState(initial)
  const [running, setRunning] = React.useState(false)
  const [results, setResults] = React.useState([])
  const [passed, setPassed] = React.useState(!!answers[item.id]?.tests_passed)
  const [passCount, setPassCount] = React.useState(0)
  const [totalCount, setTotalCount] = React.useState(0)

  React.useEffect(()=>{
    // keep local state in sync when switching items
    setCode(answers[item.id]?.text ?? template)
    setResults([])
    setPassed(!!answers[item.id]?.tests_passed)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  async function run() {
    setRunning(true)
    try {
      const res = await api.runCode(attemptId, item.id, code)
      const list = res.results || []
      setResults(list)
      const pc = list.filter(r => r.ok).length
      const tc = list.length
      setPassCount(pc)
      setTotalCount(tc)
      setPassed(!!res.passed)
      const payload = { text: code, tests_passed: !!res.passed, pass_count: pc, total_count: tc }
      setAnswers(prev => ({ ...prev, [item.id]: payload }))
      onSelect(payload)
    } catch (e) {
      setResults([{ case: '-', input: [], expected: 'OK', got: String(e), ok: false }])
      setPassCount(0)
      setTotalCount(0)
      setPassed(false)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="coding">
      <div className="muted" style={{marginBottom:'.5rem'}}>Solve in Python. Implement class <b>Solution</b> with method <b>isAnagram(self, s: str, t: str) -&gt; bool</b>.</div>
      <textarea className="textarea" rows={14} value={code} onChange={(e)=>setCode(e.target.value)} />
      <div className="player__actions" style={{justifyContent:'flex-start', gap:'.5rem'}}>
        <button className="btn" type="button" onClick={run} disabled={running}>{running ? 'Running...' : 'Run Tests'}</button>
        <span className="badge">{totalCount ? `${passCount}/${totalCount} tests passed` : (passed ? 'All tests passed' : 'Tests pending')}</span>
        {passed && <span className="badge" style={{background:'#16a34a'}}>OK</span>}
      </div>
      {!!results.length && (
        <div className="card" style={{marginTop:'.5rem'}}>
          <div className="h4">Results</div>
          <ul>
            {results.map(r => (
              <li key={r.case} className={r.ok ? 'muted' : ''}>Case {r.case}: got {String(r.got)} expected {String(r.expected)} {r.ok ? '✓' : '✗'}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function TestPlayer({ attempt, onSubmit }) {
  const items = attempt.items
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [timer, setTimer] = useState(0)
  const [bookmarks, setBookmarks] = useState({})
  const [noteText, setNoteText] = useState('')
  const [lastTick, setLastTick] = useState(Date.now())
  const [autoSubmitted, setAutoSubmitted] = useState(false)
  const [codingConfirm, setCodingConfirm] = useState({ show: false, targetIdx: null })
  const [submitConfirm, setSubmitConfirm] = useState(false)

  const item = items[idx]
  const isPractice = String(attempt?.mode||'').toUpperCase() === 'PRACTICE'
 
  // hydrate answers from attempt payload if present
  React.useEffect(() => {
    const init = {}
    for (const it of items || []) {
      if (it.response) init[it.id] = it.response
    }
    if (Object.keys(init).length) setAnswers((prev) => ({ ...init, ...prev }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const t = setInterval(() => setTimer((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const durationMinutes = attempt?.template_config?.duration_minutes || 60
  React.useEffect(() => {
    const maxSeconds = Math.max(1, Number(durationMinutes) * 60)
    if (!autoSubmitted && timer >= maxSeconds) {
      setAutoSubmitted(true)
      onSubmit()
    }
  }, [timer, durationMinutes, autoSubmitted, onSubmit])

  // Fullscreen enforcement
  const [fsRequired, setFsRequired] = React.useState(true)
  React.useEffect(()=>{
    async function enter(){
      try{ if(document.documentElement.requestFullscreen){ await document.documentElement.requestFullscreen(); setFsRequired(false) } else { setFsRequired(false) } }catch(e){ /* user canceled */ }
    }
    // Prompt once on mount
    enter()
    function onFsChange(){
      const inFs = document.fullscreenElement != null
      setFsRequired(!inFs)
      api.resumeEvent(attempt.id, inFs ? 'FULLSCREEN_ON' : 'FULLSCREEN_OFF').catch(()=>{})
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return ()=>document.removeEventListener('fullscreenchange', onFsChange)
  }, [attempt.id])

  // Browser focus/visibility and security tracking
  React.useEffect(() => {
    function onBlur(){ api.resumeEvent(attempt.id, 'BLUR').catch(()=>{}) }
    function onFocus(){ api.resumeEvent(attempt.id, 'FOCUS').catch(()=>{}) }
    function onHide(){ api.resumeEvent(attempt.id, 'VISIBILITY_HIDDEN').catch(()=>{}) }
    function onShow(){ api.resumeEvent(attempt.id, 'VISIBILITY_VISIBLE').catch(()=>{}) }
    function onOffline(){ api.resumeEvent(attempt.id, 'OFFLINE').catch(()=>{}) }
    function onOnline(){ api.resumeEvent(attempt.id, 'ONLINE').catch(()=>{}) }
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide(); else onShow();
    })
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [attempt.id])

  // Anti-cheat: prevent copy/paste/context and detect devtools and multi-tab
  const [multiTab, setMultiTab] = React.useState(false)
  React.useEffect(()=>{
    function onKey(e){
      const k = e.key?.toLowerCase()
      const blocked = (e.ctrlKey||e.metaKey) && (k==='c' || k==='x' || k==='v' || k==='s')
      if (blocked){ e.preventDefault(); api.resumeEvent(attempt.id, k==='c'?'COPY':k==='v'?'PASTE':'KEY', { key: e.key }).catch(()=>{}) }
      if (k==='f12'){ api.resumeEvent(attempt.id, 'DEVTOOLS_OPEN').catch(()=>{}) }
    }
    function onCtx(e){ e.preventDefault(); api.resumeEvent(attempt.id, 'CONTEXT').catch(()=>{}) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('contextmenu', onCtx)

    // rudimentary devtools detection
    let last = { w: window.outerWidth, h: window.outerHeight }
    const iv = setInterval(()=>{
      const dw = Math.abs((window.outerWidth||0) - (window.innerWidth||0))
      const dh = Math.abs((window.outerHeight||0) - (window.innerHeight||0))
      if (dw > 160 || dh > 160) { api.resumeEvent(attempt.id, 'DEVTOOLS_OPEN').catch(()=>{}) }
      last = { w: window.outerWidth, h: window.outerHeight }
    }, 3000)

    // multi-tab via BroadcastChannel
    let bc
    try{
      bc = new BroadcastChannel(`attempt_${attempt.id}`)
      bc.postMessage({ t: 'join' })
      bc.onmessage = (ev)=>{
        if (ev?.data?.t === 'join') { setMultiTab(true); api.resumeEvent(attempt.id, 'MULTITAB').catch(()=>{}); bc.postMessage({ t:'ack' }) }
        if (ev?.data?.t === 'ack') { setMultiTab(true); api.resumeEvent(attempt.id, 'MULTITAB').catch(()=>{}) }
      }
    }catch(e){ /* ignore */ }

    return ()=>{
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('contextmenu', onCtx)
      clearInterval(iv)
      try{ bc && bc.close() }catch{}
    }
  }, [attempt.id])

  function onSelect(value) {
    setAnswers({ ...answers, [item.id]: value })
    const now = Date.now()
    const spent = Math.floor((now - lastTick)/1000)
    setLastTick(now)
    api.answer(attempt.id, item.id, value, spent).then((resp)=>{
      if (isPractice && resp && typeof resp === 'object') {
        setAnswers(prev => ({ ...prev, [item.id]: { ...(prev[item.id]||{}), ...value, explanation: resp.explanation, media_url: resp.media_url, correct_answer: resp.correct_answer } }))
      }
    }).catch(console.error)
  }

  function navigateTo(i) {
    const dest = items[i]
    if (!dest) return
    // Only confirm when navigating to the LAST item (coding round at position 21)
    if (dest.question?.qtype === 'LONG' && i === items.length - 1) {
      setCodingConfirm({ show: true, targetIdx: i })
      return
    }
    setIdx(i)
    setLastTick(Date.now())
  }
  function goto(i) { navigateTo(i) }
  function next() { navigateTo(Math.min(idx + 1, items.length - 1)) }
  function prev() { navigateTo(Math.max(idx - 1, 0)) }

  async function toggleBookmark() {
    const next = !bookmarks[item.id]
    setBookmarks({ ...bookmarks, [item.id]: next })
    await api.bookmark(attempt.id, item.id, next).catch(()=>{})
  }

  async function saveNote() {
    await api.note(attempt.id, item.id, noteText).catch(()=>{})
  }

  return (
    <div className="player">
      <div className="player__top">
        <div className="muted">Question {idx + 1} / {items.length}</div>
        <div className="badge">Time {Math.floor(timer/60)}:{String(timer%60).padStart(2,'0')}</div>
      </div>

      {fsRequired && (
        <div className="card" style={{marginBottom:'.5rem'}}>
          <div className="h4">Fullscreen required</div>
          <div className="muted">Please enter fullscreen to continue the exam.</div>
          <div className="card__actions" style={{justifyContent:'flex-start'}}>
            <button className="btn btn-primary" onClick={async()=>{ try{ await document.documentElement.requestFullscreen(); setFsRequired(false) }catch(e){} }}>Enter Fullscreen</button>
          </div>
        </div>
      )}

      <div className="player__body card" onCopy={(e)=>{e.preventDefault(); api.resumeEvent(attempt.id,'COPY').catch(()=>{})}} onPaste={(e)=>{e.preventDefault(); api.resumeEvent(attempt.id,'PASTE').catch(()=>{})}}>
        <div className="q-meta muted">
          <span className="tag">{item.question.qtype.replace('_', ' ')}</span>
          <span className="tag">{item.question.difficulty}</span>
        </div>
        <div className="q-text h3">{item.question.text}</div>

        (item.question.qtype.includes('MCQ') || item.question.qtype === 'TRUE_FALSE') ? (
          <div className="choices">
            {((item.question.choices || []).map((c) => ({
              label: c.label ?? c.text ?? c.value ?? c.key ?? '',
              value: c.value ?? c.key ?? c.label ?? c.text ?? '',
            }))).map((c, i) => {
              const isMulti = item.question.qtype === 'MCQ_MULTI'
              const sel = answers[item.id]
              const checked = isMulti ? (sel?.values || []).includes(c.value) : sel?.value === c.value
              return (
                <label key={c.value || i} className="choice">
                  <input
                    className="choice__input"
                    type={isMulti ? 'checkbox' : 'radio'}
                    name={`q-${item.id}`}
                    checked={!!checked}
                    onChange={(e) => {
                      if (isMulti) {
                        const current = answers[item.id]?.values || []
                        const next = e.target.checked ? [...new Set([...current, c.value])] : current.filter(v => v !== c.value)
                        onSelect({ values: next })
                      } else {
                        onSelect({ value: c.value })
                      }
                    }}
                  />
                  <span className="choice__label">{c.label}</span>
                </label>
              )
            })}
          </div>
        ) : (
          <CodingEditor item={item} answers={answers} setAnswers={setAnswers} onSelect={onSelect} attemptId={attempt.id} />
        )}

        {isPractice && answers[item.id] && answers[item.id].hasOwnProperty('tests_passed') === false && (
          <div className="card" style={{marginTop:'.5rem'}}>
            <div className="h4">Explanation</div>
            <div className="muted">{answers[item.id]?.explanation || '—'}</div>
            {answers[item.id]?.media_url && <a className="link" href={answers[item.id].media_url} target="_blank" rel="noreferrer">Watch/Listen</a>}
            <div className="muted">Correct: {JSON.stringify(answers[item.id]?.correct_answer||{})}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
          <button className="btn" type="button" onClick={toggleBookmark}>{bookmarks[item.id] ? 'Unflag' : 'Flag for review'}</button>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flex: 1 }}>
            <input className="input" placeholder="Add a note" value={noteText} onChange={(e)=>setNoteText(e.target.value)} />
            <button className="btn" type="button" onClick={saveNote}>Save</button>
          </div>
          {isPractice && <button className="btn" type="button" onClick={()=>api.pauseAttempt(attempt.id).catch(()=>{})}>Pause</button>}
          {isPractice && <button className="btn" type="button" onClick={()=>api.resumeAttempt(attempt.id).catch(()=>{})}>Resume</button>}
        </div>
      </div>

      <div className="player__actions">
        <button className="btn" onClick={prev} disabled={idx===0}>Prev</button>
        <button className="btn" onClick={next} disabled={idx===items.length-1}>Next</button>
        <button className="btn btn-primary" onClick={() => setSubmitConfirm(true)}>Submit</button>
      </div>

      <div className="palette card">
        {items.map((it, i) => (
          <button key={it.id} className={`dot ${i===idx ? 'dot--active' : ''} ${answers[it.id] ? 'dot--answered' : ''}`} onClick={() => goto(i)}>{i+1}</button>
        ))}
      </div>

      {codingConfirm.show && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'grid', placeItems:'center', zIndex:1000}}>
          <div className="card" style={{maxWidth:500, padding:'1rem 1.25rem', textAlign:'center'}}>
            <div className="h3" style={{marginBottom:'.25rem'}}>Enter Coding Round?</div>
            <div className="muted" style={{marginBottom:'.75rem'}}>Are you sure you want to jump to the Coding Round (Question {codingConfirm.targetIdx + 1})?</div>
            <div style={{display:'flex', gap:'.5rem', justifyContent:'center'}}>
              <button className="btn" onClick={()=>setCodingConfirm({ show:false, targetIdx:null })}>Cancel</button>
              <button className="btn btn-primary" onClick={()=>{ setIdx(codingConfirm.targetIdx); setLastTick(Date.now()); setCodingConfirm({ show:false, targetIdx:null }) }}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {submitConfirm && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'grid', placeItems:'center', zIndex:1000}}>
          <div className="card" style={{maxWidth:520, padding:'1rem 1.25rem', textAlign:'center'}}>
            <div className="h3" style={{marginBottom:'.25rem'}}>Submit Test?</div>
            <div className="muted" style={{marginBottom:'.75rem'}}>Are you sure you want to submit your test now? You won\'t be able to change answers after submitting.</div>
            <div style={{display:'flex', gap:'.5rem', justifyContent:'center'}}>
              <button className="btn" onClick={()=>setSubmitConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={()=>{ setSubmitConfirm(false); onSubmit() }}>Submit Now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
