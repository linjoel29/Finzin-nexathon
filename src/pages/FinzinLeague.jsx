// FinzinLeague.jsx - Dedicated Finzin League screen.
// Gamified financial habits platform: public and private championships,
// server-authoritative habit XP, streaks, daily quizzes, and privacy-friendly leaderboards.
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Trophy,
  Flame,
  Award,
  Users,
  Lock,
  Copy,
  Check,
  Search,
  Plus,
  X,
  ArrowLeft,
  Settings,
  HelpCircle,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  BookOpen,
  LogOut,
  ChevronRight,
} from "lucide-react";
import Card from "../components/Card";
import { api } from "../api/client";
import { formatINR } from "../utils/money";

export default function FinzinLeague({ onBack }) {
  // Active primary tab: 'discover' | 'mine' | 'challenges'
  const [tab, setTab] = useState("discover");

  // Summary state (XP, streaks, tier, daily progress)
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  // Discover tab state
  const [publicChampionships, setPublicChampionships] = useState([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [publicSearch, setPublicSearch] = useState("");
  const [durationFilter, setDurationFilter] = useState("all");

  // My Championships tab state
  const [myChampionships, setMyChampionships] = useState([]);
  const [loadingMine, setLoadingMine] = useState(false);

  // Challenges & Achievements tab state
  const [challenges, setChallenges] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [loadingChallenges, setLoadingChallenges] = useState(false);
  const [challengeSubTab, setChallengeSubTab] = useState("challenges"); // 'challenges' | 'achievements'

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinCodeModalOpen, setJoinCodeModalOpen] = useState(false);
  const [prefsModalOpen, setPrefsModalOpen] = useState(false);
  const [activeLeaderboardId, setActiveLeaderboardId] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  // Daily Quiz Modal state
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [dailyQuiz, setDailyQuiz] = useState(null);
  const [selectedQuizOption, setSelectedQuizOption] = useState(null);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState(null);

  // Feedback banner state
  const [toastMessage, setToastMessage] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Creation form inputs
  const [newChampName, setNewChampName] = useState("");
  const [newChampDesc, setNewChampDesc] = useState("");
  const [newChampVisibility, setNewChampVisibility] = useState("public");
  const [newChampDuration, setNewChampDuration] = useState(7);
  const [newChampLimit, setNewChampLimit] = useState(50);
  const [creatingChamp, setCreatingChamp] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Join code input
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joiningCode, setJoiningCode] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState(null);

  // Budget preference input
  const [customDailyLimit, setCustomDailyLimit] = useState("200");
  const [customDisplayName, setCustomDisplayName] = useState("");
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Toast trigger
  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // 1. Fetch user summary
  const loadSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      setSummaryError(null);
      const data = await api.get("/league/summary");
      if (data) {
        setSummary(data);
        if (data.today?.limitRupees) {
          setCustomDailyLimit(String(data.today.limitRupees));
        }
        if (data.displayName) {
          setCustomDisplayName(data.displayName);
        }
      }
    } catch {
      setSummaryError("Could not load League summary. Please check your connection.");
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  // 2. Fetch public championships
  const loadPublicChampionships = useCallback(async () => {
    try {
      setLoadingPublic(true);
      const data = await api.get("/league/championships/public");
      if (data && Array.isArray(data.championships)) {
        setPublicChampionships(data.championships);
      }
    } catch {
      // Handled silently
    } finally {
      setLoadingPublic(false);
    }
  }, []);

  // 3. Fetch user's joined/created championships
  const loadMyChampionships = useCallback(async () => {
    try {
      setLoadingMine(true);
      const data = await api.get("/league/championships/mine");
      if (data && Array.isArray(data.championships)) {
        setMyChampionships(data.championships);
      }
    } catch {
      // Handled silently
    } finally {
      setLoadingMine(false);
    }
  }, []);

  // 4. Fetch challenges and achievements
  const loadChallengesAndBadges = useCallback(async () => {
    try {
      setLoadingChallenges(true);
      const [chalRes, achRes] = await Promise.allSettled([
        api.get("/league/challenges"),
        api.get("/league/achievements"),
      ]);
      if (chalRes.status === "fulfilled" && chalRes.value?.challenges) {
        setChallenges(chalRes.value.challenges);
      }
      if (achRes.status === "fulfilled" && achRes.value?.achievements) {
        setAchievements(achRes.value.achievements);
      }
    } catch {
      // Handled silently
    } finally {
      setLoadingChallenges(false);
    }
  }, []);

  // Initial data load on mount
  useEffect(() => {
    loadSummary();
    loadPublicChampionships();
    loadMyChampionships();
    loadChallengesAndBadges();
  }, [loadSummary, loadPublicChampionships, loadMyChampionships, loadChallengesAndBadges]);

  // Open dedicated Championship Dashboard / Leaderboard
  const openLeaderboard = useCallback(async (champId) => {
    setActiveLeaderboardId(champId);
    setLoadingLeaderboard(true);
    setLeaderboardData(null);
    try {
      const data = await api.get(`/league/championships/${champId}/leaderboard`);
      if (data) {
        setLeaderboardData(data);
      }
    } catch (err) {
      showToast(err.message || "Failed to load tournament leaderboard");
      setActiveLeaderboardId(null);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [showToast]);

  // Handle joining public tournament
  const handleJoinPublic = async (champId) => {
    try {
      await api.post(`/league/championships/${champId}/join`);
      showToast("Joined championship successfully! 🎉");
      loadPublicChampionships();
      loadMyChampionships();
      loadSummary();
    } catch (err) {
      showToast(err.message || "Could not join championship");
    }
  };

  // Handle creating new championship
  const handleCreateChampionship = async (e) => {
    e.preventDefault();
    if (!newChampName.trim() || newChampName.trim().length < 3) {
      setCreateError("Championship name must be at least 3 characters");
      return;
    }

    setCreatingChamp(true);
    setCreateError(null);
    try {
      const res = await api.post("/league/championships", {
        name: newChampName.trim(),
        description: newChampDesc.trim() || undefined,
        visibility: newChampVisibility,
        durationDays: Number(newChampDuration),
        participantLimit: Number(newChampLimit),
      });

      showToast("Championship created! 🏆");
      setCreateModalOpen(false);
      setNewChampName("");
      setNewChampDesc("");
      loadMyChampionships();
      loadPublicChampionships();
      loadSummary();

      if (res?.championship?.id) {
        openLeaderboard(res.championship.id);
      }
    } catch (err) {
      setCreateError(err.message || "Failed to create championship");
    } finally {
      setCreatingChamp(false);
    }
  };

  // Handle joining with Room ID
  const handleJoinByCode = async (e) => {
    e.preventDefault();
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length < 6) {
      setJoinCodeError("Enter a valid Room ID (6-12 letters/numbers)");
      return;
    }

    setJoiningCode(true);
    setJoinCodeError(null);
    try {
      const res = await api.post("/league/championships/join-by-code", {
        roomId: code,
      });

      showToast("Joined private championship! 🔑");
      setJoinCodeModalOpen(false);
      setJoinCodeInput("");
      loadMyChampionships();
      loadSummary();

      if (res?.championship?.id) {
        openLeaderboard(res.championship.id);
      }
    } catch (err) {
      setJoinCodeError(err.message || "Invalid or expired Room ID");
    } finally {
      setJoiningCode(false);
    }
  };

  // Handle leaving championship
  const handleLeaveChampionship = async (champId) => {
    if (!window.confirm("Are you sure you want to leave this championship?")) return;
    try {
      await api.post(`/league/championships/${champId}/leave`);
      showToast("You left the championship");
      setActiveLeaderboardId(null);
      loadMyChampionships();
      loadPublicChampionships();
      loadSummary();
    } catch (err) {
      showToast(err.message || "Failed to leave championship");
    }
  };

  // Handle claiming challenge rewards (server authoritative)
  const handleClaimChallenge = async (challengeId) => {
    try {
      const res = await api.post(`/league/challenges/${challengeId}/complete`);
      showToast(res.message || "Challenge completed! XP awarded! 🎉");
      loadSummary();
      loadChallengesAndBadges();
    } catch (err) {
      showToast(err.message || "Could not claim challenge reward");
    }
  };

  // Open Daily Quiz
  const handleOpenQuiz = async () => {
    setQuizModalOpen(true);
    setSelectedQuizOption(null);
    setQuizResult(null);
    try {
      const res = await api.get("/league/quiz/today");
      if (res?.question) {
        setDailyQuiz(res.question);
      }
    } catch {
      showToast("Could not load today's quiz question");
    }
  };

  // Submit Daily Quiz answer
  const handleSubmitQuiz = async () => {
    if (selectedQuizOption === null || !dailyQuiz?.id) return;
    setQuizSubmitting(true);
    try {
      const res = await api.post("/league/quiz/submit", {
        questionId: dailyQuiz.id,
        selectedIndex: selectedQuizOption,
      });
      setQuizResult(res);
      loadSummary();
      loadChallengesAndBadges();
      if (res.passed) {
        showToast("Correct! +5 XP earned! 🧠");
      }
    } catch (err) {
      showToast(err.message || "Failed to submit quiz attempt");
    } finally {
      setQuizSubmitting(false);
    }
  };

  // Save budget preferences
  const handleSavePreferences = async (e) => {
    e.preventDefault();
    const limitNum = Number(customDailyLimit);
    if (!limitNum || limitNum < 50 || limitNum > 10000) {
      showToast("Daily limit must be between ₹50 and ₹10,000");
      return;
    }

    setSavingPrefs(true);
    try {
      await api.patch("/league/preferences", {
        dailyBudgetLimitRupees: limitNum,
        displayName: customDisplayName.trim() || undefined,
      });
      showToast("Preferences updated! ⚙️");
      setPrefsModalOpen(false);
      loadSummary();
    } catch (err) {
      showToast(err.message || "Failed to update preferences");
    } finally {
      setSavingPrefs(false);
    }
  };

  // Copy Room ID helper
  const copyRoomCode = (code) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Filter public championships
  const filteredPublicChampionships = useMemo(() => {
    return publicChampionships.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(publicSearch.toLowerCase()) ||
        c.hostName.toLowerCase().includes(publicSearch.toLowerCase());
      const matchDuration =
        durationFilter === "all" || String(c.durationDays) === String(durationFilter);
      return matchSearch && matchDuration;
    });
  }, [publicChampionships, publicSearch, durationFilter]);

  // Compute tier progress percentage
  const tierProgressPercent = useMemo(() => {
    if (!summary) return 0;
    const { lifetimeXp, minXp, maxXp } = summary;
    if (!maxXp) return 100;
    const range = maxXp - minXp;
    const current = lifetimeXp - minXp;
    return Math.min(100, Math.max(0, Math.round((current / range) * 100)));
  }, [summary]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-8">
      {/* 1. TOP HEADER & BRANDING */}
      <div className="flex items-center justify-between py-3 border-b border-line/70 mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-line bg-card text-ink shadow-xs transition hover:border-brand/40 active:scale-95"
            aria-label="Back to Explore"
            title="Back to Explore"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-brand" />
              <h1 className="text-lg font-black tracking-tight text-ink">Finzin League</h1>
            </div>
            <p className="text-[11px] text-muted">Build habits. Rise together.</p>
          </div>
        </div>

        {/* Preferences / Settings icon */}
        <button
          onClick={() => setPrefsModalOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-line bg-card text-muted transition hover:text-ink hover:border-brand/40 active:scale-95 shadow-xs"
          title="League Preferences"
          aria-label="League Preferences"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* FEEDBACK TOAST BANNER */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl bg-btn px-4 py-2.5 text-xs font-bold text-btntx shadow-md border border-brand/30 animate-in fade-in duration-200">
          <Sparkles className="h-4 w-4 text-brand" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 2. USER OVERVIEW CARD (Tier, Lifetime XP, Streaks) */}
      <Card className="rounded-3xl p-4 shadow-sm border border-line mb-4 bg-card">
        {loadingSummary ? (
          <div className="animate-pulse space-y-2 py-2">
            <div className="h-4 w-1/3 bg-line/60 rounded-md" />
            <div className="h-8 w-2/3 bg-line/60 rounded-md" />
            <div className="h-2 w-full bg-line/60 rounded-full" />
          </div>
        ) : summaryError ? (
          <div className="py-2 text-center text-xs text-error flex flex-col items-center gap-1">
            <AlertCircle className="h-5 w-5" />
            <span>{summaryError}</span>
            <button
              onClick={loadSummary}
              className="mt-1 font-bold text-brand hover:underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <div>
            {/* Top row: Tier Badge & Display Name */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl" role="img" aria-label="tier icon">
                  {summary.tierIcon || "🥉"}
                </span>
                <div>
                  <div className="text-xs font-bold text-ink">{summary.tier}</div>
                  <div className="text-[10px] text-muted font-medium">
                    {summary.displayName || "Finzin Student"}
                  </div>
                </div>
              </div>

              {/* Active streak badge */}
              <div className="flex items-center gap-1.5 rounded-full bg-brand/15 px-2.5 py-1 text-xs font-bold text-brand">
                <Flame className="h-3.5 w-3.5 fill-current" />
                <span>{summary.activeStreak} Day Streak</span>
              </div>
            </div>

            {/* Middle: Lifetime Points Counter */}
            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-black text-ink">{summary.lifetimeXp}</span>
                <span className="ml-1 text-xs font-bold text-muted">XP Points</span>
              </div>
              {summary.nextTier && (
                <div className="text-[11px] text-muted font-semibold">
                  {summary.maxXp - summary.lifetimeXp + 1} XP to {summary.nextTier}
                </div>
              )}
            </div>

            {/* Progress bar towards next tier */}
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line/60">
              <div
                className="h-full bg-brand rounded-full transition-all duration-500"
                style={{ width: `${tierProgressPercent}%` }}
              />
            </div>

            {/* Bottom streak split pill */}
            <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-line/60 text-center text-[11px]">
              <div className="flex items-center justify-center gap-1 text-ink font-semibold">
                <span className="text-muted font-medium">Budget:</span>
                <span>{summary.budgetStreak}d</span>
                <span className="text-[10px] text-muted">(Best: {summary.bestBudgetStreak}d)</span>
              </div>
              <div className="flex items-center justify-center gap-1 text-ink font-semibold border-l border-line/60">
                <span className="text-muted font-medium">Saver:</span>
                <span>{summary.saverStreak}d</span>
                <span className="text-[10px] text-muted">(Best: {summary.bestSaverStreak}d)</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* 3. PRIMARY TABS (Discover | My Championships | Challenges) */}
      <div className="flex rounded-2xl bg-card border border-line p-1 mb-4 shadow-xs">
        <button
          onClick={() => {
            setTab("discover");
            setActiveLeaderboardId(null);
          }}
          className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
            tab === "discover" && !activeLeaderboardId
              ? "bg-btn text-btntx shadow-xs"
              : "text-muted hover:text-ink"
          }`}
        >
          Discover
        </button>
        <button
          onClick={() => {
            setTab("mine");
            setActiveLeaderboardId(null);
          }}
          className={`flex-1 rounded-xl py-2 text-xs font-bold transition flex items-center justify-center gap-1 ${
            tab === "mine" && !activeLeaderboardId
              ? "bg-btn text-btntx shadow-xs"
              : "text-muted hover:text-ink"
          }`}
        >
          <span>My Leagues</span>
          {myChampionships.length > 0 && (
            <span className="h-4 w-4 rounded-full bg-brand text-[10px] text-[#123B46] font-black grid place-items-center">
              {myChampionships.length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setTab("challenges");
            setActiveLeaderboardId(null);
          }}
          className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
            tab === "challenges" && !activeLeaderboardId
              ? "bg-btn text-btntx shadow-xs"
              : "text-muted hover:text-ink"
          }`}
        >
          Challenges
        </button>
      </div>

      {/* ============================================================== */}
      {/* VIEW: CHAMPIONSHIP DASHBOARD & LEADERBOARD (When clicked)     */}
      {/* ============================================================== */}
      {activeLeaderboardId ? (
        <div>
          <button
            onClick={() => setActiveLeaderboardId(null)}
            className="mb-3 flex items-center gap-1.5 text-xs font-bold text-brand hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Championship list</span>
          </button>

          {loadingLeaderboard ? (
            <div className="py-12 text-center text-xs text-muted">
              Loading tournament leaderboard...
            </div>
          ) : leaderboardData ? (
            <div className="space-y-4">
              {/* Championship Header Card */}
              <Card className="rounded-3xl p-5 shadow-sm border border-line bg-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-brand/15 px-2.5 py-0.5 text-[10px] font-bold text-brand uppercase tracking-wider">
                        {leaderboardData.championship.visibility}
                      </span>
                      <span className="text-xs text-muted font-medium">
                        Hosted by {leaderboardData.championship.hostName}
                      </span>
                    </div>
                    <h2 className="mt-1 text-lg font-black text-ink">
                      {leaderboardData.championship.name}
                    </h2>
                    {leaderboardData.championship.description && (
                      <p className="mt-1 text-xs text-muted">
                        {leaderboardData.championship.description}
                      </p>
                    )}
                  </div>

                  {/* Private Room ID copy box (Only for members of private tournament) */}
                  {leaderboardData.championship.roomId && (
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] font-bold uppercase text-muted">Room ID</div>
                      <button
                        onClick={() => copyRoomCode(leaderboardData.championship.roomId)}
                        className="mt-0.5 flex items-center gap-1 rounded-xl border border-line bg-bg px-2.5 py-1 text-xs font-mono font-bold text-ink shadow-xs hover:border-brand/40 active:scale-95"
                        title="Copy Room ID to invite friends"
                      >
                        <span>{leaderboardData.championship.roomId}</span>
                        {copiedCode ? (
                          <Check className="h-3 w-3 text-success" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Tournament details row */}
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line/60 pt-3 text-center text-xs">
                  <div>
                    <div className="text-[10px] text-muted font-medium">Duration</div>
                    <div className="font-bold text-ink">
                      {leaderboardData.championship.durationDays} Days
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted font-medium">Participants</div>
                    <div className="font-bold text-ink">
                      {leaderboardData.championship.participantCount} /{" "}
                      {leaderboardData.championship.participantLimit}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted font-medium">Your Rank</div>
                    <div className="font-bold text-brand">
                      {leaderboardData.myRank ? `#${leaderboardData.myRank}` : "—"}
                    </div>
                  </div>
                </div>

                {/* Leave championship button (for non-creators or participants) */}
                {leaderboardData.championship.isMember && (
                  <div className="mt-3 pt-2 flex justify-end">
                    <button
                      onClick={() => handleLeaveChampionship(leaderboardData.championship.id)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-error hover:underline"
                    >
                      <LogOut className="h-3 w-3" />
                      <span>Leave Championship</span>
                    </button>
                  </div>
                )}
              </Card>

              {/* LEADERBOARD TABLE */}
              <div className="rounded-3xl border border-line bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Award className="h-4 w-4 text-brand" />
                    <h3 className="text-sm font-bold text-ink">Tournament Leaderboard</h3>
                  </div>
                  <span className="text-[10px] text-muted font-medium">
                    Updated in real time
                  </span>
                </div>

                {leaderboardData.leaderboard.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted">
                    No scores recorded yet in this championship.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leaderboardData.leaderboard.map((item) => {
                      const isTop3 = item.rank <= 3;
                      const rankBadge =
                        item.rank === 1
                          ? "🥇"
                          : item.rank === 2
                          ? "🥈"
                          : item.rank === 3
                          ? "🥉"
                          : `#${item.rank}`;

                      return (
                        <div
                          key={item.displayName + item.rank}
                          className={`flex items-center justify-between rounded-2xl p-3 text-xs transition ${
                            item.isCurrentUser
                              ? "border-2 border-brand/50 bg-brand/5 font-bold"
                              : "border border-line/60 bg-bg/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`grid h-7 w-7 place-items-center rounded-xl text-xs font-bold ${
                                isTop3
                                  ? "bg-card text-ink shadow-xs"
                                  : "text-muted font-mono"
                              }`}
                            >
                              {rankBadge}
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-ink font-bold">
                                  {item.displayName}
                                </span>
                                {item.isCurrentUser && (
                                  <span className="rounded-md bg-brand px-1.5 py-0.2 text-[9px] font-black text-[#123B46]">
                                    YOU
                                  </span>
                                )}
                                {item.isCreator && (
                                  <span className="rounded-md bg-line px-1.5 py-0.2 text-[9px] font-bold text-muted">
                                    HOST
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="font-black text-ink">
                              {item.championshipXp}
                            </span>
                            <span className="ml-1 text-[10px] text-muted font-medium">
                              XP
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Educational privacy note */}
                <p className="mt-3 text-[10px] leading-relaxed text-muted border-t border-line/60 pt-2">
                  🔒 <strong>Fair Habit Rankings:</strong> Scores reflect financial habits and challenges completed during this championship. Finzin never ranks students by account balances, loans, or wealth.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {/* ============================================================== */}
          {/* TAB 1: DISCOVER PUBLIC CHAMPIONSHIPS                           */}
          {/* ============================================================== */}
          {tab === "discover" && (
            <div className="space-y-3">
              {/* Quick action: Enter private room ID banner */}
              <div className="rounded-2xl border border-line bg-card p-3 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-xl bg-brand/15 text-brand">
                    <Lock className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-ink">Have a private code?</div>
                    <div className="text-[10px] text-muted">Join a friend's private championship</div>
                  </div>
                </div>
                <button
                  onClick={() => setJoinCodeModalOpen(true)}
                  className="rounded-xl bg-btn px-3 py-1.5 text-xs font-bold text-btntx shadow-xs transition hover:opacity-95 active:scale-95"
                >
                  Join by ID
                </button>
              </div>

              {/* Search and Duration filter row */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
                  <input
                    type="text"
                    value={publicSearch}
                    onChange={(e) => setPublicSearch(e.target.value)}
                    placeholder="Search tournaments or hosts..."
                    className="w-full rounded-2xl border border-line bg-card py-2 pl-9 pr-3 text-xs text-ink placeholder:text-muted focus:border-brand focus:outline-hidden shadow-xs"
                  />
                </div>

                <select
                  value={durationFilter}
                  onChange={(e) => setDurationFilter(e.target.value)}
                  className="rounded-2xl border border-line bg-card py-2 px-2.5 text-xs text-ink font-semibold focus:border-brand focus:outline-hidden shadow-xs"
                >
                  <option value="all">All Days</option>
                  <option value="7">7 Days</option>
                  <option value="14">14 Days</option>
                  <option value="30">30 Days</option>
                </select>
              </div>

              {/* Public championship cards list */}
              {loadingPublic ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 rounded-2xl bg-card border border-line animate-pulse" />
                  ))}
                </div>
              ) : filteredPublicChampionships.length === 0 ? (
                <Card className="rounded-3xl p-6 text-center border border-line bg-card shadow-xs">
                  <Trophy className="mx-auto h-8 w-8 text-muted/60 mb-2" />
                  <h3 className="text-sm font-bold text-ink">No Public Championships Found</h3>
                  <p className="mt-1 text-xs text-muted max-w-xs mx-auto">
                    Be the first student to create a public championship and invite campus peers!
                  </p>
                  <button
                    onClick={() => setCreateModalOpen(true)}
                    className="mt-3 rounded-2xl bg-btn px-4 py-2 text-xs font-bold text-btntx shadow-xs transition hover:opacity-95"
                  >
                    + Create Championship
                  </button>
                </Card>
              ) : (
                <div className="space-y-2.5">
                  {filteredPublicChampionships.map((champ) => (
                    <Card
                      key={champ.id}
                      className="rounded-2xl p-4 border border-line bg-card shadow-xs transition hover:border-brand/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">
                              {champ.durationDays} Days
                            </span>
                            <span className="text-[11px] text-muted font-medium">
                              Host: {champ.hostName}
                            </span>
                          </div>
                          <h3 className="mt-1 text-sm font-black text-ink">{champ.name}</h3>
                          {champ.description && (
                            <p className="mt-0.5 text-xs text-muted line-clamp-2">
                              {champ.description}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="text-[10px] text-muted font-semibold flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            <span>
                              {champ.participantCount} / {champ.participantLimit}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
                        <span className="text-[11px] text-muted font-medium">
                          Status: <strong className="text-ink capitalize">{champ.status}</strong>
                        </span>

                        {champ.isJoined ? (
                          <button
                            onClick={() => openLeaderboard(champ.id)}
                            className="flex items-center gap-1 rounded-xl border border-line bg-bg px-3 py-1.5 text-xs font-bold text-ink hover:border-brand/40 shadow-xs"
                          >
                            <span>Leaderboard</span>
                            <ChevronRight className="h-3.5 w-3.5 text-brand" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleJoinPublic(champ.id)}
                            disabled={champ.participantCount >= champ.participantLimit}
                            className="rounded-xl bg-btn px-4 py-1.5 text-xs font-bold text-btntx shadow-xs transition hover:opacity-95 disabled:opacity-50"
                          >
                            {champ.participantCount >= champ.participantLimit
                              ? "Full"
                              : "Join Tournament"}
                          </button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: MY CHAMPIONSHIPS                                        */}
          {/* ============================================================== */}
          {tab === "mine" && (
            <div className="space-y-3">
              {/* Action buttons row */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-btn p-3 text-xs font-bold text-btntx shadow-sm transition hover:opacity-95 active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Championship</span>
                </button>
                <button
                  onClick={() => setJoinCodeModalOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-line bg-card p-3 text-xs font-bold text-ink shadow-sm transition hover:border-brand/40 active:scale-95"
                >
                  <Lock className="h-4 w-4 text-brand" />
                  <span>Join with Room ID</span>
                </button>
              </div>

              {loadingMine ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-24 rounded-2xl bg-card border border-line animate-pulse" />
                  ))}
                </div>
              ) : myChampionships.length === 0 ? (
                <Card className="rounded-3xl p-6 text-center border border-line bg-card shadow-xs">
                  <Award className="mx-auto h-8 w-8 text-muted/60 mb-2" />
                  <h3 className="text-sm font-bold text-ink">No Joined Championships</h3>
                  <p className="mt-1 text-xs text-muted max-w-xs mx-auto">
                    You haven't joined any tournaments yet. Join an open championship from the Discover tab or enter a private code!
                  </p>
                  <button
                    onClick={() => setTab("discover")}
                    className="mt-3 rounded-2xl bg-btn px-4 py-2 text-xs font-bold text-btntx shadow-xs transition hover:opacity-95"
                  >
                    Explore Discover Tab
                  </button>
                </Card>
              ) : (
                <div className="space-y-2.5">
                  {myChampionships.map((champ) => (
                    <Card
                      key={champ.id}
                      className="rounded-2xl p-4 border border-line bg-card shadow-xs transition hover:border-brand/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand uppercase">
                              {champ.visibility}
                            </span>
                            {champ.isCreator && (
                              <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-bold text-muted">
                                You are Host
                              </span>
                            )}
                          </div>
                          <h3 className="mt-1 text-sm font-black text-ink">{champ.name}</h3>
                          {champ.description && (
                            <p className="mt-0.5 text-xs text-muted line-clamp-1">
                              {champ.description}
                            </p>
                          )}
                        </div>

                        {/* Room ID for private championship */}
                        {champ.visibility === "private" && champ.roomId && (
                          <div className="shrink-0 text-right">
                            <button
                              onClick={() => copyRoomCode(champ.roomId)}
                              className="flex items-center gap-1 rounded-xl border border-line bg-bg px-2 py-0.5 text-[11px] font-mono font-bold text-ink hover:border-brand/40 shadow-xs"
                              title="Copy Room ID"
                            >
                              <span>{champ.roomId}</span>
                              <Copy className="h-3 w-3 text-muted" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
                        <div className="text-[11px] text-muted flex items-center gap-2">
                          <span>{champ.durationDays}d</span>
                          <span>•</span>
                          <span>{champ.participantCount} Participants</span>
                        </div>

                        <button
                          onClick={() => openLeaderboard(champ.id)}
                          className="flex items-center gap-1 rounded-xl bg-btn px-3.5 py-1.5 text-xs font-bold text-btntx shadow-xs transition hover:opacity-95"
                        >
                          <span>Leaderboard</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: CHALLENGES & ACHIEVEMENTS                               */}
          {/* ============================================================== */}
          {tab === "challenges" && (
            <div className="space-y-3">
              {/* Sub-toggle: Challenges vs Badges */}
              <div className="flex border-b border-line pb-2 gap-4 text-xs font-bold">
                <button
                  onClick={() => setChallengeSubTab("challenges")}
                  className={`pb-1 transition ${
                    challengeSubTab === "challenges"
                      ? "text-brand border-b-2 border-brand"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Habit Challenges
                </button>
                <button
                  onClick={() => setChallengeSubTab("achievements")}
                  className={`pb-1 transition flex items-center gap-1 ${
                    challengeSubTab === "achievements"
                      ? "text-brand border-b-2 border-brand"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <span>Achievements</span>
                  <span className="rounded-full bg-brand/15 px-1.5 py-0.2 text-[10px] text-brand">
                    {achievements.filter((a) => a.isUnlocked).length} / {achievements.length}
                  </span>
                </button>
              </div>

              {/* SUBTAB 1: CHALLENGES */}
              {challengeSubTab === "challenges" && (
                loadingChallenges ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-20 rounded-2xl bg-card border border-line animate-pulse" />
                    ))}
                  </div>
                ) : (
                <div className="space-y-2.5">
                  {/* Daily Quiz Hero Card */}
                  <Card className="rounded-2xl p-4 border border-brand/30 bg-card shadow-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-brand uppercase tracking-wider">
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>Daily Financial Quiz</span>
                        </div>
                        <h3 className="mt-1 text-sm font-black text-ink">
                          Test Your Money Smarts (+5 XP)
                        </h3>
                        <p className="mt-0.5 text-xs text-muted">
                          Answer 1 daily quiz on UPI safety, inflation, or savings compounding.
                        </p>
                      </div>

                      <span className="rounded-full bg-brand/15 px-2.5 py-1 text-xs font-bold text-brand shrink-0">
                        +5 XP
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
                      <span className="text-[11px] text-muted">
                        {summary?.today?.quizPassedToday
                          ? "Completed today ✓"
                          : summary?.today?.quizAttemptedToday
                          ? "Attempted today"
                          : "Available today"}
                      </span>

                      <button
                        onClick={handleOpenQuiz}
                        disabled={summary?.today?.quizPassedToday}
                        className="rounded-xl bg-btn px-4 py-1.5 text-xs font-bold text-btntx shadow-xs transition hover:opacity-95 disabled:opacity-50"
                      >
                        {summary?.today?.quizPassedToday ? "Passed ✓" : "Take Quiz"}
                      </button>
                    </div>
                  </Card>

                  {/* Rest of Challenges list */}
                  {challenges.map((ch) => {
                    const isBudget = ch.id === "daily_budget";
                    const isSlice = ch.id === "daily_slice_save";

                    return (
                      <Card
                        key={ch.id}
                        className="rounded-2xl p-4 border border-line bg-card shadow-xs"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                              {ch.category} Challenge
                            </span>
                            <h3 className="mt-0.5 text-sm font-bold text-ink">{ch.title}</h3>
                            <p className="mt-0.5 text-xs text-muted">{ch.description}</p>
                          </div>

                          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-black text-brand shrink-0">
                            +{ch.xpReward} XP
                          </span>
                        </div>

                        {/* Real progress stats for budget challenge */}
                        {isBudget && summary?.today && (
                          <div className="mt-2.5 rounded-xl bg-bg p-2 text-[11px]">
                            <div className="flex justify-between text-ink font-semibold">
                              <span>Today's Outgoing Spends:</span>
                              <span>
                                {formatINR(summary.today.spentRupees)} /{" "}
                                {formatINR(summary.today.maxAllowedRupees)} max
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 w-full rounded-full bg-line overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  summary.today.isBudgetSafe ? "bg-success" : "bg-error"
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (summary.today.spentPaise / (summary.today.maxAllowedPaise || 1)) * 100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Real progress stats for Slice saver challenge */}
                        {isSlice && summary?.today && (
                          <div className="mt-2.5 rounded-xl bg-bg p-2 text-[11px]">
                            <div className="flex justify-between text-ink font-semibold">
                              <span>Today's Net Slice Deposits:</span>
                              <span>{formatINR(summary.today.netSliceRupees)} / ₹10.00 min</span>
                            </div>
                          </div>
                        )}

                        {/* Claim action button */}
                        <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
                          <span className="text-[11px] text-muted capitalize">
                            Status:{" "}
                            <strong className="text-ink">
                              {ch.actionState === "completed"
                                ? "Claimed ✓"
                                : ch.actionState === "claimable"
                                ? "Ready to claim!"
                                : "In Progress"}
                            </strong>
                          </span>

                          <button
                            onClick={() => handleClaimChallenge(ch.id)}
                            disabled={ch.actionState === "completed"}
                            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-xs ${
                              ch.actionState === "claimable"
                                ? "bg-btn text-btntx hover:opacity-95 active:scale-95"
                                : ch.actionState === "completed"
                                ? "bg-line/50 text-muted opacity-60 cursor-not-allowed"
                                : "bg-card border border-line text-ink hover:border-brand/40"
                            }`}
                          >
                            {ch.actionState === "completed"
                              ? "Claimed ✓"
                              : ch.actionState === "claimable"
                              ? `Claim +${ch.xpReward} XP`
                              : "Verify & Claim"}
                          </button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
                )
              )}

              {/* SUBTAB 2: ACHIEVEMENTS */}
              {challengeSubTab === "achievements" && (
                <div className="grid grid-cols-2 gap-2.5">
                  {achievements.map((ach) => (
                    <Card
                      key={ach.id}
                      className={`rounded-2xl p-3.5 border transition ${
                        ach.isUnlocked
                          ? "border-brand/40 bg-card shadow-xs"
                          : "border-line/60 bg-card/60 opacity-60"
                      }`}
                    >
                      <div className="text-2xl mb-1">{ach.icon}</div>
                      <h4 className="text-xs font-black text-ink">{ach.title}</h4>
                      <p className="mt-1 text-[10px] text-muted leading-tight">
                        {ach.description}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[10px] font-bold">
                        <span className="text-brand">+{ach.xpReward} XP</span>
                        <span className={ach.isUnlocked ? "text-success" : "text-muted"}>
                          {ach.isUnlocked ? "Unlocked ✓" : "Locked 🔒"}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: CREATE CHAMPIONSHIP                                   */}
      {/* ============================================================== */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-[390px] rounded-3xl bg-card border border-line p-5 text-ink shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3 border-b border-line pb-2">
              <div className="flex items-center gap-1.5">
                <Trophy className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-bold">Create Championship</h3>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-full text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {createError && (
              <div className="mb-3 rounded-xl bg-error/10 p-2 text-xs font-semibold text-error border border-error/20">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateChampionship} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-ink">Championship Name *</label>
                <input
                  type="text"
                  required
                  value={newChampName}
                  onChange={(e) => setNewChampName(e.target.value)}
                  placeholder="e.g. Hostel Saver Sprint"
                  maxLength={40}
                  className="mt-1 w-full rounded-xl border border-line bg-bg p-2 text-ink placeholder:text-muted focus:border-brand focus:outline-hidden"
                />
              </div>

              <div>
                <label className="font-bold text-ink">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={newChampDesc}
                  onChange={(e) => setNewChampDesc(e.target.value)}
                  placeholder="Short goal or campus rule..."
                  maxLength={200}
                  className="mt-1 w-full rounded-xl border border-line bg-bg p-2 text-ink placeholder:text-muted focus:border-brand focus:outline-hidden"
                />
              </div>

              <div>
                <label className="font-bold text-ink">Visibility</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <label
                    className={`flex items-center justify-center gap-1.5 rounded-xl border p-2 cursor-pointer transition ${
                      newChampVisibility === "public"
                        ? "border-brand bg-brand/10 font-bold text-brand"
                        : "border-line text-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="vis"
                      value="public"
                      checked={newChampVisibility === "public"}
                      onChange={() => setNewChampVisibility("public")}
                      className="hidden"
                    />
                    <span>Public</span>
                  </label>
                  <label
                    className={`flex items-center justify-center gap-1.5 rounded-xl border p-2 cursor-pointer transition ${
                      newChampVisibility === "private"
                        ? "border-brand bg-brand/10 font-bold text-brand"
                        : "border-line text-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="vis"
                      value="private"
                      checked={newChampVisibility === "private"}
                      onChange={() => setNewChampVisibility("private")}
                      className="hidden"
                    />
                    <span>Private (Room ID)</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-ink">Duration</label>
                  <select
                    value={newChampDuration}
                    onChange={(e) => setNewChampDuration(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-line bg-bg p-2 text-ink font-semibold focus:border-brand focus:outline-hidden"
                  >
                    <option value={7}>7 Days</option>
                    <option value={14}>14 Days</option>
                    <option value={30}>30 Days</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-ink">Max Students</label>
                  <select
                    value={newChampLimit}
                    onChange={(e) => setNewChampLimit(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-line bg-bg p-2 text-ink font-semibold focus:border-brand focus:outline-hidden"
                  >
                    <option value={10}>10 Students</option>
                    <option value={25}>25 Students</option>
                    <option value={50}>50 Students</option>
                    <option value={100}>100 Students</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={creatingChamp}
                  className="w-full rounded-2xl bg-btn py-2.5 text-xs font-bold text-btntx shadow-md transition hover:opacity-95 disabled:opacity-50"
                >
                  {creatingChamp ? "Creating Tournament..." : "Launch Championship"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: JOIN WITH ROOM ID                                     */}
      {/* ============================================================== */}
      {joinCodeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-[360px] rounded-3xl bg-card border border-line p-5 text-ink shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3 border-b border-line pb-2">
              <div className="flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-bold">Join with Room ID</h3>
              </div>
              <button
                onClick={() => setJoinCodeModalOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-full text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {joinCodeError && (
              <div className="mb-3 rounded-xl bg-error/10 p-2 text-xs font-semibold text-error border border-error/20">
                {joinCodeError}
              </div>
            )}

            <form onSubmit={handleJoinByCode} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-ink">8-Character Room Code</label>
                <input
                  type="text"
                  required
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. 7K9A2M84"
                  maxLength={12}
                  className="mt-1 w-full rounded-xl border border-line bg-bg p-2.5 text-center font-mono text-base font-black tracking-widest text-ink placeholder:text-muted focus:border-brand focus:outline-hidden"
                />
              </div>

              <button
                type="submit"
                disabled={joiningCode}
                className="w-full rounded-2xl bg-btn py-2.5 text-xs font-bold text-btntx shadow-md transition hover:opacity-95 disabled:opacity-50"
              >
                {joiningCode ? "Verifying Code..." : "Join Private Tournament"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: DAILY FINANCIAL QUIZ                                  */}
      {/* ============================================================== */}
      {quizModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-[390px] rounded-3xl bg-card border border-line p-5 text-ink shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3 border-b border-line pb-2">
              <div className="flex items-center gap-1.5">
                <HelpCircle className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-bold">Today's Money Quiz</h3>
              </div>
              <button
                onClick={() => setQuizModalOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-full text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {dailyQuiz ? (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand uppercase">
                    {dailyQuiz.topic}
                  </span>
                  <p className="mt-1.5 text-sm font-bold text-ink leading-snug">
                    {dailyQuiz.question}
                  </p>
                </div>

                {/* Options list */}
                <div className="space-y-2 pt-1">
                  {dailyQuiz.options.map((opt, idx) => {
                    const isSelected = selectedQuizOption === idx;
                    let optionStyle = "border-line bg-bg text-ink";

                    if (quizResult) {
                      if (idx === quizResult.correctIndex) {
                        optionStyle = "border-success bg-success/10 font-bold text-success";
                      } else if (isSelected && !quizResult.passed) {
                        optionStyle = "border-error bg-error/10 text-error";
                      }
                    } else if (isSelected) {
                      optionStyle = "border-brand bg-brand/10 font-bold text-brand";
                    }

                    return (
                      <button
                        key={idx}
                        disabled={quizResult !== null || quizSubmitting}
                        onClick={() => setSelectedQuizOption(idx)}
                        className={`w-full rounded-2xl border p-3 text-left transition ${optionStyle} shadow-xs`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-[11px] opacity-70">
                            {String.fromCharCode(65 + idx)}.
                          </span>
                          <span className="text-xs leading-relaxed">{opt}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Server Explanation if submitted */}
                {quizResult && (
                  <div className="rounded-2xl bg-bg p-3 border border-line text-xs">
                    <div className="flex items-center gap-1.5 font-bold mb-1">
                      {quizResult.passed ? (
                        <span className="text-success flex items-center gap-1">
                          <ShieldCheck className="h-4 w-4" /> Correct Answer! (+5 XP)
                        </span>
                      ) : (
                        <span className="text-error flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" /> Incorrect
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">
                      {quizResult.explanation}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2">
                  {quizResult ? (
                    <button
                      onClick={() => setQuizModalOpen(false)}
                      className="w-full rounded-2xl bg-btn py-2.5 text-xs font-bold text-btntx shadow-md"
                    >
                      Done
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmitQuiz}
                      disabled={selectedQuizOption === null || quizSubmitting}
                      className="w-full rounded-2xl bg-btn py-2.5 text-xs font-bold text-btntx shadow-md transition hover:opacity-95 disabled:opacity-50"
                    >
                      {quizSubmitting ? "Verifying..." : "Submit Answer"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-muted">
                Loading today's question...
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 4: BUDGET PREFERENCES                                    */}
      {/* ============================================================== */}
      {prefsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-[360px] rounded-3xl bg-card border border-line p-5 text-ink shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3 border-b border-line pb-2">
              <div className="flex items-center gap-1.5">
                <Settings className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-bold">League Preferences</h3>
              </div>
              <button
                onClick={() => setPrefsModalOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-full text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSavePreferences} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-ink">Daily Spending Limit (₹)</label>
                <p className="text-[10px] text-muted">
                  Finzin adds a +5% buffer. Outgoing transfers under this limit keep your streak alive.
                </p>
                <input
                  type="number"
                  required
                  min={50}
                  max={10000}
                  value={customDailyLimit}
                  onChange={(e) => setCustomDailyLimit(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-bg p-2 text-ink font-bold focus:border-brand focus:outline-hidden"
                />
              </div>

              <div>
                <label className="font-bold text-ink">League Display Name</label>
                <p className="text-[10px] text-muted">
                  Privacy-safe nickname shown to other students on leaderboards.
                </p>
                <input
                  type="text"
                  required
                  maxLength={30}
                  value={customDisplayName}
                  onChange={(e) => setCustomDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-bg p-2 text-ink font-semibold focus:border-brand focus:outline-hidden"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingPrefs}
                  className="w-full rounded-2xl bg-btn py-2.5 text-xs font-bold text-btntx shadow-md transition hover:opacity-95 disabled:opacity-50"
                >
                  {savingPrefs ? "Saving..." : "Save Preferences"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
