import Card from "../components/Card";

// Placeholder ideas for later. Nothing here talks to a backend yet.
const IDEAS = [
  { title: "Campus perks", text: "Discounts at canteens, bookstores and campus partners." },
  { title: "Scholarship finder", text: "Find scholarships you qualify for, with deadlines." },
  { title: "Split bills", text: "Share hostel and trip expenses with friends." },
];

export default function StudentCorner() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      <h1 className="py-3 text-xl font-bold">Student corner</h1>
      <div className="flex flex-col gap-3">
        {IDEAS.map((i) => (
          <Card key={i.title}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{i.title}</h2>
              <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-bold text-muted">Coming soon</span>
            </div>
            <p className="mt-1 text-sm text-muted">{i.text}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
