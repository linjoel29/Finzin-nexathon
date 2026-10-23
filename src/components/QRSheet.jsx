import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { buildPayload, parsePayload } from "../utils/payload";

// Props: open (show or hide), onClose, user ({name, handle}),
// onScanned (called with the payee after a successful scan)
export default function QRSheet({ open, onClose, user, onScanned }) {
  const [tab, setTab] = useState("qr"); // "qr" = My QR, "scan" = Scan
  const [qrImg, setQrImg] = useState(""); // the QR picture as a data URL
  const [msg, setMsg] = useState("");     // small status message
  const closeRef = useRef(null);          // lets us focus the close button on open

  // Make the QR picture. We use an <img> with a data URL instead of injecting
  // raw HTML, which avoids XSS (script injection) risks.
  useEffect(() => {
    let cancelled = false; // ignore late results if the component changed meanwhile
    Promise.resolve()
      .then(() =>
        QRCode.toDataURL(buildPayload(user.handle), {
          width: 480,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#0B2830", light: "#FFFFFF" }, // dark on white scans best
        })
      )
      .then((url) => !cancelled && setQrImg(url))
      .catch(() => !cancelled && setQrImg("")); // show a fallback instead of crashing
    return () => {
      cancelled = true;
    };
  }, [user.handle]);

  // Each time the sheet opens: reset it and move focus to the close button
  useEffect(() => {
    if (!open) return;
    setTab("qr");
    setMsg("");
    closeRef.current?.focus();
  }, [open]);

  // Esc key closes the sheet (only listens while it is open)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Copy the public ID. Clipboard can be blocked, so we handle failure.
  async function copyId() {
    try {
      await navigator.clipboard.writeText(user.handle);
      setMsg("UPI ID copied");
    } catch {
      setMsg("Could not copy. Select the ID and copy it manually");
    }
  }

  return (
    <>
      {/* Dark blurred background. Tapping it closes the sheet. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* The sheet. "inert" stops keyboard focus from reaching it while hidden. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="My QR code and scanner"
        inert={!open}
        className={`fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 rounded-t-[28px] bg-[#0B2830] px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))] text-center text-[#E8FAFB] transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded bg-[#2A5C6A]" />

        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 h-9 w-9 rounded-full bg-[#16414D]"
        >
          ✕
        </button>

        {/* Tabs: My QR | Scan */}
        <div className="mx-auto mb-4 grid max-w-[240px] grid-cols-2 gap-1 rounded-2xl bg-[#16414D] p-1 text-sm font-semibold">
          {[
            ["qr", "My QR"],
            ["scan", "Scan"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setMsg("");
              }}
              className={`rounded-xl py-2 ${
                tab === key ? "bg-brand text-[#123b46]" : "text-[#9FBFC5]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "qr" ? (
          <>
            {/* My QR: white card so the code stays scannable */}
            {qrImg ? (
              <img
                src={qrImg}
                alt="Your Finzin payment QR code"
                className="mx-auto h-[220px] w-[220px] rounded-3xl bg-white p-3"
              />
            ) : (
              <div className="mx-auto grid h-[220px] w-[220px] place-items-center rounded-3xl bg-white text-sm text-[#123b46]">
                QR unavailable
              </div>
            )}
            {/* React escapes these values automatically, so no injection risk */}
            <div className="mt-3 text-base font-semibold">{user.name}</div>
            <div className="text-sm text-[#9FBFC5]">{user.handle}</div>
            <button
              onClick={copyId}
              className="mt-4 rounded-2xl bg-brand px-6 py-3 text-sm font-bold text-[#123b46]"
            >
              Copy UPI ID
            </button>
          </>
        ) : (
          <div className="mx-auto flex flex-col items-center justify-center h-[220px] w-[220px] rounded-3xl border-2 border-dashed border-brand/50 px-4 text-center text-sm text-[#9FBFC5]">
            <span className="text-3xl mb-2">📷</span>
            <span className="font-semibold text-white">Scan UPI QR</span>
            <span className="mt-1 text-xs opacity-70">Hold the Pay button on Home to open instant camera scanner</span>
          </div>
        )}

        <p role="status" className="mt-3 min-h-5 text-xs text-[#9FBFC5]">
          {msg}
        </p>
      </div>
    </>
  );
}
