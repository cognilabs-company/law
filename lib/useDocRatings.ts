"use client";

import { useEffect, useRef, useState } from "react";
import { getDocumentRequest, type UrgentRating } from "@/lib/services/backend";

// The 15-minute rating window on a finished document, resolved per request id.
//
// LEXGO_FRONTEND_DOCUMENT_RATING_AND_CALENDAR_FIX: when an advocate finalises
// a document the backend opens a 15-minute window — rating_deadline_at,
// rating_available, rating_submitted — and the MD asks the client's documents
// page to show it on each ready card, reading it out of
// GET /document-requests/service-flow.
//
// That list does not carry it. Verified against production: a row's keys are
// id, mode, title, status, status_label, next_action, document_request,
// requested_document_type(+_is_custom/_options), service, lawyer_request,
// assigned_lawyer, file, actions, created_at, updated_at — no work_id, no
// answers, no rating fields, and none of them inside the nested
// document_request either. Reported.
//
// GET /document-requests/{id} DOES carry both, flat and under `answers`
// (checked on a real finalised record: work_id "LGD-20260928-465EBDB0",
// rating_available true, rating_deadline_at set). So the window is resolved
// from there, for the rows that could have one.
//
// Only `file_ready` and `closed` rows are asked about: no other status has a
// window, and asking for all twenty would be twenty requests to serve one
// card. Both fields the card needs come back in the same answer, so the
// work_id the MD asks for costs nothing extra.

export type DocRatingInfo = { rating: UrgentRating; workId: string };
const NONE: Record<string, DocRatingInfo> = {};

export function useDocRatings(ids: string[], nonce = 0): Record<string, DocRatingInfo> {
  // Answers are stamped with the nonce they were fetched under, so a bump
  // (a realtime event, a submitted rating) invalidates them by comparison
  // rather than by a reset that would have to be a setState inside an effect.
  const [state, setState] = useState<{ n: number; map: Record<string, DocRatingInfo> }>({ n: nonce, map: NONE });
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
      // In parallel: these are a handful of rows on one page, and serially
      // they would trickle in one card at a time.
      const got = await Promise.all(
        todo.map(async (id) => {
          try {
            const r = await getDocumentRequest(id);
            return { id, info: { rating: r.rating, workId: r.workId } };
          } catch {
            // 403/404 — not this client's to read. Nothing to report.
            return null;
          }
        }),
      );
      if (!alive) return;
      const fresh = got.filter(Boolean) as { id: string; info: DocRatingInfo }[];
      if (!fresh.length) return;
      setState((cur) => {
        const base = cur.n === nonce ? cur.map : NONE;
        const next = { ...base };
        for (const { id, info } of fresh) next[id] = info;
        return { n: nonce, map: next };
      });
    })();
    return () => { alive = false; };
    // `key` stands in for the array identity; `ids` itself is a fresh array
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return state.n === nonce ? state.map : NONE;
}
