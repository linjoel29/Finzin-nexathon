// WHAT THE QR CONTAINS: only a public payee ID like "lin@finzin".
// SECURITY RULE: never put a balance, PIN, token or personal data in a QR.
const HANDLE_RE = /^[a-z0-9]{3,30}@finzin$/; // the only ID format we accept
const PREFIX = "finzin://pay?id=";            // our own format, so GPay/PhonePe won't try to open it

// Turns a Finzin ID into the text stored inside the QR
export function buildPayload(handle) {
  if (!HANDLE_RE.test(handle)) throw new Error("Invalid Finzin ID");
  return PREFIX + encodeURIComponent(handle);
}

// Reads text from a scanned QR. A scanned QR is untrusted input, so we
// check everything and return null for anything unexpected.
export function parsePayload(text) {
  if (typeof text !== "string" || text.length > 100) return null; // reject huge input
  if (!text.startsWith(PREFIX)) return null;                       // reject other formats
  let handle;
  try {
    handle = decodeURIComponent(text.slice(PREFIX.length));
  } catch {
    return null; // broken encoding
  }
  return HANDLE_RE.test(handle) ? { handle } : null;
}
