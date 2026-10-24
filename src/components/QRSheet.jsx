// QRSheet.jsx - Personal Payment QR Code modal (PhonePe / Google Pay / Paytm style).
// Displays the authenticated student's verified Finzin Payment ID, scannable QR code,
// one-tap Copy ID, high-resolution Download QR card, and native Share.
import { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import { X, Download, Share2, Copy, Check, ShieldCheck, QrCode } from "lucide-react";
import { buildPayload } from "../utils/payload";
import { api } from "../api/client";

export default function QRSheet({ open, onClose, user }) {
  const [profile, setProfile] = useState({
    name: user?.name || user?.fullName || "Finzin Student",
    handle: user?.handle || user?.upiId || "student@finzin",
  });
  const [qrImg, setQrImg] = useState("");
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);
  const closeRef = useRef(null);

  // Helper to show transient status message
  const showToast = useCallback((text) => {
    setToast(text);
    setTimeout(() => {
      setToast((prev) => (prev === text ? "" : prev));
    }, 3000);
  }, []);

  // Sync profile from props and refresh from /api/me when modal opens
  useEffect(() => {
    if (!open) return;
    const initialName = user?.name || user?.fullName;
    const initialHandle = user?.handle || user?.upiId;

    if (initialName || initialHandle) {
      setProfile({
        name: initialName || "Finzin Student",
        handle: initialHandle || "student@finzin",
      });
    }

    // Opportunistically fetch /api/me to guarantee accurate backend identifier
    api
      .get("/me")
      .then((data) => {
        if (data?.user) {
          setProfile({
            name: data.user.name || initialName || "Finzin Student",
            handle: data.user.handle || initialHandle || "student@finzin",
          });
        }
      })
      .catch(() => {});
  }, [open, user?.name, user?.fullName, user?.handle, user?.upiId]);

  // Generate high-contrast, scannable QR code whenever handle changes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const activeHandle = profile.handle || "student@finzin";
    let payload = "";
    try {
      payload = buildPayload(activeHandle);
    } catch {
      payload = `finzin://pay?id=${encodeURIComponent(activeHandle)}`;
    }

    QRCode.toDataURL(payload, {
      width: 512,
      margin: 2, // 2-module clear quiet zone for flawless scanning
      errorCorrectionLevel: "M",
      color: {
        dark: "#0B2830", // Finzin signature deep teal
        light: "#FFFFFF",
      },
    })
      .then((url) => {
        if (!cancelled) setQrImg(url);
      })
      .catch(() => {
        if (!cancelled) setQrImg("");
      });

    return () => {
      cancelled = true;
    };
  }, [open, profile.handle]);

  // Focus close button on open
  useEffect(() => {
    if (open) {
      setCopied(false);
      setToast("");
      setTimeout(() => closeRef.current?.focus(), 50);
    }
  }, [open]);

  // Close modal on Escape key press
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Copy payment ID to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(profile.handle);
      setCopied(true);
      showToast("Finzin ID copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Could not copy automatically. Select and copy manually.");
    }
  };

  // Download high-resolution branded Payment QR card PNG
  const handleDownload = () => {
    if (!qrImg) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 800;
      const ctx = canvas.getContext("2d");

      // White card background
      ctx.fillStyle = "#FFFFFF";
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(0, 0, 640, 800, 32);
        ctx.fill();
      } else {
        ctx.fillRect(0, 0, 640, 800);
      }

      // Top banner
      ctx.fillStyle = "#0B2830";
      ctx.fillRect(0, 0, 640, 120);

      // App Title
      ctx.fillStyle = "#22C7D6";
      ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Finzin Banking", 320, 56);

      // Subtitle
      ctx.fillStyle = "#E8FAFB";
      ctx.font = "16px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("Instant Student Payment QR", 320, 92);

      // Payee Details
      ctx.fillStyle = "#0B2830";
      ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(profile.name, 320, 180);

      ctx.fillStyle = "#16845B";
      ctx.font = "bold 22px monospace";
      ctx.fillText(profile.handle, 320, 218);

      // Render QR Code image
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 110, 240, 420, 420);

        // Security / Verification Badge
        ctx.fillStyle = "#4B5563";
        ctx.font = "16px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText("Scan with Finzin app to transfer instantly", 320, 700);

        ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillStyle = "#9CA3AF";
        ctx.fillText("Finzin Verified Payment Identifier", 320, 730);

        const a = document.createElement("a");
        a.download = `finzin-qr-${profile.handle.replace(/[^a-z0-9]/gi, "_")}.png`;
        a.href = canvas.toDataURL("image/png");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast("Payment QR Card downloaded!");
      };
      img.src = qrImg;
    } catch {
      // Fallback: download direct high-res QR image
      const a = document.createElement("a");
      a.download = `finzin-qr-${profile.handle.replace(/[^a-z0-9]/gi, "_")}.png`;
      a.href = qrImg;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("QR image downloaded!");
    }
  };

  // Share QR or Payment ID via Web Share API or clipboard
  const handleShare = async () => {
    if (!qrImg) return;
    const shareText = `Pay ${profile.name} on Finzin using ID: ${profile.handle}`;

    if (navigator.share) {
      try {
        let sharedWithFile = false;
        if (navigator.canShare) {
          try {
            const res = await fetch(qrImg);
            const blob = await res.blob();
            const file = new File([blob], `finzin-payment-qr.png`, { type: "image/png" });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                title: `${profile.name}'s Finzin Payment QR`,
                text: shareText,
                files: [file],
              });
              sharedWithFile = true;
            }
          } catch {}
        }

        if (!sharedWithFile) {
          await navigator.share({
            title: `${profile.name}'s Finzin Payment QR`,
            text: shareText,
          });
        }
        showToast("Shared successfully!");
        return;
      } catch (err) {
        if (err.name === "AbortError") return; // User closed native share sheet
      }
    }

    // Fallback: Copy payment details to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      showToast("Payment details copied to clipboard!");
    } catch {
      showToast("Sharing not supported on this browser.");
    }
  };

  const avatarLetter = profile.name?.[0]?.toUpperCase() || "S";

  return (
    <>
      {/* Dark blurred background backdrop - tapping closes modal */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-black/70 backdrop-blur-md transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Modal dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="My Finzin Payment QR Code"
        inert={!open}
        className={`fixed bottom-0 sm:bottom-auto sm:top-1/2 left-1/2 -translate-x-1/2 sm:-translate-y-1/2 z-50 w-full max-w-[420px] rounded-t-[32px] sm:rounded-[32px] bg-[#0B2830] border border-[#16414D] p-5 text-[#E8FAFB] shadow-2xl transition-all duration-300 ${
          open
            ? "translate-y-0 opacity-100"
            : "translate-y-full sm:translate-y-8 opacity-0 pointer-events-none"
        }`}
      >
        {/* Mobile touch indicator */}
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[#16414D] sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-brand/10 text-brand">
              <QrCode size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Receive Money</h3>
              <p className="text-[11px] text-[#9FBFC5]">Personal Payment QR Code</p>
            </div>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full bg-[#16414D] text-[#9FBFC5] hover:bg-[#205260] hover:text-white transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* UPI-Style Crisp White Payment Card */}
        <div className="mt-3 rounded-2xl bg-white p-5 text-center shadow-lg border border-slate-100">
          {/* User avatar & name */}
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#0B2830] text-lg font-bold text-brand shadow-sm">
            {avatarLetter}
          </div>
          <div className="mt-2 text-base font-bold text-[#0B2830]">{profile.name}</div>

          {/* Payment ID pill with copy trigger */}
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#16845B]/10 px-3 py-1 text-xs font-semibold text-[#16845B]">
            <span>{profile.handle}</span>
            <button
              type="button"
              onClick={handleCopy}
              title="Copy Finzin ID"
              aria-label="Copy Finzin ID"
              className="cursor-pointer hover:opacity-80 active:scale-90 transition p-0.5"
            >
              {copied ? <Check size={13} className="text-[#16845B]" /> : <Copy size={13} />}
            </button>
          </div>

          {/* Scannable QR Code */}
          <div className="my-3 flex justify-center">
            {qrImg ? (
              <img
                src={qrImg}
                alt={`Finzin Payment QR Code for ${profile.name}`}
                className="h-[210px] w-[210px] object-contain rounded-xl select-none"
              />
            ) : (
              <div className="grid h-[210px] w-[210px] place-items-center rounded-xl bg-slate-100 text-xs text-slate-500">
                Generating payment QR...
              </div>
            )}
          </div>

          {/* Verification Badge */}
          <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500">
            <ShieldCheck size={14} className="text-[#16845B]" />
            <span>Finzin Verified Payment ID</span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Scan using Finzin app to transfer funds instantly
          </p>
        </div>

        {/* Action Buttons: Copy ID, Download QR, Share QR */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="cursor-pointer flex items-center justify-center gap-1.5 rounded-xl border border-[#16414D] bg-[#123b46] py-2.5 text-xs font-semibold text-white transition hover:bg-[#164856] active:scale-95"
          >
            {copied ? <Check size={14} className="text-brand" /> : <Copy size={14} />}
            <span>{copied ? "Copied" : "Copy ID"}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="cursor-pointer flex items-center justify-center gap-1.5 rounded-xl border border-[#16414D] bg-[#123b46] py-2.5 text-xs font-semibold text-white transition hover:bg-[#164856] active:scale-95"
          >
            <Download size={14} />
            <span>Download</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="cursor-pointer flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-xs font-bold text-[#0B2830] transition hover:brightness-105 active:scale-95"
          >
            <Share2 size={14} />
            <span>Share</span>
          </button>
        </div>

        {/* Transient notification toast */}
        {toast && (
          <div className="mt-3 rounded-xl bg-brand/20 border border-brand/40 px-3 py-1.5 text-center text-xs font-medium text-brand animate-fade-in">
            {toast}
          </div>
        )}
      </div>
    </>
  );
}
