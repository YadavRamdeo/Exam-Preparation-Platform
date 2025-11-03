export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api'

export function getToken() {
  return localStorage.getItem('token')
}

export function setToken(t) {
  localStorage.setItem('token', t)
}

export function clearToken() {
  localStorage.removeItem('token')
}

export function getRefreshToken() {
  return localStorage.getItem('refresh')
}
export function setRefreshToken(t) {
  localStorage.setItem('refresh', t)
}
export function clearRefreshToken() {
  localStorage.removeItem('refresh')
}

async function refreshAccess() {
  const refresh = getRefreshToken()
  if (!refresh) throw new Error('No refresh token')
  const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
  if (!res.ok) { clearToken(); clearRefreshToken(); throw new Error('Refresh failed') }
  const data = await res.json()
  if (data?.access) setToken(data.access)
  return data
}

async function request(path, options = {}, retry = true) {
  const headers = options.headers || {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (res.status === 401 && retry && getRefreshToken()) {
    try { await refreshAccess() } catch(e) { throw e }
    return request(path, options, false)
  }
  if (!res.ok) throw new Error((await res.text()) || 'Request failed')
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}

function djb2(str){
  let h = 5381; for(let i=0;i<str.length;i++){ h = ((h<<5)+h) + str.charCodeAt(i) }
  return (h>>>0).toString(16)
}
function deviceHash(){
  try{
    const parts = [navigator.userAgent, navigator.platform, navigator.language, screen.width, screen.height, screen.colorDepth, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|')
    return djb2(parts)
  }catch(e){ return 'na' }
}

export const api = {
  login: (username, password, otp, challenge_id) =>
    request('/auth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, otp, challenge_id })
    }).then((d) => {
      if (d && d.access) setToken(d.access)
      if (d && d.refresh) setRefreshToken(d.refresh)
      return d
    }),
  me: () => request('/auth/me/'),
  toggle2FA: (enable=true) => request('/auth/2fa/toggle/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enable }) }),
  // Content
  listQualifications: () => request('/content/qualifications/'),
  listPapers: () => request('/content/papers/'),
  listModules: () => request('/content/modules/'),
  listChapters: () => request('/content/chapters/'),
  listTopics: () => request('/content/topics/'),
  createQualification: (payload) => request('/content/qualifications/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  createPaper: (payload) => request('/content/papers/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  createModule: (payload) => request('/content/modules/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  createChapter: (payload) => request('/content/chapters/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  createTopic: (payload) => request('/content/topics/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  createQuestion: (payload) => request('/content/questions/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  bulkUploadQuestions: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return request('/content/questions/bulk_upload/', { method: 'POST', body: fd })
  },
  // Exams
  createTemplate: (payload) => request('/exams/templates/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  listTemplates: () => request('/exams/templates/'),
  scheduleTest: (payload) => request('/exams/schedules/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  listSchedules: (params={}) => request(`/exams/schedules/?${new URLSearchParams(params)}`),
  updateSchedule: (id, payload) => request(`/exams/schedules/${id}/`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  deleteSchedule: (id) => request(`/exams/schedules/${id}/`, { method: 'DELETE' }),
  scheduleInsights: (id) => request(`/exams/schedules/${id}/insights/`),
  scheduleNotify: (id, payload) => request(`/exams/schedules/${id}/notify/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  startAttempt: (template_id, schedule_id, override_config) => request('/exams/attempts/start/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_id, schedule_id, override_config, device_hash: deviceHash() }) }),
  answer: (attemptId, itemId, response, time_spent_sec=0) => request(`/exams/attempts/${attemptId}/answer/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId, response, time_spent_sec }) }),
  submit: (attemptId) => request(`/exams/attempts/${attemptId}/submit/`, { method: 'POST' }),
  bookmark: (attemptId, itemId, value=true) => request(`/exams/attempts/${attemptId}/bookmark/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId, value }) }),
  note: (attemptId, itemId, text='') => request(`/exams/attempts/${attemptId}/note/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId, text }) }),
  runCode: (attemptId, itemId, code) => request(`/exams/attempts/${attemptId}/run-code/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId, code }) }),
  resumeEvent: (attemptId, event, meta={}) => request(`/exams/attempts/${attemptId}/resume-event/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, meta }) }),
  pauseAttempt: (attemptId) => request(`/exams/attempts/${attemptId}/pause/`, { method: 'POST' }),
  resumeAttempt: (attemptId) => request(`/exams/attempts/${attemptId}/resume/`, { method: 'POST' }),
  gradeItem: (attemptId, itemId, score, notes='') => request(`/exams/attempts/${attemptId}/grade-item/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId, score, notes }) }),
  finalizeGrades: (attemptId) => request(`/exams/attempts/${attemptId}/finalize-grades/`, { method: 'POST' }),
  // Analytics
  myAnalytics: () => request('/analytics/me/'),
  myTrends: (days=60) => request(`/analytics/trends/?days=${days}`),
  leaderboard: (days=30) => request(`/analytics/leaderboard/?days=${days}`),
  exportAttemptsCsv: () => request('/analytics/export/attempts.csv'),
  exportAttemptsPdf: () => request('/analytics/export/attempts.pdf'),
  parentSummary: () => request('/analytics/parent/summary/'),
  parentReportCardUrl: (userId) => `${API_BASE}/analytics/parent/report-card.pdf${userId?`?user_id=${userId}`:''}`,
  parentWeeklySummary: () => request('/analytics/parent/weekly-summary/', { method: 'POST' }),
  myWeakTopics: (opts={}) => request(`/analytics/me/weak-topics/?${new URLSearchParams({ days: opts.days||90, limit: opts.limit||10, min_total: opts.min_total||3 })}`),
  teacherBatchReport: (batchId, days=30) => request(`/analytics/teacher/batch-report/?batch_id=${batchId}&days=${days}`),
  teacherWeakTopics: ({ userId, batchId, days=90, limit=10, min_total=5 }) => request(`/analytics/teacher/weak-topics/?${new URLSearchParams({ user_id: userId||'', batch_id: batchId||'', days, limit, min_total })}`),
  // Accounts
  listBatches: () => request('/auth/batches/'),
  markAttendance: () => request('/auth/attendance/mark/', { method: 'POST' }),
  createBatch: (payload) => request('/auth/batches/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  listUsers: () => request('/auth/users/'),
  setUserRole: (userId, role) => request(`/auth/users/${userId}/set_role/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) }),
  assignUserBatches: (userId, batchIds) => request(`/auth/users/${userId}/assign-batches/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_ids: batchIds }) }),
  setParentChildren: (parentId, childIds) => request(`/auth/users/${parentId}/set-children/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ child_ids: childIds }) }),
  createUser: ({ username, email, password, role }) => request('/auth/register/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, password, role }) }),
}
