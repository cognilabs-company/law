"use client";

import { useEffect, useRef, useState } from "react";
import { getDocumentRequestChat } from "@/lib/services/backend";

// The chat room for a document request, resolved per request id.
//
// GET /document-requests/service-flow — the list both the "my work" card and
// the documents page are built on — does NOT carry the room. Verified against
// production: a row's keys are id, mode, title, status, status_label,
// next_action, document_request, service, lawyer_request, assigned_lawyer,
// file, actions, created_at, updated_at, and the room appears under none of
// the spellings the normalizer tries. So `secureChatRoomId` was empty on every
// row, both screens fell through to their "nobody has taken it yet" branch,
// and the conversation with the advocate handling the document was
// unreachable from anywhere once the order modal had been closed.
//
// The room lives on GET /document-requests/{id}/chat, which answers
// `available:false` while the work is still in the pool and 404 for a request
// that can never have one (a document the client fills in themselves). Both
// are ordinary outcomes here, not errors.
//
// Asked for one id at a time on purpose: this runs behind a list that already
// has its own data, and a burst of parallel requests to serve a secondary
// button is not worth it.
const NONE: Record<string, string> = {};

export function useDocChatRooms(ids: string[], nonce = 0): Record<string, string> {
  // The answers are stamped with the nonce they were fetched under, so a bump
  // (a claim, a completion) invalidates them by comparison instead of by a
  // reset that would have to be a setState inside an effect.
  const [state, setState] = useState<{ n: number; rooms: Record<string, string> }>({ n: nonce, rooms: NONE });
  // Ids already asked about under the current nonce. A ref, and only ever
  // written from inside the effect.
  const asked = useRef<Set<string>>(new Set());
  const askedFor = useRef(nonce);
  const key = ids.join(",");

  useEffect(() => {
    if (askedFor.current !== nonce) {
      askedFor.current = nonce;
      asked.current = new Set();
    }
    let alive = true;
    const todo = ids.filter((id) => id && !asked.current.has(id));
    if (!todo.length) return;
    for (const id of todo) asked.current.add(id);
    void (async () => {
      for (const id of todo) {
        let roomId = "";
        try {
          const c = await getDocumentRequestChat(id);
          if (c.available) roomId = c.roomId;
        } catch {
          // 404: this request can never have a chat. Nothing to report.
        }
        if (!alive || !roomId) continue;
        setState((cur) => {
          const base = cur.n === nonce ? cur.rooms : NONE;
          return base[id] === roomId ? cur : { n: nonce, rooms: { ...base, [id]: roomId } };
        });
      }
    })();
    return () => { alive = false; };
    // `key` stands in for the array identity; `ids` itself is a fresh array on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return state.n === nonce ? state.rooms : NONE;
}
