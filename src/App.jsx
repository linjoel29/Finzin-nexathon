import { useState, useCallback, useEffect } from "react";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Tracker from "./pages/Tracker";
import Account from "./pages/Account";
import FinzinAI from "./pages/FinzinAI";
import StudentCorner from "./pages/StudentCorner";
import BottomNav from "./components/BottomNav";
import QRSheet from "./components/QRSheet";
import HalfScreenScanner from "./components/HalfScreenScanner";
import { api } from "./api/client";

import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginScreen from "./components/auth/LoginScreen";
import OtpScreen from "./components/auth/OtpScreen";
import RegisterScreen from "./components/auth/RegisterScreen";
import UnlockScreen from "./components/auth/UnlockScreen";
import ResetPinScreen from "./components/auth/ResetPinScreen";

// AppContent - Inner shell that monitors auth step and renders either
// the active security screen or the authenticated 5-tab banking layout.
function AppContent() {
  const { authStep, isUnlocked, user } = useAuth();
  const [tab, setTab] = useState("Home");                  // which tab is open
  const [qrOpen, setQrOpen] = useState(false);             // is the QR sheet open?
  const [scannerOpen, setScannerOpen] = useState(false);   // is the live QR camera scanner open?
  const [payee, setPayee] = useState(null);                // person chosen by scanning (or null)
  const [trackerOpen, setTrackerOpen] = useState(false);   // expense tracker (opened from Explore)
  const [transactions, setTransactions] = useState([]);    // Unified transaction history state

  // Fetch transaction history on authentication
  useEffect(() => {
    let cancelled = false;
    if (isUnlocked && authStep === "authenticated") {
      api
        .get("/payments/history")
        .then((data) => {
          if (!cancelled && Array.isArray(data)) {
            setTransactions(data);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [isUnlocked, authStep]);

  // Prepend newly created transaction to history list
  const handlePaymentSuccess = useCallback((newTx) => {
    if (newTx) {
      setTransactions((prev) => [newTx, ...prev]);
    }
  }, []);

  // QR sheet closer
  const closeQR = useCallback(() => setQrOpen(false), []);

  // Live camera scanner closer
  const closeScanner = useCallback(() => setScannerOpen(false), []);

  // Quick scanner opener for gestures
  const openScanner = useCallback(() => setScannerOpen(true), []);

  // Tab switcher
  function changeTab(next) {
    setTab(next);
    setTrackerOpen(false);
  }

  // If user is not authenticated or the app is locked with a PIN
  if (!isUnlocked || authStep !== "authenticated") {
    return (
      <div
        className="mx-auto flex h-dvh max-w-[430px] flex-col bg-bg px-4 text-ink
                   pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        {authStep === "login" && <LoginScreen />}
        {authStep === "otp" && <OtpScreen isForgotPin={false} />}
        {authStep === "register" && <RegisterScreen />}
        {authStep === "unlock" && <UnlockScreen />}
        {authStep === "forgot_pin_otp" && <OtpScreen isForgotPin={true} />}
        {authStep === "forgot_pin_new" && <ResetPinScreen />}
      </div>
    );
  }

  // Authenticated Banking Application
  return (
    <div
      className="mx-auto flex h-dvh max-w-[430px] flex-col bg-bg px-4 text-ink
                 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      {/* Home stays mounted (just hidden) on other tabs, so the amount and balance
          are not lost when the user switches tabs */}
      <div className={tab === "Home" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <Home
          onOpenQR={() => setQrOpen(true)}
          onFastScan={openScanner}
          payee={payee}
          onClearPayee={() => setPayee(null)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      </div>

      {tab === "Explore" &&
        (trackerOpen ? (
          <Tracker onBack={() => setTrackerOpen(false)} />
        ) : (
          <Explore
            onOpenTracker={() => setTrackerOpen(true)}
            onOpenAI={() => changeTab("Finzin AI")}
            transactions={transactions}
            setTransactions={setTransactions}
          />
        ))}
      {tab === "Account" && <Account />}
      {tab === "Finzin AI" && <FinzinAI />}
      {tab === "Student corner" && <StudentCorner />}

      {/* 5-Tab sliding bottom navigation with gesture-enabled center circular button */}
      <BottomNav
        active={tab}
        onChange={changeTab}
        onFastScan={openScanner}
      />

      {/* QR Code display sheet */}
      <QRSheet
        open={qrOpen}
        onClose={closeQR}
        user={{
          name: user?.fullName || "Finzin Student",
          handle: user?.upiId || "student@finzin",
        }}
        onScanned={(p) => {
          setPayee(p);
          setTab("Home");
        }}
      />

      {/* Half-Screen QR Camera Scanner bottom sheet triggered by gestures */}
      <HalfScreenScanner
        open={scannerOpen}
        onClose={closeScanner}
        onScanned={(p) => {
          setPayee(p);
          setScannerOpen(false);
          setTab("Home");
        }}
      />
    </div>
  );
}

// Top-level App wraps everything with the AuthProvider context
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
