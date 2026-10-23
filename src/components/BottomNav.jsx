// BottomNav.jsx - 5-tab sliding navigation with gesture-enabled circular action button.
// Features: Single tap to navigate, Double-Tap (<300ms) or Long-Press (~500ms with scale/pulse feedback)
// on the center primary circular button to launch live QR camera scanner directly.
import { useFastScanGesture } from "../utils/useFastScanGesture";

// The 5 tabs. "d" is the icon drawing (SVG path) shown inside each round button.
const TABS = [
  { name: "Account", d: "M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" },
  { name: "Explore", d: "M12 3a9 9 0 100 18 9 9 0 000-18zM15.5 8.5l-2 5-5 2 2-5z" },
  { name: "Home", d: "M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z" },
  { name: "Finzin AI", d: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" },
  { name: "Student corner", d: "M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5" },
];

// Distance (px) between neighbouring buttons
const GAP = 70;

// Props: "active" = name of selected tab, "onChange" = tab changer, "onFastScan" = QR camera scanner launcher
export default function BottomNav({ active, onChange, onFastScan }) {
  const activeIdx = TABS.findIndex((t) => t.name === active);

  // Gesture detection for the primary active circular button
  const { isHolding, bindGesture } = useFastScanGesture({
    onSingleTap: () => {
      // Retain standard behavior: if clicking another tab or re-tapping current
      const activeTab = TABS[activeIdx];
      if (activeTab) onChange(activeTab.name);
    },
    onFastScan,
  });

  return (
    <nav className="relative h-[110px] shrink-0 overflow-hidden border-t border-line">
      {TABS.map((tab, i) => {
        const offset = i - activeIdx;
        const isActive = offset === 0;

        return (
          <button
            key={tab.name}
            aria-label={
              isActive
                ? `${tab.name} (Double-tap or hold for QR scanner)`
                : tab.name
            }
            {...(isActive ? bindGesture : { onClick: () => onChange(tab.name) })}
            style={{
              transform: `translateX(calc(-50% + ${offset * GAP}px)) scale(${
                isActive ? (isHolding ? 1.45 : 1.3) : 1
              })`,
            }}
            className={`absolute left-1/2 top-[18px] grid h-[52px] w-[52px] place-items-center rounded-full transition-all duration-300 select-none ${
              isActive
                ? isHolding
                  ? "bg-brand text-[#123b46] ring-4 ring-brand/60 animate-pulse shadow-[0_0_16px_var(--pri)]"
                  : "bg-brand text-[#123b46] shadow-[0_0_0_4px_var(--bg),0_0_0_7px_var(--pri)]"
                : "bg-line text-muted hover:text-ink active:scale-95"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 pointer-events-none"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={tab.d} />
            </svg>
          </button>
        );
      })}

      {/* Name of the active tab + quick scan hint */}
      <div className="absolute inset-x-0 bottom-2 text-center text-[11px] font-semibold text-ink flex flex-col items-center">
        <span>{active}</span>
        {active === "Home" && (
          <span className="text-[9px] text-muted font-normal -mt-0.5">
            Double-tap or hold for QR Scanner
          </span>
        )}
      </div>
    </nav>
  );
}
