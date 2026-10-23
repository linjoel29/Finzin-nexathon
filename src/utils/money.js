// Small display helpers used by many screens.

// 4250 -> "₹4,250" (Indian digit grouping, up to 2 decimals)
export const formatINR = (n) =>
  "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

// "2026-10-22" -> "22 Oct". We build the Date from its parts (not from the
// string) so the day never shifts because of the user's time zone.
export function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// "2026-10" -> "October 2026"
export function monthName(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
