export default function StatCard({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
    </div>
  )
}
