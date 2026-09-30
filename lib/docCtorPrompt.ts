// "Ishingiz Navbatchi advokatga berildi — konstruktorni ochasizmi?"
//
// The backend sends `constructor_action.prompt_required` for the WHOLE life of
// the hold, not once. Any screen that turns that flag into a dialog therefore
// has to remember, itself, that this client has already been asked about this
// request — otherwise the same two-button prompt reappears on every visit,
// every refresh and every notification tap, which is exactly what was
// reported.
//
// The memory is per request id, in localStorage, so it survives a reload and
// a fresh tab (the flag outlives both). It is deliberately per browser: there
// is nowhere on the record to store "the client said no", and asking once more
// on a new device is far better than never asking at all.
//
// Two screens share it — the wait screen inside a request (DocumentRequestPanel)
// and the documents list (ClientDocumentRequests), which the
// `document_constructor_continue_prompt` notification deep-links into with
// ?doc=<id>. They must agree, or answering on one would leave the other still
// asking.

const KEY = "lexgo_doc_ctor_ask";

// `true` when there is nothing to ask about (no id) or no storage to read —
// the safe answer in both cases is "do not pop a dialog".
export function ctorPromptAsked(id: string): boolean {
  if (typeof window === "undefined" || !id) return true;
  try {
    return localStorage.getItem(`${KEY}_${id}`) === "1";
  } catch {
    return true; // private mode: ask nobody rather than ask forever
  }
}

export function markCtorPromptAsked(id: string): void {
  if (typeof window === "undefined" || !id) return;
  try {
    localStorage.setItem(`${KEY}_${id}`, "1");
  } catch {
    /* private mode */
  }
}
