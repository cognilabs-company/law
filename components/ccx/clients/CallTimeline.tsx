"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { CcCall } from "@/lib/services/backend";
import { fmtDuration, shortDateTime } from "@/lib/date";
import { humanize, labelOf } from "@/lib/labels";
import { IcArrowRight, IcRefresh } from "../icons";
import { CallIcon, callKind } from "./parts";

export type CallsState = { status: "ready" | "error"; list: CcCall[] } | null;

const SHOWN = 6;

export function useCallText() {
  const tc = useTranslations("admin.callCenter");
  const tl = useTranslations("admin.callCenter.calls");
  const result = (r: string) => (!r ? "" : tl.has(`results.${r}`) ? tl(`results.${r}`) : labelOf(tc, "status", r));
  const dir = (c: CcCall) => (c.status === "missed" ? tc("status.missed") : tc.has(`dir.${c.direction}`) ? tc(`dir.${c.direction}`) : humanize(c.direction));
  return { result, dir };
}

export default function CallTimeline({ calls, freshId, onRetry }: { calls: CallsState; freshId: string; onRetry: () => void }) {
  const tc = useTranslations("admin.callCenter");
  const tl = useTranslations("admin.callCenter.calls");
  const tcard = useTranslations("admin.callCenter.card");
  const tpg = useTranslations("common.pager");
  const tn = useTranslations("common.notify");
  const locale = useLocale();
  const text = useCallText();
  const [all, setAll] = useState(false);
  const list = calls?.status === "ready" ? calls.list.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)) : [];
  const shown = all ? list : list.slice(0, SHOWN);

  return (
    <aside className="opx-cl-calls" aria-labelledby="opx-cl-calls-h">
      <header className="opx-cl-calls__head">
        <h3 id="opx-cl-calls-h">
          {tc("recent")}
          {calls?.status === "ready" ? <b className="opx-num">{list.length}</b> : null}
        </h3>
        {list.length > SHOWN ? (
          <button type="button" className="opx-cl-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? tpg("less") : tl("all")}
            <IcArrowRight size={15} />
          </button>
        ) : null}
      </header>

      {calls === null ? (
        <div className="opx-cl-calls__wait" aria-busy="true">
          <i className="opx-shim" />
          <i className="opx-shim" />
          <i className="opx-shim" />
        </div>
      ) : calls.status === "error" ? (
        <div className="opx-cl-note" data-tone="bad" role="alert">
          <span>{tl("loadError")}</span>
          <button type="button" className="opx-cl-mini" onClick={onRetry}>
            <IcRefresh size={15} />
            {tn("retry")}
          </button>
        </div>
      ) : !list.length ? (
        <p className="opx-cl-none">{tcard("noCalls")}</p>
      ) : (
        <ol className="opx-cl-tl">
          {shown.map((c) => {
            const kind = callKind(c);
            const dur = c.durationSec ? fmtDuration(c.durationSec, locale) : "";
            const result = text.result(c.result);
            return (
              <li key={c.id} id={`opx-cl-call-${c.id}`} data-kind={kind} className={c.id === freshId ? "is-fresh" : undefined}>
                <span className="opx-cl-tl__ic" title={text.dir(c)}>
                  <CallIcon kind={kind} size={17} />
                  <span className="opx-sr">{text.dir(c)}</span>
                </span>
                <div className="opx-cl-tl__body">
                  <p className="opx-cl-tl__top opx-num">
                    <time dateTime={c.createdAt}>{shortDateTime(c.createdAt, locale)}</time>
                    {dur ? <span>{dur}</span> : null}
                  </p>
                  {c.topic ? (
                    <p>
                      <small>{tl("topic")}:</small> {c.topic}
                    </p>
                  ) : null}
                  {result ? (
                    <p>
                      <small>{tl("result")}:</small> {result}
                    </p>
                  ) : null}
                  {c.nextAction ? (
                    <p className="opx-cl-tl__next">
                      <small>{tl("next")}:</small> {c.nextAction}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
