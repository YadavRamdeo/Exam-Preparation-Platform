import React, { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../api/client'

export default function ScheduleDetail() {
  const { id } = useParams()
  const [schedule, setSchedule] = useState(null)
  const [topics, setTopics] = useState([])
  const [batches, setBatches] = useState([])

  useEffect(() => {
    fetch(`/api/exams/schedules/${id}/`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` }})
      .then(r=>r.json()).then(setSchedule)
    api.listTopics().then(setTopics)
    api.listBatches().then(setBatches)
  }, [id])

  const topicMap = useMemo(() => Object.fromEntries((topics||[]).map(t => [t.id, t.name])), [topics])
  const batchMap = useMemo(() => Object.fromEntries((batches||[]).map(b => [b.id, b.name])), [batches])

  if (!schedule) return <div className="muted">Loading...</div>

  const inc = schedule.override_config?.include_topics || []
  return (
    <div className="stack-lg">
      <div>
        <Link className="link" to="/teacher">← Back</Link>
      </div>
      <h2 className="h2">Schedule #{schedule.id}</h2>
      <div className="card">
        <div className="stats">
          <div className="stat"><div className="stat__label">Template</div><div className="stat__value">#{schedule.template}</div></div>
          <div className="stat"><div className="stat__label">Starts</div><div className="stat__value">{new Date(schedule.starts_at).toLocaleString()}</div></div>
          <div className="stat"><div className="stat__label">Ends</div><div className="stat__value">{new Date(schedule.ends_at).toLocaleString()}</div></div>
          <div className="stat"><div className="stat__label">Batches</div><div className="stat__value">{(schedule.batches||[]).map(id=>batchMap[id]||(`#${id}`)).join(', ')||'—'}</div></div>
        </div>
        <div className="stack">
          <div className="h3">Included topics ({inc.length})</div>
          {inc.length ? (
            <ul>
              {inc.map(tid => <li key={tid}>{topicMap[tid] || `#${tid}`}</li>)}
            </ul>
          ) : <div className="muted">None (uses template defaults)</div>}
        </div>
      </div>
    </div>
  )
}
