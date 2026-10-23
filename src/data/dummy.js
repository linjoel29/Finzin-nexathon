// ALL DUMMY DATA IN ONE FILE.
// Later the backend (MongoDB) replaces this file: screens will fetch the same
// shapes (user, balance, transactions) from the API instead of importing them.

export const USER = { name: "Lin", handle: "lin@finzin" };
export const START_BALANCE = 4250;   // wallet balance in rupees
export const START_SAVINGS = 1820;   // savings pocket in rupees
export const MONTHLY_BUDGET = 8000;  // budget used by the tracker and AI
export const TODAY = "2026-10-22";   // fixed "today" so the demo forecast never changes

// The 5 spending categories: label for display + one flat color for charts
export const CATEGORIES = {
  food: { label: "Food", color: "#22C7D6" },
  travel: { label: "Travel", color: "#16845B" },
  recharge: { label: "Recharge", color: "#E59B1D" },
  shopping: { label: "Shopping", color: "#D64550" },
  others: { label: "Others", color: "#8AA4AA" },
};

// type: "debit" = money out, "credit" = money in. amount is in rupees.
// date format: YYYY-MM-DD. Newest first.
export const TRANSACTIONS = [
  { id: 1, title: "College canteen", category: "food", amount: 65, date: "2026-10-22", type: "debit" },
  { id: 2, title: "Metro card recharge", category: "travel", amount: 200, date: "2026-10-22", type: "debit" },
  { id: 3, title: "Amazon notebooks", category: "shopping", amount: 340, date: "2026-10-21", type: "debit" },
  { id: 4, title: "Data pack", category: "recharge", amount: 61, date: "2026-10-20", type: "debit" },
  { id: 5, title: "Pocket money from home", category: "others", amount: 2500, date: "2026-10-19", type: "credit" },
  { id: 6, title: "Pizza with friends", category: "food", amount: 280, date: "2026-10-18", type: "debit" },
  { id: 7, title: "Hostel laundry", category: "others", amount: 50, date: "2026-10-17", type: "debit" },
  { id: 8, title: "Music subscription", category: "others", amount: 59, date: "2026-10-16", type: "debit" },
  { id: 9, title: "Xerox centre", category: "shopping", amount: 45, date: "2026-10-15", type: "debit" },
  { id: 10, title: "Snack point", category: "food", amount: 70, date: "2026-10-14", type: "debit" },
  { id: 11, title: "Cab to exam hall", category: "travel", amount: 120, date: "2026-10-13", type: "debit" },
  { id: 12, title: "Split from Rahul", category: "others", amount: 350, date: "2026-10-12", type: "credit" },
  { id: 13, title: "Burger combo", category: "food", amount: 199, date: "2026-10-10", type: "debit" },
  { id: 14, title: "Mess extra meals", category: "food", amount: 1800, date: "2026-10-08", type: "debit" },
  { id: 15, title: "WiFi share", category: "recharge", amount: 150, date: "2026-10-05", type: "debit" },
  { id: 16, title: "Bus pass", category: "travel", amount: 450, date: "2026-10-03", type: "debit" },
  { id: 17, title: "Library fine", category: "others", amount: 30, date: "2026-10-02", type: "debit" },
  // September (so the month switcher in the tracker has something to show)
  { id: 18, title: "Books and stationery", category: "shopping", amount: 900, date: "2026-09-14", type: "debit" },
  { id: 19, title: "Mobile recharge", category: "recharge", amount: 239, date: "2026-09-10", type: "debit" },
  { id: 20, title: "Mess fee", category: "food", amount: 3000, date: "2026-09-05", type: "debit" },
  { id: 21, title: "Bus pass", category: "travel", amount: 450, date: "2026-09-04", type: "debit" },
  { id: 22, title: "Pocket money from home", category: "others", amount: 5000, date: "2026-09-01", type: "credit" },
  { id: 23, title: "Movie and snacks", category: "others", amount: 400, date: "2026-09-20", type: "debit" },
];
