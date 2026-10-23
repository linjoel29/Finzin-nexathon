import { useState, useCallback } from "react";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Tracker from "./pages/Tracker";
import Account from "./pages/Account";
import FinzinAI from "./pages/FinzinAI";
import StudentCorner from "./pages/StudentCorner";
import BottomNav from "./components/BottomNav";
import QRSheet from "./components/QRSheet";
import { USER } from "./data/dummy";

// App = the phone-sized shell. It remembers which tab is open and shows
// that screen above the bottom navigation.
export default function App() {
  const [tab, setTab] = useState("Home");              // which tab is open
  const [qrOpen, setQrOpen] = useState(false);         // is the QR sheet open?
  const [payee, setPayee] = useState(null);            // person chosen by scanning (or null)
  const [trackerOpen, setTrackerOpen] = useState(false); // expense tracker (opened from Explore)

  // useCallback keeps the same function between renders, so QRSheet's
  // Esc-key listener is not recreated on every render
  const closeQR = useCallback(() => setQrOpen(false), []);

  // Switching tabs also closes the tracker so Explore starts fresh
  function changeTab(next) {
    setTab(next);
    setTrackerOpen(false);
  }

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
          payee={payee}
          onClearPayee={() => setPayee(null)}
        />
      </div>

      {tab === "Explore" &&
        (trackerOpen ? (
          <Tracker onBack={() => setTrackerOpen(false)} />
        ) : (
          <Explore
            onOpenTracker={() => setTrackerOpen(true)}
            onOpenAI={() => changeTab("Finzin AI")}
          />
        ))}
      {tab === "Account" && <Account />}
      {tab === "Finzin AI" && <FinzinAI />}
      {tab === "Student corner" && <StudentCorner />}

      <BottomNav active={tab} onChange={changeTab} />
      <QRSheet open={qrOpen} onClose={closeQR} user={USER} onScanned={setPayee} />
    </div>
  );
}
