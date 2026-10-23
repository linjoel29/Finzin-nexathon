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

// Props: "active" = name of the selected tab, "onChange" = function called on tap
export default function BottomNav({ active, onChange }) {
  const activeIdx = TABS.findIndex((t) => t.name === active);

  return (
    // overflow-hidden clips the buttons that slide past the screen edge
    <nav className="relative h-[110px] shrink-0 overflow-hidden border-t border-line">
      {TABS.map((tab, i) => {
        // offset = how far this tab is from the active one (0 means it IS the active tab)
        const offset = i - activeIdx;
        const isActive = offset === 0;

        return (
          <button
            key={tab.name}
            onClick={() => onChange(tab.name)}
            aria-label={tab.name}
            // All buttons start at the center, then slide left/right by offset.
            // The active one has offset 0, so it always sits in the middle and is scaled up.
            style={{
              transform: `translateX(calc(-50% + ${offset * GAP}px)) scale(${isActive ? 1.3 : 1})`,
            }}
            className={`absolute left-1/2 top-[18px] grid h-[52px] w-[52px] place-items-center rounded-full transition-all duration-300 ${
              isActive
                ? "bg-brand text-[#123b46] shadow-[0_0_0_4px_var(--bg),0_0_0_7px_var(--pri)]"
                : "bg-line text-muted"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
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

      {/* Name of the active tab, shown under the big circle */}
      <div className="absolute inset-x-0 bottom-2 text-center text-[11px] font-semibold">
        {active}
      </div>
    </nav>
  );
}
