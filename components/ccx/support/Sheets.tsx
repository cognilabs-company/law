"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { aiId } from "@/lib/ai/ids";
import { isAborted } from "@/lib/http";
import { initials } from "@/lib/lawyers";
import { listSupportOperators, type SupportOperator, type SupportTicket } from "@/lib/services/support";
import Sheet from "../panel/Sheet";
import { Note, PanelFoot, PanelHead } from "../panel/bits";
import { IcCheck, IcSearch } from "../icons";
import { IcSwap } from "./icons";
import { codeOf } from "./model";

const BASE = "call_center.support.ticket";

type Found = { q: string; items: SupportOperator[] };

export function TransferSheet({
  ticket,
  meId,
  busy,
  onCancel,
  onSubmit,
}: {
  ticket: SupportTicket;
  meId: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (pick: SupportOperator, reason: string) => void;
}) {
  const t = useTranslations("support");
  const uid = useId();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [pick, setPick] = useState<SupportOperator | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const tid = ticket.id;
  const loading = !found || found.q !== q;
  const items = found?.items ?? [];

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const c = new AbortController();
    const id = window.setTimeout(
      () => {
        listSupportOperators(q, 30, c.signal)
          .then((list) => {
            if (c.signal.aborted) return;
            setFound({ q, items: list.filter((o) => o.id !== meId) });
          })
          .catch((e: unknown) => {
            if (isAborted(e) || c.signal.aborted) return;
            setFound({ q, items: [] });
          });
      },
      q.trim() ? 300 : 0,
    );
    return () => {
      window.clearTimeout(id);
      c.abort();
    };
  }, [q, meId]);

  const roleName = (r: string) => (r && t.has(`roles.${r}`) ? t(`roles.${r}`) : r);

  const go = () => {
    if (!pick || busy) return;
    if (!reason.trim()) {
      setErr(t("reasonRequired"));
      return;
    }
    onSubmit(pick, reason.trim());
  };

  return (
    <Sheet label={t("transfer")} head={<PanelHead icon={<IcSwap size={20} />} tag={t("transfer")} code={codeOf(ticket)} />} onClose={onCancel} dirty={Boolean(pick || reason.trim())}>
      <div className="opx-pscroll opx-sx-sheet" data-ai-id={aiId(BASE, tid, "transfer-modal")} data-ai-type="modal" data-ai-label={t("transfer")} data-ai-private>
        <div className="opx-field">
          <label htmlFor={`${uid}-q`}>{t("operator")}</label>
          <span className="opx-sx-find">
            <IcSearch size={17} />
            <input
              id={`${uid}-q`}
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("operatorSearch")}
              autoComplete="off"
              data-ai-id={aiId(BASE, tid, "transfer-modal", "search")}
            />
          </span>
        </div>
        <ul
          className="opx-sx-ops"
          role="listbox"
          aria-label={t("operator")}
          aria-busy={loading}
          data-ai-id={aiId(BASE, tid, "transfer-modal", "operators")}
          data-ai-type="list"
          data-ai-label={t("operator")}
        >
          {items.map((u) => {
            const on = pick?.id === u.id;
            return (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`opx-sx-opt${on ? " is-on" : ""}`}
                  onClick={() => {
                    setPick(u);
                    setErr("");
                  }}
                >
                  <span className="opx-sx-opt__av" aria-hidden="true">
                    {initials(u.name || u.lexgoId || "?")}
                  </span>
                  <span className="opx-sx-opt__t">
                    <b>{u.name || u.lexgoId}</b>
                    <small>{[roleName(u.role), u.lexgoId].filter(Boolean).join(" · ")}</small>
                  </span>
                  {on ? <IcCheck size={17} /> : null}
                </button>
              </li>
            );
          })}
          {loading && !items.length ? <li className="opx-sx-ops__none">{t("operatorsLoading")}</li> : null}
          {!loading && !items.length ? <li className="opx-sx-ops__none">{t("operatorNone")}</li> : null}
        </ul>
        <div className={`opx-field${err ? " has-error" : ""}`}>
          <label htmlFor={`${uid}-r`}>
            {t("reason")}
            <i aria-hidden="true">*</i>
          </label>
          <textarea
            id={`${uid}-r`}
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setErr("");
            }}
            placeholder={t("reasonPh")}
            aria-invalid={err ? true : undefined}
            aria-describedby={err ? `${uid}-re` : undefined}
            data-ai-id={aiId(BASE, tid, "transfer-modal", "reason")}
            data-ai-label={t("reason")}
          />
          {err ? (
            <p className="opx-ferr" id={`${uid}-re`} role="alert">
              {err}
            </p>
          ) : null}
        </div>
      </div>
      <PanelFoot onCancel={onCancel} cancelLabel={t("cancel")} primary={go} primaryLabel={t("transferDo")} busy={busy} disabled={!pick} />
    </Sheet>
  );
}

export function CloseSheet({ ticket, busy, onCancel, onSubmit }: { ticket: SupportTicket; busy: boolean; onCancel: () => void; onSubmit: (resolution: string) => void }) {
  const t = useTranslations("support");
  const uid = useId();
  const [resolution, setResolution] = useState("");
  const [err, setErr] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const tid = ticket.id;

  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, []);

  const go = () => {
    if (busy) return;
    if (!resolution.trim()) {
      setErr(t("resolutionRequired"));
      return;
    }
    onSubmit(resolution.trim());
  };

  return (
    <Sheet label={t("close")} head={<PanelHead icon={<IcCheck size={20} />} tag={t("close")} code={codeOf(ticket)} />} onClose={onCancel} dirty={Boolean(resolution.trim())}>
      <div className="opx-pscroll opx-sx-sheet" data-ai-id={aiId(BASE, tid, "close-modal")} data-ai-type="modal" data-ai-label={t("close")} data-ai-private>
        <Note tone="info">{t("closeNote")}</Note>
        <div className={`opx-field${err ? " has-error" : ""}`}>
          <label htmlFor={`${uid}-r`}>
            {t("resolution")}
            <i aria-hidden="true">*</i>
          </label>
          <textarea
            id={`${uid}-r`}
            ref={field}
            rows={4}
            value={resolution}
            onChange={(e) => {
              setResolution(e.target.value);
              setErr("");
            }}
            placeholder={t("resolutionPh")}
            aria-invalid={err ? true : undefined}
            aria-describedby={err ? `${uid}-re` : undefined}
            data-ai-id={aiId(BASE, tid, "close-modal", "resolution")}
            data-ai-label={t("resolution")}
          />
          {err ? (
            <p className="opx-ferr" id={`${uid}-re`} role="alert">
              {err}
            </p>
          ) : null}
        </div>
      </div>
      <PanelFoot onCancel={onCancel} cancelLabel={t("cancel")} primary={go} primaryLabel={t("closeDo")} busy={busy} disabled={!resolution.trim()} />
    </Sheet>
  );
}
