import React, { useEffect, useState } from 'react'
import { api } from '../../api/client'
import TestPlayer from '../../components/TestPlayer'

export default function StudentDashboard() {
  const [templates, setTemplates] = useState([])
  const [attempt, setAttempt] = useState(null)
  const [result, setResult] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [trends, setTrends] = useState([])
  const [leaders, setLeaders] = useState([])

  useEffect(() => {
    api.markAttendance().catch(()=>{})
    api.listTemplates().then(setTemplates)
    api.myAnalytics().then(setAnalytics)
    api.myTrends(30).then((d)=>setTrends(d.series||[]))
    api.leaderboard(30).then(setLeaders)
  }, [])

  async function start(template, override_config) {
    const a = await api.startAttempt(template.id, undefined, override_config)
    setAttempt(a)
  }

  async function submit() {
    const res = await api.submit(attempt.id)
    setResult(res)
    setAttempt(null)
  }

  return (
    <div className="stack-lg">
      <h2 className="h2">Student Dashboard</h2>
      <div className="card" style={{paddingBottom:'.5rem'}}>
        <div className="card__header"><div className="h4">Security</div></div>
        <button className="btn" onClick={()=>api.toggle2FA(true).then(()=>api.me().then(setAnalytics))}>Enable 2FA</button>
        <button className="btn" onClick={()=>api.toggle2FA(false).then(()=>api.me().then(setAnalytics))}>Disable 2FA</button>
      </div>

      {!attempt && !result && (
        <div className="stack">
          <div className="card">
            <div className="h3">Quick Practice</div>
            <div className="card__actions" style={{justifyContent:'flex-start', gap:'.5rem'}}>
              <button className="btn" onClick={async ()=>{
                const w = await api.myWeakTopics({ days: 90, limit: 10, min_total: 3 })
                start(templates[0], { include_topics: (w.override_config?.include_topics)||[], count: 20 })
              }} disabled={!templates.length}>Practice Weak Topics</button>
              <button className="btn" onClick={()=>start(templates[0], { category: 'UNANSWERED', count: 20 })} disabled={!templates.length}>Unanswered x20</button>
              <button className="btn" onClick={()=>start(templates[0], { category: 'ALL', count: 20 })} disabled={!templates.length}>Random x20</button>
            </div>
          </div>
          <h3 className="h3">Available Templates</h3>
          <div className="grid">
            {templates.map(t => (
              <div key={t.id} className="card">
                <div className="card__header">
                  <div className="h4">{t.name}</div>
                  <span className="badge">{t.mode}</span>
                </div>
                <div className="muted">Qualification #{t.qualification}</div>
                <div className="card__actions">
                  <button className="btn btn-primary" onClick={() => start(t, { count: 21 })}>Start</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {attempt && (
        <div className="stack">
          <TestPlayer attempt={attempt} onSubmit={submit} />
        </div>
      )}

      {result && (
        <div className="card">
          <h3 className="h3">Result</h3>
          <div className="stats">
            <div className="stat"><div className="stat__label">Score</div><div className="stat__value">{result.score} / {result.total_marks}</div></div>
            <div className="stat"><div className="stat__label">Accuracy</div><div className="stat__value">{result.accuracy.toFixed(2)}%</div></div>
          </div>
          <button className="btn" onClick={() => setResult(null)}>Back</button>
        </div>
      )}

      {!attempt && !result && (
        <div className="grid">
          <div className="card">
            <div className="h3">My Analytics</div>
            {analytics ? (
              <div className="stats">
                <div className="stat"><div className="stat__label">Attempts</div><div className="stat__value">{analytics.summary.attempts||0}</div></div>
                <div className="stat"><div className="stat__label">Avg Score</div><div className="stat__value">{Number(analytics.summary.avg_score||0).toFixed(1)}</div></div>
                <div className="stat"><div className="stat__label">Avg Accuracy</div><div className="stat__value">{Number(analytics.summary.avg_accuracy||0).toFixed(1)}%</div></div>
              </div>
            ) : <div className="muted">No data</div>}
            <div className="muted">Top Topics</div>
            <ul>
              {(analytics?.topic_performance||[]).slice(0,5).map((t,i)=>(
                <li key={i}>{t["question__topic__name"]}: {t.correct}/{t.total}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="h3">Trends (30d)</div>
            <ul>
              {trends.slice(-8).map((p)=> (
                <li key={p.id} className="muted">{p.date}: score {p.score}, acc {Number(p.accuracy||0).toFixed(0)}%</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="h3">Leaderboard (30d)</div>
            <ol>
              {leaders.map((u,i)=> (
                <li key={i}>{u["user__username"]}: avg {Number(u.avg_score||0).toFixed(1)} (attempts {u.attempts})</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
