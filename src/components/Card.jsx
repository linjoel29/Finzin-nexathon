// A simple rounded white box used on most screens, so styling lives in one place.
export default function Card({ children, className = "", ...rest }) {
  return (
    <div className={`rounded-2xl border border-line bg-card p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}
