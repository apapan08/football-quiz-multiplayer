 function X2Control({
    label,
    side,
    available,
    armed,
    onArm,
    isFinal,
    stage,
    variant = "card",
  }) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const clickable =
      available && !isFinal && stage === STAGES.CATEGORY && !armed;

    function handlePrimaryClick() {
      if (!clickable) return;
      setConfirmOpen(true);
    }
    function confirmArm() {
      setConfirmOpen(false);
      onArm();
    }

    const statusText = (() => {
      if (isFinal) return "Δεν επιτρέπεται στον Τελικό.";
      if (armed) return "Χ2 ενεργό για αυτή την ερώτηση.";
      if (!available) return "Χ2 χρησιμοποιήθηκε.";
      return "Μπορεί να χρησιμοποιηθεί μόνο μία φορά.";
    })();

    // --- New compact CHIP variant ---
    if (variant === "chip") {
      const chipText = isFinal
        ? "Χ2 δεν επιτρέπεται"
        : armed
        ? "⚡ Χ2 ενεργό"
        : available
        ? "⚡ Ενεργοποίηση Χ2"
        : "Χ2 χρησιμοποιήθηκε";

      const activeStyle = {
        background: THEME.badgeGradient,
        color: "#fff",
        padding: ".45rem .9rem",
        fontWeight: 800,
        cursor: clickable ? "pointer" : "default",
        opacity: clickable ? 1 : 0.75,
      };
      const mutedStyle = {
        background: "rgba(148,163,184,0.18)",
        border: "1px solid rgba(255,255,255,0.16)",
        color: "rgba(255,255,255,0.85)",
        padding: ".45rem .9rem",
        fontWeight: 800,
        opacity: 0.8,
        cursor: "default",
      };

      const style = clickable || armed ? activeStyle : mutedStyle;

      return (
        <div className="relative inline-block">
          <button
            type="button"
            className="pill select-none"
            style={style}
            onClick={handlePrimaryClick}
            disabled={!clickable}
            aria-disabled={!clickable}
            aria-label="Ενεργοποίηση Χ2"
          >
            {chipText}
          </button>

          {/* Inline confirm popover */}
          {confirmOpen && (
            <div
              className="absolute left-1/2 -translate-x-1/2 top-full mt-3 w-[min(92vw,320px)] rounded-xl bg-slate-900/95 ring-1 ring-white/10 p-3 shadow-xl z-10"
              role="dialog"
              aria-modal="true"
              aria-label="Επιβεβαίωση Χ2"
            >
              <div className="text-sm text-slate-200 font-semibold mb-1">
                Ενεργοποίηση Χ2;
              </div>
              <div className="text-xs text-slate-400 mb-3">
                Θα διπλασιάσει τους πόντους αυτής της ερώτησης. Συνέχεια;
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="btn btn-neutral"
                  onClick={() => setConfirmOpen(false)}
                >
                  Άκυρο
                </button>
                <button className="btn btn-accent" onClick={confirmArm}>
                  Ναι, ενεργοποίηση
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }
