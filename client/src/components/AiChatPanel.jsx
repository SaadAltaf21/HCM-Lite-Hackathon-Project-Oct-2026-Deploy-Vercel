import { useState } from 'react'
import { api, errMsg } from '../api.js'

export default function AiChatPanel() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const send = async (e) => {
    e.preventDefault()
    if (!input.trim()) return
    const msg = input.trim()
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: msg }])
    setLoading(true); setError('')
    try {
      const { data } = await api.post('/ai/chat', { message: msg })
      setMessages((m) => [...m, { role: 'ai', text: data.answer, toolsUsed: data.toolsUsed, aiGenerated: data.aiGenerated }])
    } catch (err) {
      setError(errMsg(err, 'AI assistant is unavailable right now. Please try again later, or check the dashboards and reports directly.'))
      setMessages((m) => [...m, { role: 'ai', text: 'Sorry — the AI assistant is unavailable right now. Please try again later.', fallback: true }])
    } finally { setLoading(false) }
  }

  return (
    <div className="card chat-panel">
      <h2>AI Assistant</h2>
      <p className="muted">Ask about real data in this system — attendance, leave, payroll and headcount. Answers are generated from your records, not dummy data.</p>
      <div className="chat-log">
        {messages.length === 0 && <div className="empty">No messages yet. Try: “How many employees are present today?”</div>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div>{m.text}</div>
            {m.role === 'ai' && !m.fallback && <div className="ai-tag">AI-generated {m.toolsUsed?.length ? `· Tools: ${m.toolsUsed.join(', ')}` : ''}</div>}
            {m.fallback && <div className="ai-tag">Fallback message — AI unavailable</div>}
          </div>
        ))}
        {loading && <div className="muted">Thinking…</div>}
      </div>
      {error && <div className="error">{error}</div>}
      <form onSubmit={send} className="row">
        <input className="grow" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question about your HR data…" />
        <button className="btn primary" disabled={loading}>Send</button>
      </form>
    </div>
  )
}
