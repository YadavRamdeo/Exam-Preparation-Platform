import React, { useEffect, useState } from 'react'
import { api } from '../../api/client'

export default function ParentDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.parentSummary().then((d)=>{ setData(d); setLoading(false) }).catch(()=>setLoading(false))
  }, [])

  if (loading) return <div className="muted">Loading...</div>

  const [meInfo, setMeInfo] = useState(null)
  useEffect(()=>{ api.me().then(setMeInfo).catch(()=>{}) },[])

  const noChildren = !((data?.children||[]).length)

  return (
    <div className="stack-lg">
      <h2 className="h2">Parent Dashboard</h2>
      {noChildren && (
        <div className="card">
          <div className="h4">No linked students</div>
          <div className="muted">Ask an Admin to link your account to student(s) via Admin → User & Role Management → Link Children.</div>
        </div>
      )}
      <div className="card">
        <div className="card__header"><div className="h4">Security</div><span className="badge">2FA: {meInfo?.two_factor_enabled ? 'ON' : 'OFF'}</span></div>
        <div className="card__actions" style={{justifyContent:'flex-start', gap:'.5rem'}}>
          <button className="btn" onClick={()=>api.toggle2FA(true).then(()=>api.me().then(setMeInfo))}>Enable 2FA</button>
          <button className="btn" onClick={()=>api.toggle2FA(false).then(()=>api.me().then(setMeInfo))}>Disable 2FA</button>
        </div>
      </div>
      <div className="card__actions" style={{justifyContent:'flex-start', gap:'.5rem'}}>
        <button className="btn" onClick={()=>api.parentWeeklySummary().then(()=>alert('Weekly summary emailed')).catch(()=>alert('Failed to send'))}>Email Weekly Summary</button>
        <a className="btn" href={`${api.parentReportCardUrl()}`} target="_blank" rel="noreferrer">Download Report Card (All)</a>
      </div>
      <div className="grid">
        {(data?.children || []).map(ch => (
          <div key={ch.student_id} className="card">
            <div className="card__header">
              <div className="h4">{ch.student}</div>
              <span className="badge">Attempts: {ch.summary.attempts || 0}</span>
            </div>
            <div className="stats">
              <div className="stat"><div className="stat__label">Avg Score</div><div className="stat__value">{Number(ch.summary.avg_score||0).toFixed(1)}</div></div>
              <div className="stat"><div className="stat__label">Avg Accuracy</div><div className="stat__value">{Number(ch.summary.avg_accuracy||0).toFixed(1)}%</div></div>
              <div className="stat"><div className="stat__label">Attendance (30d)</div><div className="stat__value">{ch.attendance_30||0}</div></div>
              <div className="stat"><div className="stat__label">Time Spent (30d)</div><div className="stat__value">{Math.round((ch.time_spent_30||0)/60)} min</div></div>
            </div>
            <div className="h4">Weak Topics</div>
            <ul>
              {(ch.weak_topics||[]).map((t,i)=>(<li key={i} className="muted">{t["question__topic__name"]}: {Math.round((t.acc||0)*100)}% · n={t.total}</li>))}
              {!(ch.weak_topics||[]).length && <li className="muted">No data</li>}
            </ul>
            <div className="h4">Improved Topics</div>
            <ul>
              {(ch.improved_topics||[]).map((t,i)=>(<li key={i} className="muted">{t.topic}: +{Math.round((t.delta||0)*100)}%</li>))}
              {!(ch.improved_topics||[]).length && <li className="muted">No data</li>}
            </ul>
            <div className="card__actions" style={{justifyContent:'flex-start'}}>
              <a className="btn" href={`${api.parentReportCardUrl(ch.student_id)}`} target="_blank" rel="noreferrer">Report Card (PDF)</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
