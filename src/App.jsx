// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { questions as RAW_QUESTIONS } from "./data/questions";

// Components (reuse solo app patterns)
import Media from "./components/Media";
import AutoCompleteAnswer from "./components/AutoCompleteAnswer";
import ScoreInput from "./components/ScoreInput";
import { validate as baseValidate } from "./lib/validators";

// ——— Brand look & feel (matches the solo app) ———
const THEME = {
  gradientFrom: "#223B57",
  gradientTo: "#2F4E73",
  accent: "#F11467",
  card: "rgba(17, 24, 39, 0.55)",
  border: "rgba(255,255,255,0.08)",
  badgeGradient: "linear-gradient(90deg,#BA1ED3,#F11467)",
  positiveGrad: "linear-gradient(90deg,#22C55E,#10B981)",
  negativeGrad: "linear-gradient(90deg,#F43F5E,#EF4444)",
};

// Fonts + CSS vars once (Tailwind utility classes live in index.css)
function useBrandCSS() {
  useEffect(() => {
    const linkEl = document.createElement("link");
    linkEl.rel = "stylesheet";
    linkEl.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans:wght@400;700&display=swap&subset=greek";
    document.head.appendChild(linkEl);
    const styleEl = document.createElement("style");
    styleEl.innerHTML = `
      :root { 
        --brand-grad-from: ${THEME.gradientFrom}; 
        --brand-grad-to: ${THEME.gradientTo}; 
        --brand-accent: ${THEME.accent}; 
        --brand-card: ${THEME.card}; 
        --brand-border: ${THEME.border};
      }
      .font-display { font-family: "Noto Sans", Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .font-ui { font-family: "Noto Sans", Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    `;
    document.head.appendChild(styleEl);
    return () => {
      document.head.removeChild(styleEl);
      document.head.removeChild(linkEl);
    };
  }, []);
}

// ——— Local storage helper ———
function usePersistentState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

// ——— Game enums ———
const STAGES = {
  SETUP: "setup",
  CATEGORY: "category",
  READY: "ready",
  QUESTION: "question",
  ANSWER: "answer",
  STEAL_PROMPT: "steal_prompt",
  STEAL_TURN: "steal_turn",
  FINALE_WAGER: "finale_wager",
  FINALE_PLAY: "finale_play",
  RESULTS: "results",
};

// ——— Helpers ———
const LOGO_SRC = "/logo.png";
const Logo = React.memo(() => (
  <img
    src={LOGO_SRC}
    alt="Λογότυπο"
    className="h-7 w-auto"
    draggable="false"
    decoding="async"
    loading="eager"
    fetchpriority="high"
    style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,.4))" }}
  />
));

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}
function ceilHalf(n) {
  return Math.ceil(n / 2);
}
function splitQuestions(arr) {
  const finals = arr.filter((q) => q.isFinal);
  const nonFinals = arr.filter((q) => !q.isFinal);
  return { finals, nonFinals };
}
function phaseForTurn(turnNumberForPlayer, turnsPerPlayer) {
  const t = Math.max(1, turnNumberForPlayer); // 1-based
  const third = Math.ceil(turnsPerPlayer / 3);
  if (t <= third) return "A";
  if (t <= third * 2) return "B";
  return "C";
}
function streakMultiplier(streakCount) {
  if (streakCount >= 5) return 1.5;
  if (streakCount >= 3) return 1.25;
  return 1.0;
}
function finalizePoints(p) {
  return Math.max(0, Math.round(p));
}

// ——— Main App ———
export default function App() {
  useBrandCSS();

  const { finals, nonFinals } = useMemo(
    () =>
      splitQuestions(
        RAW_QUESTIONS.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
      ),
    []
  );

  // Persistent match state
  const [state, setState] = usePersistentState("two_player_quiz_state_v1", {
    stage: STAGES.SETUP,
    p1: { name: "P1", avatar: "", score: 0, streak: 0, helpsLeft: 3, usedX2Ids: [] },
    p2: { name: "P2", avatar: "", score: 0, streak: 0, helpsLeft: 3, usedX2Ids: [] },
    active: "p1",
    usedQuestionIds: [],
    turnIndex: 0,
    perPlayerTurnsTaken: { p1: 0, p2: 0 },
    current: {
      selectedQuestionId: null,
      x2ThisTurn: false,
      usedHelpThisQuestion: false,
      fiftyEnabledIds: [],
      hintShown: false,
      stealOffered: false,
      stealAccepted: false,
      stealBy: null,
      answerValue: null,
      revealChoices: null,
    },
    finale: {
      enabled: finals.length > 0,
      wagerP1: 0,
      wagerP2: 0,
      phase: "pick",
      currentPlayer: "p1",
      done: false,
    },
    __lastOwnTurnCorrect: null,
  });

  const setStage = (s) => setState((st) => ({ ...st, stage: s }));

  const activeKey = state.active;
  const otherKey = activeKey === "p1" ? "p2" : "p1";
  const activePlayer = state[activeKey];

  const turnsPerPlayer = Math.ceil(nonFinals.length / 2);
  const myTurnsTaken = state.perPlayerTurnsTaken[activeKey] || 0;
  const myUpcomingTurnNumber = myTurnsTaken + 1;
  const myPhase = phaseForTurn(myUpcomingTurnNumber, turnsPerPlayer);

  const availableQuestions = useMemo(() => {
    return nonFinals.filter((q) => !state.usedQuestionIds.includes(q.id));
  }, [nonFinals, state.usedQuestionIds]);

  function resetMatch() {
    setState((_) => ({
      stage: STAGES.SETUP,
      p1: { name: "P1", avatar: "", score: 0, streak: 0, helpsLeft: 3, usedX2Ids: [] },
      p2: { name: "P2", avatar: "", score: 0, streak: 0, helpsLeft: 3, usedX2Ids: [] },
      active: "p1",
      usedQuestionIds: [],
      turnIndex: 0,
      perPlayerTurnsTaken: { p1: 0, p2: 0 },
      current: {
        selectedQuestionId: null,
        x2ThisTurn: false,
        usedHelpThisQuestion: false,
        fiftyEnabledIds: [],
        hintShown: false,
        stealOffered: false,
        stealAccepted: false,
        stealBy: null,
        answerValue: null,
        revealChoices: null,
      },
      finale: {
        enabled: finals.length > 0,
        wagerP1: 0,
        wagerP2: 0,
        phase: "pick",
        currentPlayer: "p1",
        done: false,
      },
      __lastOwnTurnCorrect: null,
    }));
  }

  // ——— UI blocks ———
  function ScoreHeader() {
    return (
      <header
        className="sticky top-0 z-20 w-full"
        style={{
          background: `linear-gradient(90deg, var(--brand-grad-from), var(--brand-grad-to))`,
        }}
      >
        <div className="mx-auto max-w-3xl px-3 py-3">
          <div className="flex items-center justify-between gap-3 text-white">
            <PlayerScore
              name={state.p1.name}
              avatar={state.p1.avatar}
              score={state.p1.score}
              active={activeKey === "p1"}
            />
            <Logo />
            <PlayerScore
              name={state.p2.name}
              avatar={state.p2.avatar}
              score={state.p2.score}
              active={activeKey === "p2"}
            />
          </div>
        </div>
      </header>
    );
  }

  function PlayerScore({ name, avatar, score, active }) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 rounded-2xl overflow-hidden ring-2 ring-white/60 shadow">
          {avatar ? (
            <img src={avatar} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-white/10 grid place-items-center">🙂</div>
          )}
        </div>
        <div
          className={`pill score-pill text-xl ${active ? "" : "opacity-80"}`}
          title={active ? "Παίζει τώρα" : "Εκτός σειράς"}
        >
          {score}
        </div>
      </div>
    );
  }

  function StageCard({ children }) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 py-4">
        <div
          className="rounded-2xl p-4 md:p-6 shadow-card"
          style={{ background: "var(--brand-card)", border: "1px solid var(--brand-border)" }}
        >
          {children}
        </div>
      </div>
    );
  }

  function SetupStage() {
    return (
      <StageCard>
        <div className="flex items-center justify-between">
          <Logo />
          <button className="btn btn-neutral" onClick={resetMatch}>Επαναφορά</button>
        </div>

        <h2 className="mt-4 font-display text-2xl font-extrabold text-white">Δύο Παίκτες — Ρυθμίσεις</h2>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {["p1", "p2"].map((k) => (
            <div key={k} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-slate-200 font-semibold mb-2">{k.toUpperCase()}</div>
              <label className="block text-sm text-slate-300 mb-1">Όνομα</label>
              <input
                className="w-full rounded-xl bg-slate-900/60 px-4 py-2 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-pink-400"
                value={state[k].name}
                onChange={(e) => setState((st) => ({ ...st, [k]: { ...st[k], name: e.target.value } }))}
              />
              <label className="block text-sm text-slate-300 mt-3 mb-1">Avatar URL (προαιρετικό)</label>
              <input
                className="w-full rounded-xl bg-slate-900/60 px-4 py-2 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-pink-400"
                value={state[k].avatar}
                onChange={(e) => setState((st) => ({ ...st, [k]: { ...st[k], avatar: e.target.value } }))}
                placeholder="https://…"
              />
              <div className="mt-3 text-xs text-slate-400">Βοήθειες διαθέσιμες: 3</div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button className="btn btn-accent" onClick={() => setStage(STAGES.CATEGORY)}>
            Ξεκίνα Αγώνα
          </button>
        </div>

        <div className="mt-6 text-slate-300 text-sm">
          Οι κατηγορίες και ο αριθμός ερωτήσεων προκύπτουν από το <code>questions.js</code>. 
          Η δυσκολία ξεκλειδώνει τμηματικά: <strong>Α</strong> → <strong>Β</strong> → <strong>Γ</strong>.
        </div>
      </StageCard>
    );
  }

  function CategoryStage() {
    const selectedPhase = myPhase;

    const byCategory = useMemo(() => {
      const map = new Map();
      for (const q of availableQuestions) {
        if (!map.has(q.category)) map.set(q.category, []);
        map.get(q.category).push(q);
      }
      for (const [k, arr] of map) {
        arr.sort((a, b) => a.points - b.points || (a.order || 0) - (b.order || 0));
      }
      return Array.from(map.entries());
    }, [availableQuestions]);

    function isLocked(q) {
      return q.phase && q.phase !== selectedPhase;
    }

    function onPick(q) {
      setState((st) => ({
        ...st,
        stage: STAGES.READY,
        current: {
          ...st.current,
          selectedQuestionId: q.id,
          x2ThisTurn: false,
          usedHelpThisQuestion: false,
          fiftyEnabledIds: [],
          hintShown: false,
          stealOffered: false,
          stealAccepted: false,
          stealBy: null,
          answerValue: null,
          revealChoices: null,
        },
      }));
    }

    return (
      <StageCard>
        <div className="flex items-center justify-between">
          <Logo />
          <div className="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-semibold text-white">
            Σειρά: {state[activeKey].name} • Φάση {selectedPhase}
          </div>
        </div>

        <h3 className="mt-4 font-display text-xl font-bold text-white">Κατηγορίες</h3>
        <div className="mt-2 text-slate-300 text-sm">
          Επίλεξε ερώτηση διαθέσιμη για τη φάση <strong>{selectedPhase}</strong>.
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {byCategory.length === 0 && (
            <div className="text-slate-300">Δεν υπάρχουν διαθέσιμες ερωτήσεις. Προχώρα στο τελικό.</div>
          )}
          {byCategory.map(([cat, arr]) => (
            <div key={cat} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="rounded-xl px-3 py-2 text-white font-semibold" style={{ background: "rgba(255,255,255,0.06)" }}>
                  {cat}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {arr.map((q) => {
                  const locked = isLocked(q);
                  return (
                    <button
                      key={q.id}
                      className="h-9 min-w-9 rounded-full px-3 text-white text-sm font-semibold shadow relative"
                      title={locked ? "Ξεκλειδώνει αργότερα" : `${q.points} πόντοι`}
                      style={{
                        background: locked ? "rgba(148,163,184,0.25)" : THEME.badgeGradient,
                        opacity: locked ? 0.5 : 1,
                        border: "1px solid rgba(255,255,255,0.18)",
                      }}
                      aria-label={locked ? "Κλειδωμένο" : `Ερώτηση ${q.points} πόντοι`}
                      disabled={locked}
                      onClick={() => onPick(q)}
                    >
                      x{q.points}
                      {locked && <span className="absolute -top-1 -right-1 text-xs" aria-hidden>🔒</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-center">
          <button className="btn btn-neutral" onClick={resetMatch}>Reset Match</button>
        </div>
      </StageCard>
    );
  }

  function ReadyStage() {
    const q = useMemo(
      () => RAW_QUESTIONS.find((x) => x.id === state.current.selectedQuestionId),
      [state.current.selectedQuestionId]
    );
    if (!q) return null;
    const canUseX2 =
      activePlayer.helpsLeft > 0 && !state.current.usedHelpThisQuestion;

    function continueReveal(x2) {
      setState((st) => ({
        ...st,
        stage: STAGES.QUESTION,
        current: { ...st.current, x2ThisTurn: !!x2, usedHelpThisQuestion: !!x2 },
        [activeKey]: x2
          ? { ...st[activeKey], helpsLeft: Math.max(0, st[activeKey].helpsLeft - 1) }
          : st[activeKey],
      }));
    }

    return (
      <StageCard>
        <div className="flex items-center justify-between">
          <Logo />
          <div className="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-semibold text-white">
            {q.difficulty || `Δυσκολία ${q.phase || "?"}`} • {q.points} πόντοι
          </div>
        </div>
        <h3 className="mt-4 font-display text-2xl font-bold text-white">
          Έτοιμος; Αυτή η ερώτηση δίνει {q.points} πόντους.
        </h3>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button className="btn btn-accent" onClick={() => continueReveal(false)} aria-label="Αποκάλυψη ερώτησης">
            Αποκάλυψη
          </button>
          <button
            className="btn btn-neutral"
            onClick={() => continueReveal(true)}
            disabled={!canUseX2}
            aria-label="Χρήση Χ2 και αποκάλυψη"
            title={canUseX2 ? "Χ2 (πριν την αποκάλυψη)" : "Δεν είναι διαθέσιμο"}
          >
            Χρήση ×2 &amp; Αποκάλυψη
          </button>
        </div>

        <div className="mt-6 text-slate-300 text-sm">
          Βοήθειες {activeKey.toUpperCase()}: διαθέσιμες {activePlayer.helpsLeft}. Το Χ2 καταναλώνει 1 βοήθεια και δεν συνδυάζεται με άλλες.
        </div>
      </StageCard>
    );
  }

  // Build multiple-choice from catalog for 50/50
  const buildChoicesRef = useRef(null);
  useEffect(() => {
    buildChoicesRef.current = async (q) => {
      if (q.answerMode !== "catalog") return null;
      const { getCatalog } = await import("./lib/catalogs");
      const { items } = await getCatalog(q.catalog);
      const correctName = q.answer;
      const pool = items.filter((it) => it.name !== correctName);
      const pick = [];
      for (let i = 0; i < 3 && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        pick.push(pool.splice(idx, 1)[0]);
      }
      const options = [
        { id: "correct", label: correctName, isCorrect: true },
        ...pick.map((it, k) => ({ id: `d${k + 1}`, label: it.name, isCorrect: false })),
      ];
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      return options;
    };
  }, []);

  function QuestionStage() {
    const q = useMemo(
      () => RAW_QUESTIONS.find((x) => x.id === state.current.selectedQuestionId),
      [state.current.selectedQuestionId]
    );
    const [inputValue, setInputValue] = useState("");
    const [scoreValue, setScoreValue] = useState({ home: 0, away: 0 });

    useEffect(() => {
      let mounted = true;
      (async () => {
        if (q && q.answerMode === "catalog" && !state.current.revealChoices) {
          const opts = await buildChoicesRef.current(q);
          if (mounted && opts)
            setState((st) => ({ ...st, current: { ...st.current, revealChoices: opts } }));
        }
      })();
      return () => { mounted = false; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q?.id]);

    const canUsePostHelps =
      activePlayer.helpsLeft > 0 &&
      !state.current.usedHelpThisQuestion &&
      !state.current.x2ThisTurn;

    function useFifty() {
      if (!canUsePostHelps || !state.current.revealChoices) return;
      const wrongs = state.current.revealChoices.filter((c) => !c.isCorrect);
      const toHide = wrongs.slice(0, 2).map((c) => c.id);
      setState((st) => ({
        ...st,
        current: { ...st.current, usedHelpThisQuestion: true, fiftyEnabledIds: toHide },
        [activeKey]: { ...st[activeKey], helpsLeft: Math.max(0, st[activeKey].helpsLeft - 1) },
      }));
    }

    function useHint() {
      if (!canUsePostHelps) return;
      setState((st) => ({
        ...st,
        current: { ...st.current, usedHelpThisQuestion: true, hintShown: true },
        [activeKey]: { ...st[activeKey], helpsLeft: Math.max(0, st[activeKey].helpsLeft - 1) },
      }));
    }

    async function submitAnswer(raw) {
      setState((st) => ({ ...st, current: { ...st.current, answerValue: raw } }));
      setStage(STAGES.ANSWER);
      if (q.answerMode !== "text") {
        const result = await validateAny(q, raw);
        resolveOwnTurn(result.correct);
      }
    }

    function passAnswer() {
      setState((st) => ({ ...st, current: { ...st.current, answerValue: "" } }));
      setStage(STAGES.ANSWER);
      resolveOwnTurn(false, true);
    }

    return (
      <StageCard>
        <div className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-semibold text-white">
              {q.points} πόντοι
            </div>
            {state.current.x2ThisTurn && (
              <div className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: THEME.badgeGradient }}>
                ×2
              </div>
            )}
          </div>
        </div>

        <h3 className="mt-4 font-display text-2xl font-bold text-white">{q.prompt}</h3>

        {q.media ? (
          <div className="mt-4">
            <Media media={{ ...q.media, priority: true }} />
          </div>
        ) : null}

        <div className="mt-5">
          {q.answerMode === "catalog" && (
            <>
              {state.current.revealChoices ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {state.current.revealChoices.map((c) => {
                    const hidden = state.current.fiftyEnabledIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={hidden}
                        className="rounded-2xl px-4 py-3 text-left text-white ring-1 ring-white/10"
                        style={{
                          background: hidden ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)",
                          opacity: hidden ? 0.4 : 1,
                        }}
                        onClick={() => submitAnswer(c.label)}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <AutoCompleteAnswer
                  catalog={q.catalog}
                  placeholder="Άρχισε να πληκτρολογείς…"
                  onSelect={(item) => submitAnswer(item?.name || "")}
                  onChangeText={(t) => setInputValue(t)}
                />
              )}
              <div className="flex flex-wrap gap-3 justify-center mt-3">
                {!state.current.revealChoices && (
                  <button className="btn btn-accent" onClick={() => submitAnswer(inputValue)}>
                    Υποβολή
                  </button>
                )}
                <button className="btn btn-neutral" onClick={passAnswer}>Πάσο</button>
              </div>
            </>
          )}

          {q.answerMode === "scoreline" && (
            <div className="flex flex-col items-center gap-3">
              <ScoreInput value={scoreValue} onChange={setScoreValue} />
              <div className="flex flex-wrap gap-3 justify-center">
                <button className="btn btn-accent" onClick={() => submitAnswer(scoreValue)}>
                  Υποβολή σκορ
                </button>
                <button className="btn btn-neutral" onClick={passAnswer}>Πάσο</button>
              </div>
            </div>
          )}

          {q.answerMode === "numeric" && (
            <form
              className="flex flex-col items-stretch gap-3"
              onSubmit={(e) => { e.preventDefault(); submitAnswer(inputValue); }}
            >
              <input
                type="number"
                inputMode="numeric"
                className="w-full rounded-xl bg-slate-900/60 px-4 py-3 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-pink-400"
                placeholder="Πληκτρολόγησε αριθμό…"
                value={inputValue ?? ""}
                onChange={(e) => setInputValue(e.target.value)}
              />
              <div className="flex flex-wrap gap-3 justify-center">
                <button type="submit" className="btn btn-accent">Υποβολή</button>
                <button type="button" className="btn btn-neutral" onClick={passAnswer}>Πάσο</button>
              </div>
            </form>
          )}

          {q.answerMode === "text" && (
            <form
              className="flex flex-col items-stretch gap-3"
              onSubmit={(e) => { e.preventDefault(); submitAnswer(inputValue); }}
            >
              <input
                className="w-full rounded-xl bg-slate-900/60 px-4 py-3 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-pink-400"
                placeholder="Γράψε την απάντησή σου…"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <div className="flex flex-wrap gap-3 justify-center">
                <button type="submit" className="btn btn-accent">Υποβολή</button>
                <button type="button" className="btn btn-neutral" onClick={passAnswer}>Πάσο</button>
              </div>
            </form>
          )}
        </div>

        {/* Post-reveal helps */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
          <button
            className="btn btn-neutral"
            onClick={useFifty}
            disabled={!canUsePostHelps || !state.current.revealChoices}
            title={
              state.current.x2ThisTurn
                ? "Το Χ2 δεν συνδυάζεται"
                : !state.current.revealChoices
                ? "Διαθέσιμο μόνο σε ερωτήσεις καταλόγου"
                : "Κρύψε 2 λάθος επιλογές"
            }
          >
            50/50
          </button>
          <button
            className="btn btn-neutral"
            onClick={useHint}
            disabled={!canUsePostHelps || !q.hint}
            title={
              state.current.x2ThisTurn
                ? "Το Χ2 δεν συνδυάζεται"
                : q.hint
                ? "Σύντομη βοήθεια"
                : "Δεν υπάρχει hint"
            }
          >
            Hint
          </button>
          {state.current.hintShown && q.hint && (
            <div className="text-slate-200 italic text-center">{q.hint}</div>
          )}
        </div>
      </StageCard>
    );
  }

  function AnswerStage() {
    const q = RAW_QUESTIONS.find((x) => x.id === state.current.selectedQuestionId);
    if (!q) return null;

    const [result, setResult] = useState(null);
    useEffect(() => {
      let live = true;
      (async () => {
        if (q.answerMode === "text") {
          const r = await validateAny(q, state.current.answerValue);
          if (live) {
            setResult(r);
            resolveOwnTurn(r.correct);
          }
        } else {
          setResult(null);
        }
      })();
      return () => { live = false; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const userAnswerStr = prettyAnswer(q, state.current.answerValue);

    return (
      <StageCard>
        <div className="flex items-center justify-between">
          <Logo />
          <div className="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-semibold text-white">
            {q.points} πόντοι
          </div>
        </div>

        <div className="text-center mt-4">
          <div className="font-display text-3xl font-extrabold text-white">{q.answer}</div>
          <div className="mt-3 font-ui text-sm">
            <div
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: "rgba(148,163,184,0.10)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <span style={{ opacity: 0.85 }}>Απάντηση Παίκτη:</span>
              <span className="italic text-slate-100">{userAnswerStr || "—"}</span>
            </div>
          </div>
          {q.fact && <div className="mt-2 font-ui text-sm text-slate-300">ℹ️ {q.fact}</div>}
        </div>

        {state.current.stealOffered && state.current.stealBy == null && <StealPrompt />}

        {!state.current.stealOffered && (
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              className="btn btn-accent"
              onClick={() => {
                const wasCorrect = state.__lastOwnTurnCorrect === true;
                if (!wasCorrect) {
                  setState((st) => ({ ...st, current: { ...st.current, stealOffered: true } }));
                } else {
                  finishTurnAdvance();
                }
              }}
            >
              Συνέχεια
            </button>
          </div>
        )}
      </StageCard>
    );
  }

  function StealPrompt() {
    const q = RAW_QUESTIONS.find((x) => x.id === state.current.selectedQuestionId);
    const halfPts = ceilHalf(q.points);

    return (
      <div className="mt-6">
        <div className="rounded-2xl p-4 text-white" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="font-semibold mb-2">
            {state[otherKey].name}: Κλέβεις για {halfPts} πόντους; (χωρίς βοήθειες)
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              className="btn btn-accent"
              onClick={() =>
                setState((st) => ({
                  ...st,
                  stage: STAGES.STEAL_TURN,
                  current: { ...st.current, stealAccepted: true, stealBy: otherKey },
                }))
              }
            >
              Κλέψε
            </button>
            <button className="btn btn-neutral" onClick={() => finishTurnAdvance()}>
              Παράλειψη
            </button>
          </div>
        </div>
      </div>
    );
  }

  function StealTurn() {
    const q = RAW_QUESTIONS.find((x) => x.id === state.current.selectedQuestionId);
    const stealerKey = state.current.stealBy;
    if (!stealerKey || !q) return null;
    const [inputValue, setInputValue] = useState("");
    const [scoreValue, setScoreValue] = useState({ home: 0, away: 0 });

    async function submit(raw) {
      const res = await validateAny(q, raw);
      applyStealResolution(res.correct);
    }

    return (
      <StageCard>
        <div className="flex items-center justify-between">
          <Logo />
          <div className="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-semibold text-white">
            Κλέψιμο — {ceilHalf(q.points)} πόντοι
          </div>
        </div>

        <h3 className="mt-4 font-display text-2xl font-bold text-white">
          {state[stealerKey].name}: Απόπειρα κλεψίματος
        </h3>

        <div className="mt-2 text-slate-300 text-sm">Καμία βοήθεια δεν επιτρέπεται.</div>

        {q.answerMode === "catalog" && (
          <AutoCompleteAnswer
            catalog={q.catalog}
            placeholder="Άρχισε να πληκτρολογείς…"
            onSelect={(item) => submit(item?.name || "")}
            onChangeText={(t) => setInputValue(t)}
          />
        )}
        {q.answerMode === "scoreline" && (
          <>
            <div className="mt-3" />
            <ScoreInput value={scoreValue} onChange={setScoreValue} />
          </>
        )}
        {(q.answerMode === "numeric" || q.answerMode === "text") && (
          <input
            className="mt-4 w-full rounded-xl bg-slate-900/60 px-4 py-3 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-pink-400"
            placeholder="Απάντηση…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {q.answerMode === "scoreline" ? (
            <button className="btn btn-accent" onClick={() => submit(scoreValue)}>
              Υποβολή
            </button>
          ) : (
            <button className="btn btn-accent" onClick={() => submit(inputValue)}>
              Υποβολή
            </button>
          )}
          <button className="btn btn-neutral" onClick={() => applyStealResolution(false)}>
            Πάσο
          </button>
        </div>
      </StageCard>
    );
  }

  function FinaleWagerStage() {
    if (!state.finale.enabled) return <ResultsStage />;
    const finQ = finals[0];

    function maxWager(score) {
      return Math.floor(score * 0.5);
    }

    const [w1, w2] = [state.finale.wagerP1, state.finale.wagerP2];

    return (
      <StageCard>
        <div className="flex items-center justify-between">
          <Logo />
          <div className="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-semibold text-white">Τελικός</div>
        </div>

        <h3 className="mt-4 font-display text-2xl font-bold text-white">Ποντάρισμα (0–50% του σκορ)</h3>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <WagerBox
            label={state.p1.name}
            value={w1}
            onChange={(n) =>
              setState((st) => ({
                ...st,
                finale: { ...st.finale, wagerP1: clamp(n, 0, maxWager(st.p1.score)) },
              }))
            }
            max={maxWager(state.p1.score)}
          />
          <WagerBox
            label={state.p2.name}
            value={w2}
            onChange={(n) =>
              setState((st) => ({
                ...st,
                finale: { ...st.finale, wagerP2: clamp(n, 0, maxWager(st.p2.score)) },
              }))
            }
            max={maxWager(state.p2.score)}
          />
        </div>

        <div className="mt-5 flex justify-center gap-3">
          <button
            className="btn btn-accent"
            onClick={() =>
              setState((st) => ({
                ...st,
                stage: STAGES.FINALE_PLAY,
                finale: { ...st.finale, phase: "play", currentPlayer: "p1" },
              }))
            }
          >
            Συνέχεια στον Τελικό
          </button>
        </div>

        <div className="mt-5 text-slate-300 text-sm">
          Ερώτηση τελικού: <em>{finQ?.prompt}</em>
        </div>
      </StageCard>
    );
  }

  function FinalePlayStage() {
    const finQ = finals[0];
    const who = state.finale.currentPlayer;
    const [value, setValue] = useState("");
    const [scoreValue, setScoreValue] = useState({ home: 0, away: 0 });

    async function submitFinal() {
      const res = await validateAny(finQ, finQ.answerMode === "scoreline" ? scoreValue : value);
      const wager = who === "p1" ? state.finale.wagerP1 : state.finale.wagerP2;
      const correct = !!res.correct;
      setState((st) => {
        const next = { ...st };
        const delta = correct ? wager : -wager;
        next[who] = { ...next[who], score: finalizePoints(next[who].score + delta) };
        if (who === "p1") {
          next.finale.currentPlayer = "p2";
        } else {
          next.finale.done = true;
          next.stage = STAGES.RESULTS;
        }
        return next;
      });
    }

    return (
      <StageCard>
        <div className="flex items-center justify-between">
          <Logo />
          <div className="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-semibold text-white">Τελικός</div>
        </div>

        <h3 className="mt-4 font-display text-2xl font-bold text-white">{state[who].name}</h3>
        <div className="mt-2 text-slate-300 text-sm">Απάντησε στην τελική ερώτηση.</div>

        {finQ.media ? (
          <div className="mt-4">
            <Media media={{ ...finQ.media, priority: true }} />
          </div>
        ) : null}

        {finQ.answerMode === "scoreline" && (
          <div className="mt-3">
            <ScoreInput value={scoreValue} onChange={setScoreValue} />
          </div>
        )}
        {(finQ.answerMode === "numeric" || finQ.answerMode === "text") && (
          <input
            className="mt-4 w-full rounded-xl bg-slate-900/60 px-4 py-3 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-pink-400"
            placeholder="Απάντηση…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        {finQ.answerMode === "catalog" && (
          <AutoCompleteAnswer
            catalog={finQ.catalog}
            placeholder="Άρχισε να πληκτρολογείς…"
            onSelect={(item) => setValue(item?.name || "")}
            onChangeText={(t) => setValue(t)}
          />
        )}

        <div className="mt-4 flex justify-center">
          <button className="btn btn-accent" onClick={submitFinal}>
            Υποβολή
          </button>
        </div>
      </StageCard>
    );
  }

  function ResultsStage() {
    return (
      <StageCard>
        <div className="flex items-center justify-between">
          <Logo />
          <button className="btn btn-neutral" onClick={resetMatch}>Νέος Αγώνας</button>
        </div>

        <h3 className="mt-4 font-display text-2xl font-bold text-white">Αποτελέσματα</h3>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[["p1", state.p1], ["p2", state.p2]].map(([k, p]) => (
            <div key={k} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 rounded-2xl overflow-hidden ring-2 ring-white/60 shadow">
                  {p.avatar ? (
                    <img src={p.avatar} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-white/10 grid place-items-center">🙂</div>
                  )}
                </div>
                <div className="text-white font-bold text-lg">{p.name}</div>
                <div className="ml-auto pill score-pill">{p.score}</div>
              </div>
            </div>
          ))}
        </div>
      </StageCard>
    );
  }

  // ——— Flow helpers ———
  function prettyAnswer(q, raw) {
    if (!raw && raw !== 0) return "";
    if (q.answerMode === "scoreline" && raw && typeof raw === "object") {
      return `${raw.home ?? 0} - ${raw.away ?? 0}`;
    }
    if (q.answerMode === "numeric" && raw && typeof raw === "object") {
      return raw.value != null ? String(raw.value) : "—";
    }
    return String(raw);
  }

  async function validateAny(q, value) {
    const mode = q.answerMode || "text";
    if (mode === "numeric") {
      let got = null;
      if (value === "" || value === null || value === undefined) {
        got = null;
      } else if (typeof value === "object" && value !== null && "value" in value) {
        got = Number(value.value);
      } else {
        got = Number(value);
      }
      if (!Number.isFinite(got)) got = null;
      if (got === null) return { correct: false };
      const allowed = Array.isArray(q.acceptNumbers) && q.acceptNumbers.length
        ? q.acceptNumbers.map((x) => Number(x)).filter((x) => Number.isFinite(x))
        : [Number(q.acceptNumber ?? q.answer)];
      return { correct: allowed.includes(got) };
    }
    return baseValidate(q, value);
  }

  function resolveOwnTurn(correct, isPass = false) {
    const q = RAW_QUESTIONS.find((x) => x.id === state.current.selectedQuestionId);
    const base = q.points * (state.current.x2ThisTurn ? 2 : 1);
    let delta = 0;

    if (correct) {
      const mult = streakMultiplier(state[activeKey].streak + 1);
      delta = finalizePoints(base * mult);
    } else {
      delta = 0;
    }

    setState((st) => {
      const next = { ...st };
      next.__lastOwnTurnCorrect = !!correct;
      if (!correct || isPass) {
        next.current.stealOffered = true;
      } else {
        next[activeKey] = {
          ...next[activeKey],
          score: finalizePoints(next[activeKey].score + delta),
          streak: next[activeKey].streak + 1,
        };
      }
      return next;
    });
  }

  function applyStealResolution(correct) {
    const q = RAW_QUESTIONS.find((x) => x.id === state.current.selectedQuestionId);
    const stealPts = ceilHalf(q.points);
    setState((st) => {
      const next = { ...st };
      if (correct) {
        next[state.current.stealBy] = {
          ...next[state.current.stealBy],
          score: finalizePoints(next[state.current.stealBy].score + stealPts),
        };
      }
      finishTurnAdvance(next);
      return next;
    });
  }

  function finishTurnAdvance(prev) {
    setState((st0) => {
      const st = prev ? prev : { ...st0 };

      if (!st.__lastOwnTurnCorrect) {
        st[activeKey] = { ...st[activeKey], streak: 0 };
      }

      if (st.current.selectedQuestionId && !st.usedQuestionIds.includes(st.current.selectedQuestionId)) {
        st.usedQuestionIds = [...st.usedQuestionIds, st.current.selectedQuestionId];
      }

      st.current = {
        selectedQuestionId: null,
        x2ThisTurn: false,
        usedHelpThisQuestion: false,
        fiftyEnabledIds: [],
        hintShown: false,
        stealOffered: false,
        stealAccepted: false,
        stealBy: null,
        answerValue: null,
        revealChoices: null,
      };

      const nextActive = activeKey === "p1" ? "p2" : "p1";
      st.perPlayerTurnsTaken[activeKey] = (st.perPlayerTurnsTaken[activeKey] || 0) + 1;
      st.turnIndex += 1;

      const left = nonFinals.filter((q) => !st.usedQuestionIds.includes(q.id)).length;
      if (left <= 0) {
        if (st.finale.enabled) st.stage = STAGES.FINALE_WAGER;
        else st.stage = STAGES.RESULTS;
      } else {
        st.active = nextActive;
        st.stage = STAGES.CATEGORY;
      }
      return st;
    });
  }

  function WagerBox({ label, value, onChange, max }) {
    return (
      <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="text-slate-200 font-semibold mb-2">{label}</div>
        <div className="flex items-center gap-2">
          <button className="btn btn-neutral" onClick={() => onChange(value - 1)} aria-label="Μείωση">−</button>
          <div className="pill text-white" style={{ background: THEME.badgeGradient, minWidth: 72, textAlign: "center" }}>
            {value}
          </div>
          <button className="btn btn-neutral" onClick={() => onChange(value + 1)} aria-label="Αύξηση">+</button>
        </div>
        <div className="mt-2 text-xs text-slate-400">Μέγιστο: {max}</div>
      </div>
    );
  }

  // ——— Render ———
  return (
    <div
      className="min-h-screen text-white"
      style={{ background: `linear-gradient(135deg, var(--brand-grad-from), var(--brand-grad-to))` }}
    >
      <ScoreHeader />

      {state.stage === STAGES.SETUP && <SetupStage />}
      {state.stage === STAGES.CATEGORY && <CategoryStage />}
      {state.stage === STAGES.READY && <ReadyStage />}
      {state.stage === STAGES.QUESTION && <QuestionStage />}
      {state.stage === STAGES.ANSWER && <AnswerStage />}
      {state.stage === STAGES.STEAL_TURN && <StealTurn />}
      {state.stage === STAGES.FINALE_WAGER && <FinaleWagerStage />}
      {state.stage === STAGES.FINALE_PLAY && <FinalePlayStage />}
      {state.stage === STAGES.RESULTS && <ResultsStage />}

      <div className="pb-16" />
    </div>
  );
}
