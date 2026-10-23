// StudentCorner.jsx - Student Corner with Internships, Scholarships, and Student Offers.
// Features genuine verified opportunities, personalized eligibility calculator, search, filters, and bookmarks.
import { useState, useEffect, useMemo } from "react";
import {
  Briefcase,
  Award,
  Tag,
  Search,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  MapPin,
  Calendar,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Copy,
  Check,
  X,
  Filter,
} from "lucide-react";
import Card from "../components/Card";
import { api } from "../api/client";

export default function StudentCorner() {
  const [activeTab, setActiveTab] = useState("internships"); // 'internships' | 'scholarships' | 'offers'
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  // Data states
  const [internships, setInternships] = useState([]);
  const [scholarships, setScholarships] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [workModeFilter, setWorkModeFilter] = useState("all");
  const [internCategoryFilter, setInternCategoryFilter] = useState("all");
  const [scholarshipCategoryFilter, setScholarshipCategoryFilter] = useState("all");
  const [offerCategoryFilter, setOfferCategoryFilter] = useState("all");

  // Local/synced bookmark set
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
  const [copiedCode, setCopiedCode] = useState(null);

  // Personalized Eligibility Modal State
  const [eligibilityModalOpen, setEligibilityModalOpen] = useState(false);
  const [selectedScholarship, setSelectedScholarship] = useState(null);
  const [studentForm, setStudentForm] = useState({
    course: "B.Tech",
    studyYear: "1",
    state: "Karnataka",
    annualFamilyIncome: "300000",
    academicScore: "78",
    gender: "female",
  });
  const [eligibilityResult, setEligibilityResult] = useState(null);
  const [evaluatingEligibility, setEvaluatingEligibility] = useState(false);

  // Load data on tab change or mount
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        if (activeTab === "internships") {
          const res = await api.get("/student-corner/internships");
          if (!cancelled && res?.items) {
            setInternships(res.items);
            // Hydrate bookmark state
            const b = new Set(res.items.filter((i) => i.isBookmarked).map((i) => i.id));
            setBookmarkedIds((prev) => new Set([...prev, ...b]));
          }
        } else if (activeTab === "scholarships") {
          const res = await api.get("/student-corner/scholarships");
          if (!cancelled && res?.items) {
            setScholarships(res.items);
            const b = new Set(res.items.filter((i) => i.isBookmarked).map((i) => i.id));
            setBookmarkedIds((prev) => new Set([...prev, ...b]));
          }
        } else if (activeTab === "offers") {
          const res = await api.get("/student-corner/offers");
          if (!cancelled && res?.items) {
            setOffers(res.items);
            const b = new Set(res.items.filter((i) => i.isBookmarked).map((i) => i.id));
            setBookmarkedIds((prev) => new Set([...prev, ...b]));
          }
        }
      } catch (err) {
        if (!cancelled) setError("Unable to load verified opportunities. Please check your connection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Toggle bookmark handler
  const handleToggleBookmark = async (itemType, itemId) => {
    const isCurrentlyBookmarked = bookmarkedIds.has(itemId);
    // Optimistic UI update
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlyBookmarked) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

    try {
      await api.post("/student-corner/bookmarks/toggle", {
        itemType,
        itemId,
      });
    } catch (e) {
      // Revert if API failed or user is not logged in
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyBookmarked) next.add(itemId);
        else next.delete(itemId);
        return next;
      });
    }
  };

  // Copy promo code helper
  const handleCopyCode = (code) => {
    if (!code) return;
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Evaluate personalized eligibility
  const handleCheckEligibility = async (scholarship) => {
    setSelectedScholarship(scholarship);
    setEligibilityModalOpen(true);
    setEvaluatingEligibility(true);
    setEligibilityResult(null);

    try {
      const res = await api.post("/student-corner/scholarships/eligibility", {
        scholarshipId: scholarship.id,
        course: studentForm.course,
        studyYear: Number(studentForm.studyYear),
        state: studentForm.state,
        annualFamilyIncome: Number(studentForm.annualFamilyIncome),
        academicScore: Number(studentForm.academicScore),
        gender: studentForm.gender,
      });
      setEligibilityResult(res);
    } catch (err) {
      setEligibilityResult({
        status: "Check requirements",
        reasons: ["Unable to evaluate at this time. Please verify directly on official portal."],
        missingDetails: [],
        disclaimer: "Educational estimate only. Never guarantees an award.",
      });
    } finally {
      setEvaluatingEligibility(false);
    }
  };

  // Filtered views
  const filteredInternships = useMemo(() => {
    return internships.filter((item) => {
      if (showBookmarksOnly && !bookmarkedIds.has(item.id)) return false;
      if (workModeFilter !== "all" && item.workMode !== workModeFilter) return false;
      if (internCategoryFilter !== "all" && item.category !== internCategoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.title.toLowerCase().includes(q) ||
          item.company.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q) ||
          item.skills.some((s) => s.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [internships, showBookmarksOnly, bookmarkedIds, workModeFilter, internCategoryFilter, searchQuery]);

  const filteredScholarships = useMemo(() => {
    return scholarships.filter((item) => {
      if (showBookmarksOnly && !bookmarkedIds.has(item.id)) return false;
      if (scholarshipCategoryFilter !== "all" && item.courseCategory !== scholarshipCategoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.name.toLowerCase().includes(q) ||
          item.provider.toLowerCase().includes(q) ||
          item.eligibleCourses.some((c) => c.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [scholarships, showBookmarksOnly, bookmarkedIds, scholarshipCategoryFilter, searchQuery]);

  const filteredOffers = useMemo(() => {
    return offers.filter((item) => {
      if (showBookmarksOnly && !bookmarkedIds.has(item.id)) return false;
      if (offerCategoryFilter !== "all" && item.category !== offerCategoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.title.toLowerCase().includes(q) ||
          item.provider.toLowerCase().includes(q) ||
          item.discount.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [offers, showBookmarksOnly, bookmarkedIds, offerCategoryFilter, searchQuery]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-20">
      {/* Top Header */}
      <div className="flex items-center justify-between py-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Student Corner</h1>
          <p className="text-xs text-muted">Verified internships, scholarships & student perks</p>
        </div>
        <button
          onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            showBookmarksOnly
              ? "bg-brand text-ink"
              : "border border-line bg-card text-muted hover:text-ink"
          }`}
          title="Filter saved bookmarks"
        >
          {showBookmarksOnly ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
          <span>Saved</span>
        </button>
      </div>

      {/* Primary Section Tabs: Internships, Scholarships, Student Offers */}
      <div className="flex rounded-xl bg-card border border-line p-1">
        <button
          onClick={() => {
            setActiveTab("internships");
            setSearchQuery("");
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
            activeTab === "internships"
              ? "bg-btn text-btntx shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          <Briefcase className="h-3.5 w-3.5" />
          <span>Internships</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("scholarships");
            setSearchQuery("");
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
            activeTab === "scholarships"
              ? "bg-btn text-btntx shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          <Award className="h-3.5 w-3.5" />
          <span>Scholarships</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("offers");
            setSearchQuery("");
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
            activeTab === "offers"
              ? "bg-btn text-btntx shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          <Tag className="h-3.5 w-3.5" />
          <span>Student Offers</span>
        </button>
      </div>

      {/* Search Input Bar */}
      <div className="mt-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            activeTab === "internships"
              ? "Search by role, company, or skill..."
              : activeTab === "scholarships"
              ? "Search by scholarship name or provider..."
              : "Search brands and discounts..."
          }
          className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-8 text-xs text-ink placeholder:text-muted focus:border-brand focus:outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filter Chips Bar */}
      <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
        {activeTab === "internships" && (
          <>
            <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
              <Filter className="h-3 w-3" /> Mode:
            </span>
            {["all", "remote", "hybrid", "onsite"].map((mode) => (
              <button
                key={mode}
                onClick={() => setWorkModeFilter(mode)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  workModeFilter === mode
                    ? "bg-btn text-btntx"
                    : "border border-line bg-card text-muted hover:text-ink"
                }`}
              >
                {mode === "all" ? "All Modes" : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
            <span className="text-[11px] font-semibold text-muted ml-2">Type:</span>
            {[
              { id: "all", label: "All" },
              { id: "software", label: "Software" },
              { id: "data", label: "Data" },
              { id: "research", label: "Research" },
              { id: "finance", label: "Finance" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setInternCategoryFilter(cat.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  internCategoryFilter === cat.id
                    ? "bg-btn text-btntx"
                    : "border border-line bg-card text-muted hover:text-ink"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </>
        )}

        {activeTab === "scholarships" && (
          <>
            <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
              <Filter className="h-3 w-3" /> Stream:
            </span>
            {[
              { id: "all", label: "All Streams" },
              { id: "engineering", label: "Engineering" },
              { id: "general", label: "General Degree" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setScholarshipCategoryFilter(cat.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  scholarshipCategoryFilter === cat.id
                    ? "bg-btn text-btntx"
                    : "border border-line bg-card text-muted hover:text-ink"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </>
        )}

        {activeTab === "offers" && (
          <>
            <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
              <Filter className="h-3 w-3" /> Category:
            </span>
            {[
              { id: "all", label: "All Offers" },
              { id: "software", label: "Software & Dev" },
              { id: "entertainment", label: "OTT & Music" },
              { id: "hardware", label: "Tech" },
              { id: "travel", label: "Travel" },
              { id: "food", label: "Dining" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setOfferCategoryFilter(cat.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  offerCategoryFilter === cat.id
                    ? "bg-btn text-btntx"
                    : "border border-line bg-card text-muted hover:text-ink"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="mt-8 flex flex-col items-center justify-center gap-2 py-8 text-muted">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-xs">Loading verified student opportunities...</p>
        </div>
      )}

      {error && !loading && (
        <div className="mt-4 rounded-xl border border-err/30 bg-card p-4 text-center">
          <p className="text-xs text-err">{error}</p>
          <button
            onClick={() => setActiveTab(activeTab)}
            className="mt-2 rounded-lg bg-btn px-3 py-1 text-xs font-semibold text-btntx"
          >
            Retry
          </button>
        </div>
      )}

      {/* TAB 1: INTERNSHIPS LIST */}
      {activeTab === "internships" && !loading && !error && (
        <div className="mt-3 flex flex-col gap-3">
          {filteredInternships.length === 0 ? (
            <Card>
              <div className="py-6 text-center">
                <Briefcase className="mx-auto h-8 w-8 text-muted/60" />
                <h3 className="mt-2 text-sm font-bold text-ink">No internships found</h3>
                <p className="mt-1 text-xs text-muted">
                  {showBookmarksOnly
                    ? "You haven't bookmarked any internships yet."
                    : "Try adjusting your search query or filter chips."}
                </p>
                {(searchQuery || workModeFilter !== "all" || showBookmarksOnly) && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setWorkModeFilter("all");
                      setShowBookmarksOnly(false);
                    }}
                    className="mt-3 rounded-full bg-line px-3 py-1 text-xs font-bold text-ink"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </Card>
          ) : (
            filteredInternships.map((item) => {
              const isBookmarked = bookmarkedIds.has(item.id);
              return (
                <Card key={item.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <span className="inline-block rounded-md bg-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">
                        {item.category}
                      </span>
                      <h2 className="mt-1 text-sm font-bold text-ink leading-snug">{item.title}</h2>
                      <p className="text-xs font-semibold text-muted">{item.company}</p>
                    </div>
                    <button
                      onClick={() => handleToggleBookmark("internship", item.id)}
                      className={`p-1.5 rounded-full transition ${
                        isBookmarked
                          ? "text-brand bg-brand/10"
                          : "text-muted hover:text-ink hover:bg-line/40"
                      }`}
                      aria-label={isBookmarked ? "Remove bookmark" : "Save bookmark"}
                    >
                      {isBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Badges: Stipend, Work Mode, Location */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-md bg-ok/10 px-2 py-0.5 font-bold text-ok">
                      {item.stipend}
                    </span>
                    <span className="flex items-center gap-1 rounded-md bg-line/60 px-2 py-0.5 text-ink">
                      <MapPin className="h-3 w-3 text-muted" />
                      {item.workMode === "remote" ? "Remote" : item.location}
                    </span>
                    <span className="flex items-center gap-1 rounded-md bg-line/60 px-2 py-0.5 text-muted">
                      <Calendar className="h-3 w-3" />
                      Deadline: {item.deadline}
                    </span>
                  </div>

                  {/* Skills required */}
                  {item.skills && item.skills.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {item.skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-line bg-card px-2 py-0.5 text-[10px] font-medium text-muted"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Eligibility requirement snippet */}
                  <p className="mt-2 text-[11px] text-muted line-clamp-2">
                    <span className="font-semibold text-ink">Eligibility:</span> {item.educationRequirements}
                  </p>

                  {/* Verification source & Apply button */}
                  <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-[11px]">
                    <div className="flex items-center gap-1 text-muted">
                      <CheckCircle2 className="h-3 w-3 text-ok" />
                      <span>{item.source}</span>
                    </div>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg bg-btn px-3 py-1.5 text-xs font-bold text-btntx transition hover:opacity-95"
                    >
                      <span>Apply</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: SCHOLARSHIPS LIST */}
      {activeTab === "scholarships" && !loading && !error && (
        <div className="mt-3 flex flex-col gap-3">
          {/* Eligibility Banner Trigger */}
          <div className="flex items-center justify-between rounded-xl border border-line bg-card p-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-brand/20 p-2 text-ink">
                <Award className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-ink">Personalized Eligibility Finder</h4>
                <p className="text-[11px] text-muted">Check your qualification without sharing private data</p>
              </div>
            </div>
            <button
              onClick={() => {
                if (scholarships.length > 0) handleCheckEligibility(scholarships[0]);
              }}
              className="rounded-lg bg-btn px-2.5 py-1.5 text-[11px] font-bold text-btntx shrink-0"
            >
              Evaluate
            </button>
          </div>

          {filteredScholarships.length === 0 ? (
            <Card>
              <div className="py-6 text-center">
                <Award className="mx-auto h-8 w-8 text-muted/60" />
                <h3 className="mt-2 text-sm font-bold text-ink">No scholarships found</h3>
                <p className="mt-1 text-xs text-muted">Try clearing filters or search keywords.</p>
              </div>
            </Card>
          ) : (
            filteredScholarships.map((item) => {
              const isBookmarked = bookmarkedIds.has(item.id);
              return (
                <Card key={item.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <span className="inline-block rounded-md bg-ok/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok">
                        {item.awardAmount}
                      </span>
                      <h2 className="mt-1 text-sm font-bold text-ink leading-snug">{item.name}</h2>
                      <p className="text-xs font-medium text-muted">{item.provider}</p>
                    </div>
                    <button
                      onClick={() => handleToggleBookmark("scholarship", item.id)}
                      className={`p-1.5 rounded-full transition ${
                        isBookmarked
                          ? "text-brand bg-brand/10"
                          : "text-muted hover:text-ink hover:bg-line/40"
                      }`}
                      aria-label={isBookmarked ? "Remove bookmark" : "Save bookmark"}
                    >
                      {isBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Requirements grid */}
                  <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="rounded-lg bg-line/40 p-1.5">
                      <span className="text-[10px] font-semibold text-muted block">Income Ceiling</span>
                      <span className="font-bold text-ink">
                        ₹{(item.familyIncomeLimit / 100000).toFixed(1)} Lakh/yr
                      </span>
                    </div>
                    <div className="rounded-lg bg-line/40 p-1.5">
                      <span className="text-[10px] font-semibold text-muted block">Min Academic Score</span>
                      <span className="font-bold text-ink">
                        {item.academicCutoff}% marks
                      </span>
                    </div>
                  </div>

                  {/* Target stream & State */}
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted">
                    <span className="rounded-md bg-line/60 px-2 py-0.5 text-ink">
                      {item.stateRestrictions}
                    </span>
                    <span className="rounded-md bg-line/60 px-2 py-0.5 text-muted">
                      Closes: {item.closingDate}
                    </span>
                  </div>

                  {/* Actions: Check Eligibility & Portal Apply */}
                  <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-xs">
                    <button
                      onClick={() => handleCheckEligibility(item)}
                      className="flex items-center gap-1 text-[11px] font-bold text-ink hover:underline"
                    >
                      <HelpCircle className="h-3 w-3 text-muted" />
                      <span>Check my fit</span>
                    </button>
                    <a
                      href={item.applicationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg bg-btn px-3 py-1.5 text-xs font-bold text-btntx"
                    >
                      <span>Official Portal</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: STUDENT OFFERS LIST */}
      {activeTab === "offers" && !loading && !error && (
        <div className="mt-3 flex flex-col gap-3">
          {filteredOffers.length === 0 ? (
            <Card>
              <div className="py-6 text-center">
                <Tag className="mx-auto h-8 w-8 text-muted/60" />
                <h3 className="mt-2 text-sm font-bold text-ink">No student discounts found</h3>
                <p className="mt-1 text-xs text-muted">Try clearing the search or category filters.</p>
              </div>
            </Card>
          ) : (
            filteredOffers.map((item) => {
              const isBookmarked = bookmarkedIds.has(item.id);
              const isCopied = copiedCode === item.promoCode;
              return (
                <Card key={item.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <span className="inline-block rounded-md bg-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">
                        {item.category}
                      </span>
                      <h2 className="mt-1 text-sm font-bold text-ink leading-snug">{item.title}</h2>
                      <p className="text-xs font-semibold text-muted">{item.provider}</p>
                    </div>
                    <button
                      onClick={() => handleToggleBookmark("offer", item.id)}
                      className={`p-1.5 rounded-full transition ${
                        isBookmarked
                          ? "text-brand bg-brand/10"
                          : "text-muted hover:text-ink hover:bg-line/40"
                      }`}
                      aria-label={isBookmarked ? "Remove bookmark" : "Save bookmark"}
                    >
                      {isBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Discount Highlight */}
                  <div className="mt-2.5 rounded-lg border border-line bg-bg p-2.5">
                    <div className="text-xs font-bold text-ok">{item.discount}</div>
                    {item.discountedPrice && (
                      <div className="mt-0.5 text-[11px] text-muted">
                        <span className="font-semibold text-ink">{item.discountedPrice}</span>
                        {item.originalPrice && <span className="line-through ml-1.5">{item.originalPrice}</span>}
                      </div>
                    )}
                  </div>

                  {/* Verification Requirement */}
                  <p className="mt-2 text-[11px] text-muted">
                    <span className="font-semibold text-ink">Verification:</span> {item.verificationRequirements}
                  </p>

                  {/* Promo code or Redeem action */}
                  <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-xs">
                    {item.promoCode ? (
                      <button
                        onClick={() => handleCopyCode(item.promoCode)}
                        className="flex items-center gap-1 rounded-md border border-dashed border-muted/50 bg-line/40 px-2 py-1 text-[11px] font-mono font-bold text-ink"
                        title="Click to copy code"
                      >
                        <span>{item.promoCode}</span>
                        {isCopied ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3 text-muted" />}
                      </button>
                    ) : (
                      <span className="text-[11px] text-muted">No promo code needed</span>
                    )}

                    <a
                      href={item.redemptionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg bg-btn px-3 py-1.5 text-xs font-bold text-btntx"
                    >
                      <span>Redeem</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* PERSONALIZED ELIGIBILITY MODAL */}
      {eligibilityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-[430px] rounded-2xl bg-card border border-line p-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-bold text-ink">Scholarship Fit Evaluator</h3>
              </div>
              <button
                onClick={() => setEligibilityModalOpen(false)}
                className="rounded-full p-1 text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedScholarship && (
              <div className="mt-2.5 rounded-lg bg-bg p-2 text-xs">
                <div className="font-bold text-ink">{selectedScholarship.name}</div>
                <div className="text-[11px] text-muted">{selectedScholarship.provider}</div>
              </div>
            )}

            {/* Student Voluntary Input Form */}
            <div className="mt-3 space-y-2.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">Degree / Course</label>
                <select
                  value={studentForm.course}
                  onChange={(e) => setStudentForm({ ...studentForm, course: e.target.value })}
                  className="w-full rounded-lg border border-line bg-card p-2 text-xs text-ink focus:outline-none"
                >
                  <option value="B.Tech">B.Tech / B.E (Engineering)</option>
                  <option value="B.Sc">B.Sc (Sciences)</option>
                  <option value="B.Com">B.Com / BBA (Commerce / Management)</option>
                  <option value="BA">BA (Humanities)</option>
                  <option value="MBBS">MBBS / Medical</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Study Year</label>
                  <select
                    value={studentForm.studyYear}
                    onChange={(e) => setStudentForm({ ...studentForm, studyYear: e.target.value })}
                    className="w-full rounded-lg border border-line bg-card p-2 text-xs text-ink focus:outline-none"
                  >
                    <option value="1">1st Year</option>
                    <option value="2">2nd Year</option>
                    <option value="3">3rd Year</option>
                    <option value="4">4th Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Gender</label>
                  <select
                    value={studentForm.gender}
                    onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })}
                    className="w-full rounded-lg border border-line bg-card p-2 text-xs text-ink focus:outline-none"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Annual Family Income (₹)</label>
                  <input
                    type="number"
                    value={studentForm.annualFamilyIncome}
                    onChange={(e) => setStudentForm({ ...studentForm, annualFamilyIncome: e.target.value })}
                    placeholder="e.g. 300000"
                    className="w-full rounded-lg border border-line bg-card p-2 text-xs text-ink focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted mb-1">Academic Score (%)</label>
                  <input
                    type="number"
                    value={studentForm.academicScore}
                    onChange={(e) => setStudentForm({ ...studentForm, academicScore: e.target.value })}
                    placeholder="e.g. 80"
                    className="w-full rounded-lg border border-line bg-card p-2 text-xs text-ink focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1">State of Domicile</label>
                <input
                  type="text"
                  value={studentForm.state}
                  onChange={(e) => setStudentForm({ ...studentForm, state: e.target.value })}
                  placeholder="e.g. Karnataka"
                  className="w-full rounded-lg border border-line bg-card p-2 text-xs text-ink focus:outline-none"
                />
              </div>

              <button
                onClick={() => selectedScholarship && handleCheckEligibility(selectedScholarship)}
                disabled={evaluatingEligibility}
                className="w-full rounded-xl bg-btn py-2 text-xs font-bold text-btntx transition disabled:opacity-50 mt-1"
              >
                {evaluatingEligibility ? "Evaluating Requirements..." : "Re-evaluate My Criteria"}
              </button>
            </div>

            {/* Evaluation Result Display */}
            {eligibilityResult && (
              <div className="mt-4 rounded-xl border border-line bg-bg p-3">
                <div className="flex items-center gap-1.5">
                  {eligibilityResult.status === "Likely eligible" && (
                    <CheckCircle2 className="h-4 w-4 text-ok shrink-0" />
                  )}
                  {eligibilityResult.status === "Check requirements" && (
                    <AlertCircle className="h-4 w-4 text-brand shrink-0" />
                  )}
                  {eligibilityResult.status === "Not eligible based on provided details" && (
                    <AlertCircle className="h-4 w-4 text-err shrink-0" />
                  )}
                  <span
                    className={`text-xs font-bold ${
                      eligibilityResult.status === "Likely eligible"
                        ? "text-ok"
                        : eligibilityResult.status === "Check requirements"
                        ? "text-brand"
                        : "text-err"
                    }`}
                  >
                    {eligibilityResult.status}
                  </span>
                </div>

                {/* Reasons Breakdown */}
                {eligibilityResult.reasons?.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[11px] text-muted">
                    {eligibilityResult.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-ink">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Missing Details */}
                {eligibilityResult.missingDetails?.length > 0 && (
                  <div className="mt-2 text-[11px]">
                    <span className="font-semibold text-ink">Unknown requirements to verify:</span>
                    <ul className="list-disc list-inside text-muted mt-0.5">
                      {eligibilityResult.missingDetails.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Important Non-Binding Disclaimer */}
                <p className="mt-2.5 text-[10px] text-muted italic border-t border-line/60 pt-1.5">
                  {eligibilityResult.disclaimer}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
