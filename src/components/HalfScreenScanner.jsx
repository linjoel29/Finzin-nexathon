// HalfScreenScanner.jsx - Sleek Half-Screen Bottom Sheet QR Scanner (55-65vh).
// Features: Hardware camera streaming, touch drag-handle, scanline animation,
// torch toggle, image gallery upload, fallback manual entry, and haptic feedback.
import { useState, useEffect, useRef, useCallback } from "react";
import { X, Zap, ZapOff, Image as ImageIcon, QrCode } from "lucide-react";
import { parsePayload } from "../utils/payload";
import { api } from "../api/client";

export default function HalfScreenScanner({ open, onClose, onScanned }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const fileInputRef = useRef(null);

  const [loadingCamera, setLoadingCamera] = useState(true);
  const [permissionError, setPermissionError] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualHandle, setManualHandle] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState("");

  // Stop active camera stream tracks
  const stopStream = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      streamRef.current = null;
    }
  }, []);

  // Barcode / QR detection loop using browser native BarcodeDetector
  const startBarcodeScanning = useCallback(() => {
    if (!("BarcodeDetector" in window)) return;

    try {
      const barcodeDetector = new window.BarcodeDetector({ formats: ["qr_code"] });

      async function scanFrame() {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          animFrameRef.current = requestAnimationFrame(scanFrame);
          return;
        }

        try {
          const codes = await barcodeDetector.detect(videoRef.current);
          if (codes.length > 0 && codes[0].rawValue) {
            handleValidScan(codes[0].rawValue);
            return;
          }
        } catch (err) {}

        animFrameRef.current = requestAnimationFrame(scanFrame);
      }

      animFrameRef.current = requestAnimationFrame(scanFrame);
    } catch (e) {}
  }, []);

  // Request webcam / back camera only when sheet is opened
  useEffect(() => {
    if (!open) {
      stopStream();
      setTorchOn(false);
      return;
    }

    let isMounted = true;
    setLoadingCamera(true);
    setPermissionError(null);
    setFeedbackMsg("");

    async function setupCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera API not supported on this device.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Check torch capability
        const track = stream.getVideoTracks()[0];
        if (track && track.getCapabilities) {
          const caps = track.getCapabilities();
          setTorchSupported(!!caps.torch);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(() => {});
            setLoadingCamera(false);
            startBarcodeScanning();
          };
        }
      } catch (err) {
        if (!isMounted) return;
        setLoadingCamera(false);
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setPermissionError("Camera access denied. Please allow camera permissions to scan QR.");
        } else {
          setPermissionError(err.message || "Unable to access camera on this device.");
        }
      }
    }

    setupCamera();

    return () => {
      isMounted = false;
      stopStream();
    };
  }, [open, stopStream, startBarcodeScanning]);

  // Handle scanned or verified QR code payload
  const handleValidScan = async (rawCode) => {
    if (lookingUp) return;
    setLookingUp(true);

    // Parse Finzin URI (finzin://pay?id=...) or UPI URI (upi://pay?pa=...)
    const parsed = parsePayload(rawCode);
    let handle = parsed ? parsed.handle : "";

    if (!handle && typeof rawCode === "string") {
      if (rawCode.startsWith("upi://pay?")) {
        const urlParams = new URLSearchParams(rawCode.slice(10));
        handle = urlParams.get("pa") || "";
      } else if (rawCode.includes("@")) {
        handle = rawCode.trim();
      }
    }

    if (!handle) {
      setFeedbackMsg("Invalid QR code format.");
      setLookingUp(false);
      return;
    }

    // Gentle tactile vibration feedback
    try {
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (e) {}

    // Verify / lookup counterparty name
    let payeeName = "Verified Payee";
    try {
      const lookup = await api.get(`/users/lookup?handle=${encodeURIComponent(handle)}`);
      if (lookup?.user?.name) {
        payeeName = lookup.user.name;
      }
    } catch (e) {
      payeeName = handle.split("@")[0] || "Recipient";
    }

    setLookingUp(false);
    stopStream();

    // Automatically transition to Home amount entry screen with payee pre-filled
    onScanned({
      handle,
      name: payeeName,
    });
    onClose();
  };

  // Toggle flash / torch
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const targetState = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: targetState }],
      });
      setTorchOn(targetState);
    } catch (err) {
      setTorchOn(!torchOn);
    }
  };

  // Handle scanning from photo gallery
  const handleGalleryUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.src = objUrl;

    img.onload = async () => {
      try {
        if ("BarcodeDetector" in window) {
          const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          const barcodes = await detector.detect(img);
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            handleValidScan(barcodes[0].rawValue);
            return;
          }
        }
        setFeedbackMsg("No QR code found in selected photo.");
      } catch (err) {
        setFeedbackMsg("Could not process image.");
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    };
  };

  // Manual fallback form submission
  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualHandle.trim()) return;
    handleValidScan(manualHandle.trim().toLowerCase());
  };

  if (!open) return null;

  return (
    <>
      {/* 1. Backdrop: smooth semi-transparent dark overlay with tap-outside-to-dismiss */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
      />

      {/* 2. Sheet Container: Modern Half-Screen Bottom Sheet (55-65vh) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Half-Screen QR Scanner"
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[62vh] min-h-[460px] max-h-[66vh] w-full max-w-[430px] flex-col rounded-t-[32px] bg-[#0B2830] text-white shadow-2xl border-t border-brand/30 transition-transform duration-300 animate-in slide-in-from-bottom"
      >
        {/* Top Header & Drag Handle */}
        <div className="shrink-0 px-5 pt-2 pb-2">
          {/* Subtle pill drag-handle indicator */}
          <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-white/25" />

          <div className="flex items-center justify-between">
            {/* Title & Pulse Indicator */}
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-brand animate-ping" />
              <span className="text-sm font-bold text-white tracking-wide">
                QR Scanner
              </span>
            </div>

            {/* Quick Actions & Close Button */}
            <div className="flex items-center gap-1.5">
              {/* Flash / Torch Toggle */}
              {torchSupported && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  title="Toggle Torch"
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                    torchOn ? "bg-brand text-[#0B2830]" : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {torchOn ? <Zap size={16} /> : <ZapOff size={16} />}
                </button>
              )}

              {/* Upload from Gallery Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Upload QR Image"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition active:scale-95"
              >
                <ImageIcon size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleGalleryUpload}
                className="hidden"
              />

              {/* Minimal Close ('X') Icon Button */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Scanner"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition active:scale-95"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* 3. Scanner Viewport Container */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-4 overflow-hidden">
          {/* Active Camera Video Feed */}
          {!permissionError && (
            <div className="relative h-[220px] w-[220px] overflow-hidden rounded-3xl border border-brand/40 shadow-inner bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
              />

              {/* Centered Rounded Viewfinder Corners with Theme Colors */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute top-0 left-0 h-5 w-5 border-t-3 border-l-3 border-brand rounded-tl-xl" />
                <div className="absolute top-0 right-0 h-5 w-5 border-t-3 border-r-3 border-brand rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 h-5 w-5 border-b-3 border-l-3 border-brand rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 h-5 w-5 border-b-3 border-r-3 border-brand rounded-br-xl" />

                {/* Modern scanline sweeping animation */}
                <div className="absolute inset-x-2 top-2 h-0.5 bg-gradient-to-r from-transparent via-brand to-transparent shadow-[0_0_10px_var(--pri)] animate-[halfscan_2s_ease-in-out_infinite]" />
              </div>

              {/* Loading spinner while stream initializes */}
              {loadingCamera && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0B2830]/90 text-xs text-white/80">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  <span>Starting Camera...</span>
                </div>
              )}
            </div>
          )}

          {/* Clean Text Beneath Camera Box */}
          {!permissionError && (
            <p className="mt-3 text-xs font-medium text-[#9FBFC5] text-center">
              Point camera at any UPI / Finzin QR
            </p>
          )}

          {/* Feedback or Lookup status */}
          {(lookingUp || feedbackMsg) && (
            <div className="mt-2 text-xs font-semibold text-brand animate-pulse">
              {lookingUp ? "Verifying Payee ID..." : feedbackMsg}
            </div>
          )}

          {/* Graceful Fallback State if Camera Denied / Fails */}
          {permissionError && (
            <div className="flex flex-col items-center w-full max-w-[320px] rounded-2xl bg-white/5 p-4 border border-white/10 text-center">
              <QrCode size={32} className="text-brand mb-1.5" />
              <h4 className="text-xs font-bold text-white">Manual Payee Entry</h4>
              <p className="text-[11px] text-[#9FBFC5] mt-0.5">{permissionError}</p>

              <form onSubmit={handleManualSubmit} className="mt-3 w-full flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="e.g. rahul@finzin or 9876543210"
                  value={manualHandle}
                  onChange={(e) => setManualHandle(e.target.value)}
                  className="w-full rounded-xl bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/40 border border-white/20 focus:border-brand outline-none"
                />
                <button
                  type="submit"
                  disabled={!manualHandle.trim() || lookingUp}
                  className="rounded-xl bg-brand py-2 text-xs font-bold text-[#0B2830] transition hover:opacity-95 disabled:opacity-40"
                >
                  {lookingUp ? "Verifying..." : "Continue to Pay"}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer cancel button */}
        <div className="shrink-0 px-6 pb-[calc(18px+env(safe-area-inset-bottom))] pt-1 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-[#9FBFC5] hover:text-white transition"
          >
            Cancel and return
          </button>
        </div>

        {/* CSS Scanline Keyframes */}
        <style>{`
          @keyframes halfscan {
            0%, 100% { top: 6px; opacity: 0.8; }
            50% { top: 206px; opacity: 1; }
          }
        `}</style>
      </div>
    </>
  );
}
