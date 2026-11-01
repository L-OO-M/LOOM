// Zen Learning Mode — pure iframe/fallback stage machine.
//
// Why this exists: browsers fire the iframe `load` event even when they
// render their own refusal/error page (X-Frame-Options, CSP), so a load
// event must never dismiss the fallback, and a late timer must never undo
// the user's manual choice. The component below is a thin renderer over
// this machine; every transition here is unit-tested.

export const ZEN_STAGE = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  FALLBACK: "fallback",
});

export function zenStageInit() {
  return { phase: ZEN_STAGE.LOADING, frameKey: 0, key: null };
}

export function zenStageNext(state, action) {
  const s = state || zenStageInit();
  switch (action?.type) {
    case "reset":
      // New selection (or re-armed timer scope). Keeps frameKey: remounts
      // are driven by retry and by the iframe key identity, not by resets.
      return { phase: ZEN_STAGE.LOADING, frameKey: s.frameKey, key: action.key ?? s.key };
    case "loaded":
      // A load event only ends the loading state. When the fallback is
      // already showing (manual choice or timeout), a late load — including
      // the browser's own refusal page — leaves it exactly as it is.
      if (s.phase !== ZEN_STAGE.LOADING) return s;
      return { ...s, phase: ZEN_STAGE.READY };
    case "timeout":
    case "error":
      // Only a still-loading frame can fall back. A timer that fires after
      // the user already chose, retried, or switched resources is a no-op,
      // as is an error arriving after a successful load.
      if (s.phase !== ZEN_STAGE.LOADING) return s;
      return { ...s, phase: ZEN_STAGE.FALLBACK };
    case "show":
      // The user's explicit "view options" switch. Idempotent.
      if (s.phase === ZEN_STAGE.FALLBACK) return s;
      return { ...s, phase: ZEN_STAGE.FALLBACK };
    case "violation":
      // A CSP frame-src refusal (securitypolicyviolation) proves our own
      // policy blocked the frame — and the browser may still fire `load` for
      // its own error page, so a ready frame can be a lie. This is the one
      // block signal we truly own, so it overrides a ready frame, while
      // staying idempotent against a fallback the user already reached.
      if (s.phase === ZEN_STAGE.FALLBACK) return s;
      return { ...s, phase: ZEN_STAGE.FALLBACK };
    case "retry":
      // Back to loading with a bumped key so the iframe remounts and the
      // load timer is re-armed by the effect watching frameKey.
      return { phase: ZEN_STAGE.LOADING, frameKey: s.frameKey + 1, key: s.key };
    default:
      return s;
  }
}

// Visibility matrix for the stage. The iframe is mounted while loading or
// in fallback (so a retry is instant) but painted only when ready —
// a refusal page can never cover the fallback controls.
export function zenStageView(state, status) {
  const phase = state?.phase || ZEN_STAGE.LOADING;
  const fallback = phase === ZEN_STAGE.FALLBACK;
  return {
    showLoading: phase === ZEN_STAGE.LOADING,
    iframeVisible: phase === ZEN_STAGE.READY,
    showSitePanel: fallback && status === "site",
    showInlineHint: fallback && status === "youtube",
  };
}

// Which owner renders the stage for a given classification. Exactly one per
// status, and every status has one: that exhaustiveness is the contract. The
// reported blank-stage defect was an unowned status — "unsupported" rendered
// neither an iframe nor a panel, so the overlay showed its chrome over an
// empty rectangle. Unknown/future statuses fall back to the informed
// hand-off panel, never to nothing.
export const ZEN_OUTCOME = Object.freeze({
  IFRAME: "iframe",
  EXTERNAL: "external",
  PDF: "pdf",
  UNSUPPORTED: "unsupported",
});

export function zenStageOutcome(status) {
  switch (status) {
    case "youtube":
    case "site":
      return ZEN_OUTCOME.IFRAME;
    case "pdf":
      return ZEN_OUTCOME.PDF;
    case "external":
      return ZEN_OUTCOME.EXTERNAL;
    default:
      return ZEN_OUTCOME.UNSUPPORTED;
  }
}
