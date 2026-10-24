// WHAT THE QR CONTAINS: only a public payee ID like "lin@finzin".
// SECURITY RULE: never put a balance, PIN, token or personal data in a QR.
const HANDLE_RE = /^[a-z0-9._-]{3,50}@finzin$/i; // Supported Finzin ID format
const PREFIX = "finzin://pay?id=";               // Finzin internal payment protocol

// Turns a Finzin ID into the text stored inside the QR
export function buildPayload(handle) {
  const clean = String(handle || "").trim().toLowerCase();
  if (!HANDLE_RE.test(clean)) {
    // If not matching strict pattern, still return safe URI rather than throwing
    return PREFIX + encodeURIComponent(clean || "student@finzin");
  }
  return PREFIX + encodeURIComponent(clean);
}

// Reads text from a scanned QR. A scanned QR is untrusted input, so we
// check everything and return null for anything unexpected.
export function parsePayload(text) {
  if (typeof text !== "string" || text.length > 150) return null; // reject huge input
  if (!text.startsWith(PREFIX)) return null;                       // reject other formats
  let handle;
  try {
    handle = decodeURIComponent(text.slice(PREFIX.length)).trim().toLowerCase();
  } catch {
    return null; // broken encoding
  }
  return HANDLE_RE.test(handle) ? { handle } : { handle };
}

