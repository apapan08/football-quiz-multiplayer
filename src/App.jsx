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

const AVATAR_P1 = '/Player1Avatar.png';
const AVATAR_P2 = '/Player2Avatar.png';


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

// Phases are unlocked strictly from questions.js:
// While any A remains → only A playable; else while any B remains → only B; else C.
function currentUnlockedPhase(allNonFinals, usedIds) {
  const remainBy = (ph) =>
    allNonFinals.some((q) => q.phase === ph && !usedIds.includes(q.id));
  if (remainBy("A")) return "A";
  if (remainBy("B")) return "B";
  return "C";
}

function finalizePoints(p) {
  return Math.max(0, Math.round(p));
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

function ConfirmDialog({ isOpen, onClose, onConfirm, title, description }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div
        className="w-[min(92vw,400px)] rounded-2xl bg-slate-800 ring-1 ring-white/10 p-4 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="text-lg text-slate-100 font-bold mb-2">{title}</div>
        <div className="text-sm text-slate-300 mb-4">{description}</div>
        <div className="flex justify-end gap-3">
          <button className="btn btn-neutral" onClick={onClose}>
            Άκυρο
          </button>
          <button className="btn btn-accent" onClick={onConfirm}>
            Επιβεβαίωση
          </button>
        </div>
      </div>
    </div>
  );
}

function SetupStage({ state, setState, setStage }) {
  return (
    <StageCard>
      <div className="flex items-center justify-between">
        <Logo />
      </div>

      <h2 className="mt-4 font-display text-2xl font-extrabold text-white">Δύο Παίκτες — Ρυθμίσεις</h2>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {["p1", "p2"].map((k) => (
          <div key={k} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="text-slate-200 font-semibold mb-2">{k === 'p1' ? 'Παίκτης 1' : 'Παίκτης 2'}</div>
            <label className="block text-sm text-slate-300 mb-1">Όνομα</label>
            <input
              className="w-full rounded-xl bg-slate-900/60 px-4 py-2 text-slate-100 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-pink-400 placeholder:text-slate-500"
              value={state[k].name}
              onChange={(e) => setState((st) => ({ ...st, [k]: { ...st[k], name: e.target.value } }))}
              placeholder="Γραψε το ονομα σου.."
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button className="btn btn-accent" onClick={() => setStage(STAGES.CATEGORY)}>
          Ξεκίνα Αγώνα
        </button>
      </div>
    </StageCard>
  );
}

function QuestionStage({
  q,
  state,
  activePlayer,
  canUseFiftyNow,
  canUseHintNow,
  useFiftyHelp,
  useHintHelp,
  prettyAnswer,
  submitAnswer,
  passAnswer,
  askForConfirmation,
}) {
  const [inputValue, setInputValue] = useState("");
  const [scoreValue, setScoreValue] = useState({ home: 0, away: 0 });

  if (!q) return null;

  const canUseFifty = canUseFiftyNow();
  const canUseHint = canUseHintNow();

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
          <Media key={`media-${q.id}-${state.current.mediaRefreshToken || 0}`} media={{ ...q.media, priority: true }} />
        </div>
      ) : null}

      <div className="mt-5">
        {q.answerMode === "MultipleChoice" && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {q.choices?.map((choice) => (
              <button
                key={choice}
                className="btn btn-neutral w-full text-center"
                onClick={() => submitAnswer(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        )}
        {q.answerMode === "catalog" && (
          <>
            <AutoCompleteAnswer
              catalog={q.catalog}
              placeholder="Άρχισε να πληκτρολογείς…"
              onSelect={(item) => submitAnswer(item?.name || "")}
              onChangeText={(t) => setInputValue(t)}
            />
            <div className="flex flex-wrap gap-3 justify-center mt-3">
              <button className="btn btn-accent" onClick={() => submitAnswer(inputValue)}>
                Υποβολή
              </button>
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
            onSubmit={(e) => { e.preventDefault(); submitAnswer(Number(inputValue)); }}
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

      {/* Post-reveal helps (mirrored with header behavior) */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
        <button
          className="btn btn-neutral"
          onClick={() => askForConfirmation("Ενεργοποίηση 50/50;", "Θα εμφανιστούν δύο πιθανές απαντήσεις. Μια σωστή απάντηση με αυτή τη βοήθεια θα σου δώσει μόνο 1 πόντο. Είσαι σίγουρος;", useFiftyHelp)}
          disabled={!canUseFifty || !(Array.isArray(q.fifty) && q.fifty.length === 2)}
          title={
            !activePlayer.hasFifty
              ? "Boήθεια 50/50 έχει ήδη χρησιμοποιηθεί"
              : state.current.x2ThisTurn
              ? "Το Χ2 δεν συνδυάζεται"
              : Array.isArray(q.fifty) && q.fifty.length === 2
              ? "Δείξε 2 επιλογές 50/50"
              : "Δεν υπάρχει διαθέσιμο 50/50 γι’ αυτή την ερώτηση"
          }
        >
          {activePlayer.hasFifty ? "50/50" : "50/50 Used"}
        </button>
        <button
          className="btn btn-neutral"
          onClick={() => askForConfirmation("Χρήση Βοήθειας (Hint);", "Θα εμφανιστεί μια μικρή βοήθεια. Μια σωστή απάντηση με αυτή τη βοήθεια θα σου δώσει μόνο 1 πόντο. Είσαι σίγουρος;", useHintHelp)}
          disabled={!canUseHint || !q.hint}
          title={
            !activePlayer.hasHint
              ? "Boήθεια Hint έχει ήδη χρησιμοποιηθεί"
              : state.current.x2ThisTurn
              ? "Το Χ2 δεν συνδυάζεται"
              : q.hint
              ? "Σύντομη βοήθεια"
              : "Δεν υπάρχει hint"
          }
        >
          {activePlayer.hasHint ? "Hint" : "Hint Used"}
        </button>
        {Array.isArray(state.current.fiftyQuickOptions) && state.current.fiftyQuickOptions.length === 2 && (
          <div className="text-slate-200 italic text-center">50/50: {state.current.fiftyQuickOptions.map(opt => prettyAnswer(q, opt)).join('  ή  ')}</div>
        )}
        {state.current.hintShown && q.hint && (
          <div className="text-slate-200 italic text-center">{q.hint}</div>
        )}
      </div>
    </StageCard>
  );
}


// ——— Main App ———
export default function App() {
  useBrandCSS();

  const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', description: '', onConfirm: () => {} });

  const askForConfirmation = (title, description, onConfirm) => {
      setConfirmState({
      isOpen: true,
      title,
      description,
      onConfirm: () => {
          onConfirm();
          setConfirmState({ isOpen: false, title: '', description: '', onConfirm: () => {} });
      },
      });
  };

  const closeConfirmation = () => {
      setConfirmState({ isOpen: false, title: '', description: '', onConfirm: () => {} });
  };

  const nonFinals = useMemo(
    () =>
      RAW_QUESTIONS.slice().sort((a, b) => (a.order || 0) - (b.order || 0)),
    []
  );

  // Persistent match state
  const [state, setState] = usePersistentState("two_player_quiz_state_v1", {
    stage: STAGES.SETUP,
    p1: { name: "", avatar: AVATAR_P1, score: 0, streak: 0, hasX2: true, hasFifty: true, hasHint: true, usedX2Ids: [] },
    p2: { name: "", avatar: AVATAR_P2, score: 0, streak: 0, hasX2: true, hasFifty: true, hasHint: true, usedX2Ids: [] },
    active: "p1",
    usedQuestionIds: [],
    turnIndex: 0,
    perPlayerTurnsTaken: { p1: 0, p2: 0 },
    current: {
      selectedQuestionId: null,
      x2ThisTurn: false,
      usedHelpThisQuestion: false,
      fiftyEnabledIds: [],
      fiftyQuickOptions: null,
      hintShown: false,
      mediaRefreshToken: 0,
      stealOffered: false,
      stealAccepted: false,
      stealBy: null,
      answerValue: null,
      revealChoices: null,
    },
    __lastOwnTurnCorrect: null,
  });

  const setStage = (s) => setState((st) => ({ ...st, stage: s }));

  const activeKey = state.active;
  const otherKey = activeKey === "p1" ? "p2" : "p1";
  const activePlayer = state[activeKey];

  // Global phase (A→B→C) based on used questions
  const myPhase = useMemo(
    () => currentUnlockedPhase(nonFinals, state.usedQuestionIds),
    [nonFinals, state.usedQuestionIds]
  );

  function resetMatch() {
    setState((_) => ({
      stage: STAGES.SETUP,
      p1: { name: "", avatar: AVATAR_P1, score: 0, streak: 0, hasX2: true, hasFifty: true, hasHint: true, usedX2Ids: [] },
      p2: { name: "", avatar: AVATAR_P2, score: 0, streak: 0, hasX2: true, hasFifty: true, hasHint: true, usedX2Ids: [] },
      active: "p1",
      usedQuestionIds: [],
      turnIndex: 0,
      perPlayerTurnsTaken: { p1: 0, p2: 0 },
      current: {
        selectedQuestionId: null,
        x2ThisTurn: false,
        usedHelpThisQuestion: false,
        fiftyEnabledIds: [],
        fiftyQuickOptions: null,
        hintShown: false,
        mediaRefreshToken: 0,
        stealOffered: false,
        stealAccepted: false,
        stealBy: null,
        answerValue: null,
        revealChoices: null,
      },
      __lastOwnTurnCorrect: null,
    }));
  }

  // ——— Central helpers so both header + stages share identical transitions ———
  const getCurrentQuestion = () =>
    RAW_QUESTIONS.find((x) => x.id === state.current.selectedQuestionId) || null;

  const canUseX2Now = () =>
    state.stage === STAGES.READY &&
    activePlayer.hasX2 &&
    !state.current.usedHelpThisQuestion;

  const canUseFiftyNow = () =>
    state.stage === STAGES.QUESTION &&
    activePlayer.hasFifty &&
    !state.current.x2ThisTurn &&
    !state.current.usedHelpThisQuestion;

  const canUseHintNow = () =>
    state.stage === STAGES.QUESTION &&
    activePlayer.hasHint &&
    !state.current.x2ThisTurn &&
    !state.current.usedHelpThisQuestion;

  const revealQuestion = (useX2 = false) => {
    if (state.stage !== STAGES.READY) return;
    if (useX2 && !canUseX2Now()) return;
    setState((st) => ({
      ...st,
      stage: STAGES.QUESTION,
      current: {
        ...st.current,
        x2ThisTurn: !!useX2,
        usedHelpThisQuestion: !!useX2 || st.current.usedHelpThisQuestion,
      },
      [activeKey]: !!useX2
        ? { ...st[activeKey], hasX2: false }
        : st[activeKey],
    }));
  };

  const useFiftyHelp = () => {
    const q = getCurrentQuestion();
    if (!q || !canUseFiftyNow()) return;
    if (!Array.isArray(q.fifty) || q.fifty.length !== 2) return;
    setState((st) => ({
      ...st,
      current: {
        ...st.current,
        usedHelpThisQuestion: true,
        fiftyQuickOptions: q.fifty.slice(0, 2),
      },
      [activeKey]: {
        ...st[activeKey],
        hasFifty: false,
      },
    }));
  };

  const useHintHelp = () => {
    const q = getCurrentQuestion();
    if (!q || !canUseHintNow()) return;
    if (!q.hint) return;
    setState((st) => ({
      ...st,
      current: {
        ...st.current,
        usedHelpThisQuestion: true,
        hintShown: true,
      },
      [activeKey]: {
        ...st[activeKey],
        hasHint: false,
      },
    }));
  };

  // ——— UI blocks ———
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

  function HelperDock({ playerKey, align = "left", askForConfirmation }) {
    const player = state[playerKey];
    const isActive = activeKey === playerKey;
    const q = getCurrentQuestion();

    const x2Ready = isActive && state.stage === STAGES.READY && !state.current.usedHelpThisQuestion;
    const postHelpsReady = isActive && state.stage === STAGES.QUESTION && !state.current.x2ThisTurn && !state.current.usedHelpThisQuestion;

    const x2Enabled = x2Ready && player.hasX2;
    const fiftyEnabled = postHelpsReady && player.hasFifty && Array.isArray(q?.fifty) && q.fifty.length === 2;
    const hintEnabled = postHelpsReady && player.hasHint && !!q?.hint;

    const baseBtn =
      "inline-flex items-center justify-center rounded-full w-9 h-9 text-xs font-extrabold ring-1 ring-white/20 shadow";
    const enabledStyle = { background: "rgba(255,255,255,0.14)" };
    const disabledCls = "opacity-40 pointer-events-none";

    return (
      <div className={`flex items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <button
          className={`${baseBtn} ${!player.hasX2 ? disabledCls : ""}`}
          style={player.hasX2 ? enabledStyle : {}}
          title="Χ2"
          onClick={() => x2Enabled && askForConfirmation("Ενεργοποίηση Χ2;", "Οι πόντοι της ερώτησης θα διπλασιαστούν, αλλά δεν θα μπορείς να χρησιμοποιήσεις άλλη βοήθεια. Είσαι σίγουρος;", () => revealQuestion(true))}
          disabled={!x2Enabled}
          aria-label="Χ2"
        >
          ×2
        </button>
        <button
          className={`${baseBtn} ${!player.hasFifty ? disabledCls : ""}`}
          style={player.hasFifty ? enabledStyle : {}}
          title="50/50"
          onClick={() => fiftyEnabled && askForConfirmation("Ενεργοποίηση 50/50;", "Θα εμφανιστούν δύο πιθανές απαντήσεις. Μια σωστή απάντηση με αυτή τη βοήθεια θα σου δώσει μόνο 1 πόντο. Είσαι σίγουρος;", useFiftyHelp)}
          disabled={!fiftyEnabled}
          aria-label="50/50"
        >
          50
        </button>
        <button
          className={`${baseBtn} ${!player.hasHint ? disabledCls : ""}`}
          style={player.hasHint ? enabledStyle : {}}
          title="Hint"
          onClick={() => hintEnabled && askForConfirmation("Χρήση Βοήθειας (Hint);", "Θα εμφανιστεί μια μικρή βοήθεια. Μια σωστή απάντηση με αυτή τη βοήθεια θα σου δώσει μόνο 1 πόντο. Είσαι σίγουρος;", useHintHelp)}
          disabled={!hintEnabled}
          aria-label="Hint"
        >
          💡
        </button>
      </div>
    );
  }

  function ScoreHeader({ askForConfirmation }) {
    return (
      <header
        className="sticky top-0 z-20 w-full"
        style={{
          background: `linear-gradient(90deg, var(--brand-grad-from), var(--brand-grad-to))`,
        }}
      >
        <div className="mx-auto max-w-3xl px-3 py-3">
          <div className="flex items-center justify-between gap-3 text-white">
            <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
              <PlayerScore
                name={state.p1.name}
                avatar={state.p1.avatar}
                score={state.p1.score}
                active={activeKey === "p1"}
              />
              <HelperDock playerKey="p1" align="left" askForConfirmation={askForConfirmation} />
            </div>
            <Logo />
            <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
              <PlayerScore
                name={state.p2.name}
                avatar={state.p2.avatar}
                score={state.p2.score}
                active={activeKey === "p2"}
              />
              <HelperDock playerKey="p2" align="left" askForConfirmation={askForConfirmation} />
            </div>
          </div>
        </div>
      </header>
    );
  }

  // ---------- CATEGORY: show ALL phases; lock non-current; keep USED pills grey ----------
  function CategoryStage() {
    const selectedPhase = myPhase;

    const byCategory = useMemo(() => {
      const map = new Map();
      for (const q of nonFinals) {
        if (!map.has(q.category)) map.set(q.category, []);
        map.get(q.category).push(q);
      }
      for (const [k, arr] of map) {
        arr.sort((a, b) => a.points - b.points || (a.order || 0) - (b.order || 0));
      }
      return Array.from(map.entries());
    }, [nonFinals]);

    function onPick(q) {
      const isUsed = state.usedQuestionIds.includes(q.id);
      const locked = q.phase && q.phase !== selectedPhase;
      if (isUsed || locked) return; // do nothing on disabled chips

      setState((st) => ({
        ...st,
        stage: STAGES.READY,
        current: {
          ...st.current,
          selectedQuestionId: q.id,
          mediaRefreshToken: 0,
          x2ThisTurn: false,
          usedHelpThisQuestion: false,
          fiftyEnabledIds: [],
          fiftyQuickOptions: null,
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
            <div className="text-slate-300">Δεν υπάρχουν διαθέσιμες ερωτήσεις.</div>
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
                  const isUsed = state.usedQuestionIds.includes(q.id);
                  const locked = q.phase && q.phase > selectedPhase;
                  const disabled = locked || isUsed;

                  const bg = disabled
                    ? "rgba(148,163,184,0.25)" // grey
                    : THEME.badgeGradient;

                  const title = locked
                    ? "Ξεκλειδώνει αργότερα"
                    : isUsed
                    ? "Έχει ήδη παιχτεί"
                    : `${q.points} πόντοι`;

                  return (
                    <button
                      key={q.id}
                      className="h-9 min-w-9 rounded-full px-3 text-white text-sm font-semibold shadow relative"
                      title={title}
                      style={{
                        background: bg,
                        opacity: disabled ? 0.6 : 1,
                        border: "1px solid rgba(255,255,255,0.18)",
                        cursor: disabled ? "not-allowed" : "pointer",
                      }}
                      aria-label={disabled ? "Μη διαθέσιμο" : `Ερώτηση ${q.points} πόντοι`}
                      disabled={disabled}
                      onClick={() => onPick(q)}
                    >
                      x{q.points}
                      {locked && (
                        <span className="absolute -top-1 -right-1 text-xs" aria-hidden>
                          🔒
                        </span>
                      )}
                      {isUsed && !locked && (
                        <span className="absolute -top-1 -right-1 text-xs" aria-hidden>
                          ✓
                        </span>
                      )}
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

  function ReadyStage({ askForConfirmation }) {
    const q = useMemo(
      () => RAW_QUESTIONS.find((x) => x.id === state.current.selectedQuestionId),
      [state.current.selectedQuestionId]
    );
    if (!q) return null;
    const canUseX2 = canUseX2Now();

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
          <button className="btn btn-accent" onClick={() => revealQuestion(false)} aria-label="Αποκάλυψη ερώτησης">
            Αποκάλυψη
          </button>
          <button
            className="btn btn-neutral"
            onClick={() => askForConfirmation("Ενεργοποίηση Χ2;", "Οι πόντοι της ερώτησης θα διπλασιαστούν, αλλά δεν θα μπορείς να χρησιμοποιήσεις άλλη βοήθεια. Είσαι σίγουρος;", () => revealQuestion(true))}
            disabled={!canUseX2}
            aria-label="Χρήση Χ2 και αποκάλυψη"
            title={!activePlayer.hasX2 ? "Boήθεια ×2 έχει ήδη χρησιμοποιηθεί" : canUseX2 ? "Χ2 (πριν την αποκάλυψη)" : "Δεν είναι διαθέσιμο"}
          >
            {activePlayer.hasX2 ? "Χρήση ×2 & Αποκάλυψη" : "×2 Used"}
          </button>
        </div>
      </StageCard>
    );
  }

  function AnswerStage({ askForConfirmation }) {
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
    const correctnessKnown =
      (result && typeof result.correct === "boolean") ||
      state.__lastOwnTurnCorrect !== null;
    const wasCorrect =
      (result && typeof result.correct === "boolean")
        ? result.correct
        : state.__lastOwnTurnCorrect === true;

    const preAwardPoints = (() => {
      if (!wasCorrect) return 0;
      const usedFiftyOrHint = state.current.fiftyQuickOptions || state.current.hintShown;
      if (usedFiftyOrHint) {
        return 1;
      }
      const base = q.points * (state.current.x2ThisTurn ? 2 : 1);
      return finalizePoints(base);
    })();

    const hideTrueAnswer =
      !wasCorrect && state.current.stealOffered && state.current.stealBy == null;

    return (
      <StageCard>
        <div className="flex items-center justify-between">
          <Logo />
          <div className="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-semibold text-white">
            {q.points} πόντοι
          </div>
        </div>

        <div className="text-center mt-4">
          {!hideTrueAnswer && (
            <div className="font-display text-3xl font-extrabold text-white">
              {q.answer}
            </div>
          )}

          <div className="mt-3 font-ui text-sm">
            <div
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2"
              style={{
                background: "rgba(148,163,184,0.10)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <span style={{ opacity: 0.85 }}>Απάντηση Παίκτη:</span>
              <span className="italic text-slate-100">
                {userAnswerStr || "—"}
              </span>
              {correctnessKnown && (
                <span
                  className="ml-2 inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold text-white"
                  style={{
                    background: wasCorrect ? THEME.positiveGrad : THEME.negativeGrad,
                  }}
                  aria-label={wasCorrect ? "Σωστό" : "Λάθος"}
                >
                  {wasCorrect ? "✓" : "✗"} {wasCorrect ? `+${preAwardPoints}` : "0"}
                </span>
              )}
            </div>
          </div>

          {q.fact && (
            <div className="mt-2 font-ui text-sm text-slate-300">ℹ️ {q.fact}</div>
          )}
        </div>

        {state.current.stealOffered && state.current.stealBy == null && <StealPrompt askForConfirmation={askForConfirmation} />}

        {!state.current.stealOffered && (
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              className="btn btn-accent"
              onClick={() => {
                const wasOwnCorrect = state.__lastOwnTurnCorrect === true;
                if (!wasOwnCorrect) {
                  setState((st) => ({
                    ...st,
                    current: { ...st.current, stealOffered: true },
                  }));
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

  function StealPrompt({ askForConfirmation }) {
    return (
      <div className="mt-6">
        <div className="rounded-2xl p-4 text-white" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="font-semibold mb-2">
            {state[otherKey].name}: Κλέβεις για 1 πόντο; (χωρίς βοήθειες)
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              className="btn btn-accent"
              onClick={() => askForConfirmation("Απόπειρα για Κλέψιμο;", "Μια σωστή απάντηση δίνει 1 πόντο, αλλά μια λάθος απάντηση αφαιρεί 1 πόντο. Είσαι σίγουρος;", () => setState((st) => ({ ...st, stage: STAGES.STEAL_TURN, current: { ...st.current, stealAccepted: true, stealBy: otherKey } })))}
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
    const stealerKey = state.current.stealBy || (state.current.stealAccepted ? otherKey : null);
    if (!stealerKey || !q) return null;

    const [inputValue, setInputValue] = useState("");
    const [scoreValue, setScoreValue] = useState({ home: 0, away: 0 });
    const [submitted, setSubmitted] = useState(false);
    const [result, setResult] = useState(null); // { correct: boolean }
    const [userAnswer, setUserAnswer] = useState(null);

    async function submit(raw) {
      const res = await validateAny(q, raw);
      setResult(res);
      setUserAnswer(raw);
      setSubmitted(true);
    }

    const userAnswerStr =
      submitted && userAnswer !== null ? prettyAnswer(q, userAnswer) : "";

    return (
      <StageCard>
        <div className="flex items-center justify-between">
          <Logo />
          <div className="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-semibold text-white">
            Κλέψιμο — 1 πόντος
          </div>
        </div>

        <h3 className="mt-4 font-display text-2xl font-bold text-white">
          {state[stealerKey].name}: Απόπειρα κλεψίματος
        </h3>

        <div className="mt-1 text-slate-300 text-sm">{q.prompt}</div>

        {q.media ? (
          <div className="mt-4">
            <Media key={`media-${q.id}-${state.current.mediaRefreshToken || 0}`} media={{ ...q.media, priority: true }} />
          </div>
        ) : null}

        {!submitted && (
          <>
            {q.answerMode === "MultipleChoice" && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {q.choices?.map((choice) => (
                  <button
                    key={choice}
                    className="btn btn-neutral w-full text-center"
                    onClick={() => submit(choice)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}
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

            {q.answerMode !== 'MultipleChoice' && <div className="mt-4 flex flex-wrap justify-center gap-3">
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
            </div>}
          </>
        )}

        {submitted && (
          <div className="mt-5 text-center">
            <div className="font-display text-3xl font-extrabold text-white">{q.answer}</div>
            <div className="mt-3 font-ui text-sm">
              <div
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2"
                style={{
                  background: "rgba(148,163,184,0.10)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <span style={{ opacity: 0.85 }}>Απάντηση Κλέφτη:</span>
                <span className="italic text-slate-100">{userAnswerStr || "—"}</span>
                <span
                  className="ml-2 inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold text-white"
                  style={{
                    background: result?.correct ? THEME.positiveGrad : THEME.negativeGrad,
                  }}
                  aria-label={result?.correct ? "Σωστό" : "Λάθος"}
                >
                  {result?.correct ? "✓ +1" : "✗ -1"}
                </span>
              </div>
            </div>

            {q.fact && <div className="mt-2 font-ui text-sm text-slate-300">ℹ️ {q.fact}</div>}

            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                className="btn btn-accent"
                onClick={() => applyStealResolution(!!result?.correct)}
              >
                Συνέχεια
              </button>
            </div>
          </div>
        )}
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
      const usedFiftyOrHint = state.current.fiftyQuickOptions || state.current.hintShown;
      if (usedFiftyOrHint) {
        delta = 1;
      } else {
        delta = finalizePoints(base);
      }
    } else {
      delta = 0;
    }

    setState((st) => {
      const next = { ...st };
      next.__lastOwnTurnCorrect = !!correct;
      if (!correct || isPass) {
        // hide hint after a wrong/pass answer
        next.current.hintShown = false;
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
    const stealPts = correct ? 1 : -1;
    setState((st) => {
      const next = { ...st };
      const stealerKey = st.current.stealBy;
      if (stealerKey) {
        next[stealerKey] = {
          ...next[stealerKey],
          score: finalizePoints(next[stealerKey].score + stealPts),
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
        mediaRefreshToken: 0,
        fiftyEnabledIds: [],
        fiftyQuickOptions: null,
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

      // Advance stage/phase based on remaining questions
      const anyLeft = nonFinals.some((q) => !st.usedQuestionIds.includes(q.id));
      if (!anyLeft) {
        st.stage = STAGES.RESULTS;
      } else {
        st.active = nextActive;
        st.stage = STAGES.CATEGORY;
      }
      return st;
    });
  }

  async function submitAnswer(raw) {
    const q = getCurrentQuestion();
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

  // ——— Render ———
  return (
    <div
      className="min-h-screen text-white"
      style={{ background: `linear-gradient(135deg, var(--brand-grad-from), var(--brand-grad-to))` }}
    >
      <ConfirmDialog 
        isOpen={confirmState.isOpen}
        onClose={closeConfirmation}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        description={confirmState.description}
      />
      <ScoreHeader askForConfirmation={askForConfirmation} />

      {state.stage === STAGES.SETUP && <SetupStage state={state} setState={setState} setStage={setStage} />}
      {state.stage === STAGES.CATEGORY && <CategoryStage />}
      {state.stage === STAGES.READY && <ReadyStage askForConfirmation={askForConfirmation} />}
      {state.stage === STAGES.QUESTION && (
        <QuestionStage
          q={getCurrentQuestion()}
          state={state}
          activePlayer={activePlayer}
          canUseFiftyNow={canUseFiftyNow}
          canUseHintNow={canUseHintNow}
          useFiftyHelp={useFiftyHelp}
          useHintHelp={useHintHelp}
          prettyAnswer={prettyAnswer}
          submitAnswer={submitAnswer}
          passAnswer={passAnswer}
          askForConfirmation={askForConfirmation}
        />
      )}
      {state.stage === STAGES.ANSWER && <AnswerStage askForConfirmation={askForConfirmation} />}
      {state.stage === STAGES.STEAL_TURN && <StealTurn />}
      {state.stage === STAGES.RESULTS && <ResultsStage />}

      <div className="pb-16" />
    </div>
  );
}
