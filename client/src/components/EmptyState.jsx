export default function EmptyState({ text = 'No records yet' }) {
  return <div className="empty">{text}</div>
}
