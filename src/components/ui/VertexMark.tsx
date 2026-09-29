// The "vertex" in Vertex Mail: three nodes meeting at a point — a single
// connection mark, not a decorative motif repeated through the UI.
export function VertexMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#2952E3" />
      <path d="M9 20L16 11L23 20" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="11" r="2" fill="#17B897" />
    </svg>
  );
}
