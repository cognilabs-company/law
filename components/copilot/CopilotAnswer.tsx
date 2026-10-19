"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  FilePenLineIcon,
  FileTextIcon,
  FlagIcon,
  GitBranchIcon,
  HandshakeIcon,
  HistoryIcon,
  InfoIcon,
  LinkIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  LocateFixedIcon,
  NotebookPenIcon,
  ReplyIcon,
  RotateCcwIcon,
  SparklesIcon,
  StarIcon,
  ThumbsUpIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { aiSeg } from "@/lib/ai/ids";
import type { Role } from "@/lib/auth";
import { copilotRoute, type CopilotActionPreview, type CopilotEntityRef, type CopilotHighlight } from "@/lib/services/copilotPanel";
import type { CopilotActionOutcome, CopilotFeedback, CopilotTurn } from "./store";

const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

export const ACTION_ICONS: Record<string, LucideIcon> = {
  save_draft: FilePenLineIcon,
  save_note: NotebookPenIcon,
  save_work_plan: ListChecksIcon,
  save_timeline: HistoryIcon,
  save_evidence_map: GitBranchIcon,
  save_meeting_summary: CalendarClockIcon,
  draft_client_reply: ReplyIcon,
  draft_complaint: FlagIcon,
  draft_document: FileTextIcon,
  create_handoff: HandshakeIcon,
};

type Block = { kind: "p"; lines: string[] } | { kind: "h"; text: string } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[]; start: number };

function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  let cur: Block | null = null;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      cur = null;
      continue;
    }
    const h = /^#{1,6}\s+(.+)$/.exec(line);
    const ul = /^[-*•–]\s+(.+)$/.exec(line);
    const ol = /^(\d{1,3})[.)]\s+(.+)$/.exec(line);
    if (h) {
      out.push({ kind: "h", text: h[1] });
      cur = null;
    } else if (ul) {
      if (cur?.kind !== "ul") {
        cur = { kind: "ul", items: [] };
        out.push(cur);
      }
      cur.items.push(ul[1]);
    } else if (ol) {
      if (cur?.kind !== "ol") {
        cur = { kind: "ol", items: [], start: Number(ol[1]) || 1 };
        out.push(cur);
      }
      cur.items.push(ol[2]);
    } else if ((cur?.kind === "ul" || cur?.kind === "ol") && /^\s{2,}/.test(raw)) {
      cur.items[cur.items.length - 1] += ` ${line}`;
    } else if (cur?.kind === "p") {
      cur.lines.push(line);
    } else {
      cur = { kind: "p", lines: [line] };
      out.push(cur);
    }
  }
  return out;
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+?)\*\*|__([^_]+?)__/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(<strong key={m.index}>{m[1] ?? m[2]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function CopilotText({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className="cpl-text">
      {blocks.map((b, i) =>
        b.kind === "h" ? (
          <p key={i} className="cpl-text__h">
            {inline(b.text)}
          </p>
        ) : b.kind === "p" ? (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j ? <br /> : null}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        ) : b.kind === "ul" ? (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ul>
        ) : (
          <ol key={i} start={b.start}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}

const humanize = (s: string) => s.replace(/[_-]+/g, " ").trim();

export function entityLabel(e: CopilotEntityRef | null, typeLabel: (type: string) => string): string {
  if (!e) return "";
  const parts = [e.code, e.title].filter(Boolean);
  return parts.length ? parts.join(" · ") : typeLabel(e.type);
}

type ActionProps = {
  action: CopilotActionPreview;
  outcome: CopilotActionOutcome | undefined;
  related: string;
  route: string;
  base: string;
  onSave: () => void;
  onGo: (route: string) => void;
  onDrafts: () => void;
};

function ActionCard({ action, outcome, related, route, base, onSave, onGo, onDrafts }: ActionProps) {
  const t = useTranslations("copilot");
  const [confirm, setConfirm] = useState(false);
  const [more, setMore] = useState(false);
  const Icon = ACTION_ICONS[action.type] ?? FileTextIcon;
  const typeLabel = action.type ? (t.has(`action.type.${action.type}`) ? t(`action.type.${action.type}`) : humanize(action.type)) : t("action.preview");
  const state = outcome?.state;
  const long = action.content.length > 260;
  const asking = confirm && (!state || state === "error");
  const phase = !action.saveable ? "manual" : state ?? (asking ? "confirm" : "idle");
  const cardRef = useRef<HTMLElement>(null);
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (prevPhase.current === phase) return;
    prevPhase.current = phase;
    const card = cardRef.current;
    const a = document.activeElement;
    if (!card || (a && a !== document.body && a.isConnected)) return;
    card.querySelector<HTMLElement>("[data-cpl-focus]")?.focus({ preventScroll: true });
  }, [phase]);
  return (
    <article ref={cardRef} className="cpl-act" data-state={state ?? (asking ? "confirm" : "idle")}>
      <header className="cpl-act__h">
        <span className="cpl-act__ic">
          <Icon {...ICON} />
        </span>
        <span className="cpl-act__tt">
          <b>{action.title || typeLabel}</b>
          {action.title && action.title !== typeLabel ? <small>{typeLabel}</small> : null}
        </span>
        <span className="cpl-tag">{t("action.previewTag")}</span>
      </header>
      {related ? (
        <p className="cpl-act__rel">
          <LinkIcon {...ICON} size={13} />
          <span>{t("action.related", { title: related })}</span>
        </p>
      ) : null}
      {action.content ? (
        <>
          <div className={`cpl-act__pv${more || !long ? " is-open" : ""}`}>{action.content}</div>
          {long ? (
            <button type="button" className="cpl-link" aria-expanded={more} onClick={() => setMore((v) => !v)} data-ai-id={`${base}.more`}>
              <ChevronDownIcon {...ICON} size={14} className={more ? "cpl-rot" : undefined} />
              {more ? t("action.less") : t("action.more")}
            </button>
          ) : null}
        </>
      ) : null}
      <footer className="cpl-act__f">
        {!action.saveable ? (
          <>
            <p className="cpl-act__note">
              <InfoIcon {...ICON} size={14} />
              <span>{t("action.manual")}</span>
            </p>
            {route ? (
              <button type="button" className="cpl-btn cpl-btn--ghost" onClick={() => onGo(route)} data-ai-id={`${base}.open`}>
                <ArrowUpRightIcon {...ICON} />
                {t("open")}
              </button>
            ) : null}
          </>
        ) : state === "saving" ? (
          <span className="cpl-act__st" role="status" tabIndex={-1} data-cpl-focus="">
            <LoaderCircleIcon {...ICON} className="cpl-spin" />
            {t("action.saving")}
          </span>
        ) : state === "saved" ? (
          <>
            <span className="cpl-act__st cpl-act__st--ok" role="status">
              <CircleCheckIcon {...ICON} />
              {t("action.saved")}
            </span>
            <button type="button" className="cpl-link" onClick={onDrafts} data-ai-id={`${base}.drafts`} data-cpl-focus="">
              {t("action.viewDrafts")}
            </button>
          </>
        ) : state === "not_executed" ? (
          <>
            <p className="cpl-act__st cpl-act__st--warn" role="status" tabIndex={-1} data-cpl-focus="">
              <TriangleAlertIcon {...ICON} />
              <span>
                <b>{t("action.notExecuted")}</b> {t("action.notExecutedHint")}
              </span>
            </p>
            {route ? (
              <button type="button" className="cpl-btn cpl-btn--ghost" onClick={() => onGo(route)} data-ai-id={`${base}.open`}>
                <ArrowUpRightIcon {...ICON} />
                {t("open")}
              </button>
            ) : null}
          </>
        ) : state === "confirmation_required" ? (
          <>
            <p className="cpl-act__st cpl-act__st--warn" role="status">
              <InfoIcon {...ICON} />
              <span>{t("action.confirmRequired")}</span>
            </p>
            <button type="button" className="cpl-btn cpl-btn--pri" onClick={onSave} data-ai-id={`${base}.confirm`} data-cpl-focus="">
              <CheckIcon {...ICON} />
              {t("action.confirm")}
            </button>
          </>
        ) : asking ? (
          <div className="cpl-act__ask" role="group" aria-label={t("action.confirmTitle")}>
            <p>{t("action.confirmText")}</p>
            <div className="cpl-act__row">
              <button
                type="button"
                className="cpl-btn cpl-btn--pri"
                onClick={() => {
                  setConfirm(false);
                  onSave();
                }}
                data-ai-id={`${base}.confirm`}
                data-cpl-focus=""
              >
                <CheckIcon {...ICON} />
                {t("action.confirm")}
              </button>
              <button type="button" className="cpl-btn cpl-btn--ghost" onClick={() => setConfirm(false)} data-ai-id={`${base}.cancel`}>
                {t("action.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {state === "error" ? (
              <p className="cpl-act__st cpl-act__st--err" role="alert">
                <CircleAlertIcon {...ICON} />
                <span>{outcome?.message || t("err.other")}</span>
              </p>
            ) : null}
            <button type="button" className="cpl-btn cpl-btn--pri" onClick={() => setConfirm(true)} data-ai-id={`${base}.save`} data-cpl-focus="">
              <FilePenLineIcon {...ICON} />
              {t("action.saveDraft")}
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

function Feedback({ sent, base, onRate }: { sent: CopilotFeedback | null; base: string; onRate: (fb: CopilotFeedback) => Promise<void> }) {
  const t = useTranslations("copilot");
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(sent?.rating ?? 0);
  const [useful, setUseful] = useState<boolean | null>(sent?.useful ?? null);
  const [comment, setComment] = useState(sent?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (sent && !editing) {
    return (
      <div className="cpl-fb cpl-fb--done">
        <CircleCheckIcon {...ICON} size={15} />
        <span>{t("fb.sent")}</span>
        <button type="button" className="cpl-link" onClick={() => setEditing(true)} data-ai-id={`${base}.edit`}>
          {t("fb.edit")}
        </button>
      </div>
    );
  }
  async function send() {
    if (!rating || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onRate({ rating, useful, comment: comment.trim() });
      setEditing(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cpl-fb">
      <div className="cpl-fb__row">
        <span className="cpl-fb__t">{t("fb.title")}</span>
        <span className="cpl-stars" role="group" aria-label={t("fb.rating")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={n <= rating ? "is-on" : undefined}
              aria-pressed={rating === n}
              aria-label={t("fb.star", { n })}
              title={t("fb.star", { n })}
              onClick={() => setRating(n)}
              data-ai-id={`${base}.star.${n}`}
            >
              <StarIcon {...ICON} size={17} />
            </button>
          ))}
        </span>
        <button type="button" className="cpl-useful" aria-pressed={useful === true} onClick={() => setUseful((v) => (v === true ? null : true))} data-ai-id={`${base}.useful`}>
          <ThumbsUpIcon {...ICON} size={14} />
          {t("fb.useful")}
        </button>
      </div>
      {rating ? (
        <form
          className="cpl-fb__more"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            type="text"
            value={comment}
            maxLength={500}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("fb.comment")}
            aria-label={t("fb.comment")}
            data-ai-id={`${base}.comment`}
          />
          <button type="submit" className="cpl-btn cpl-btn--pri cpl-btn--sm" disabled={busy} data-ai-id={`${base}.send`}>
            {busy ? <LoaderCircleIcon {...ICON} size={14} className="cpl-spin" /> : null}
            {t("fb.send")}
          </button>
        </form>
      ) : null}
      {failed ? (
        <p className="cpl-fb__err" role="alert">
          {t("fb.error")}
        </p>
      ) : null}
    </div>
  );
}

export type CopilotTurnProps = {
  turn: CopilotTurn;
  index: number;
  role: Role;
  busy: boolean;
  onRetry: (turn: CopilotTurn) => void;
  onGo: (route: string, highlight: CopilotHighlight | null) => void;
  onFlash: (highlight: CopilotHighlight) => void;
  onSave: (turn: CopilotTurn, action: CopilotActionPreview) => void;
  onRate: (turn: CopilotTurn, feedback: CopilotFeedback) => Promise<void>;
  onDrafts: () => void;
};

export default function CopilotTurnView({ turn, index, role, busy, onRetry, onGo, onFlash, onSave, onRate, onDrafts }: CopilotTurnProps) {
  const t = useTranslations("copilot");
  const reply = turn.reply;
  const base = `copilot.answer.${index}`;
  const typeLabel = (type: string) => (t.has(`ctx.type.${type}`) ? t(`ctx.type.${type}`) : humanize(type));
  const nav = reply?.navigation ? copilotRoute({ route: reply.navigation.route, pageId: reply.navigation.pageId, params: reply.navigation.params }, role) : "";
  const showActions = !!reply && reply.provider !== "openai_text_fallback" && reply.provider !== "fallback";
  const sources = reply ? reply.sources.slice(0, 6) : [];
  const toolLabel = (name: string) => (t.has(`tool.name.${name}`) ? t(`tool.name.${name}`) : humanize(name));
  return (
    <article className="cpl-turn" data-status={turn.status}>
      <p className="cpl-me">{turn.ask}</p>
      {turn.status === "sending" ? (
        <div className="cpl-wait">
          <span className="cpl-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>{t("thinking")}</span>
        </div>
      ) : turn.status === "failed" || turn.status === "canceled" ? (
        <div className={`cpl-err${turn.status === "canceled" ? " cpl-err--soft" : ""}`} role={turn.status === "failed" ? "alert" : undefined}>
          {turn.status === "failed" ? <CircleAlertIcon {...ICON} /> : <InfoIcon {...ICON} />}
          <span>{t(`err.${turn.error ?? "other"}`)}</span>
          {turn.error !== "role" ? (
            <button type="button" onClick={() => onRetry(turn)} disabled={busy} data-ai-id={`copilot.turn.${index}.retry`}>
              <RotateCcwIcon {...ICON} size={14} />
              {t("retry")}
            </button>
          ) : null}
        </div>
      ) : reply ? (
        <div className={`cpl-ai cpl-ai--${reply.intent}`} data-provider={reply.provider || undefined}>
          <span className="cpl-ai__av" aria-hidden="true">
            <SparklesIcon {...ICON} size={14} />
          </span>
          <div className="cpl-ai__body">
            {reply.limited ? (
              <p className="cpl-note">
                <InfoIcon {...ICON} size={14} />
                <span>{t("limited")}</span>
              </p>
            ) : null}
            {reply.answer.trim() ? <CopilotText text={reply.answer} /> : <p className="cpl-text cpl-text--empty">{t("emptyAnswer")}</p>}
            {reply.partial ? (
              <p className="cpl-note cpl-note--warn">
                <TriangleAlertIcon {...ICON} size={14} />
                <span>{t("partial")}</span>
              </p>
            ) : null}
            {nav ? (
              <button type="button" className="cpl-go" onClick={() => onGo(nav, reply.highlight)} data-ai-id={`${base}.open`}>
                <ArrowUpRightIcon {...ICON} />
                <span>{reply.navigation?.title ? t("openTo", { title: reply.navigation.title }) : t("open")}</span>
              </button>
            ) : reply.highlight ? (
              <button type="button" className="cpl-go cpl-go--ghost" onClick={() => reply.highlight && onFlash(reply.highlight)} data-ai-id={`${base}.show`}>
                <LocateFixedIcon {...ICON} />
                <span>{t("show")}</span>
              </button>
            ) : null}
            {showActions
              ? reply.actions.map((a, j) => {
                  const same = !a.entityId || (turn.entity && a.entityId === turn.entity.id);
                  const related = same ? entityLabel(turn.entity, typeLabel) : a.entityType ? typeLabel(a.entityType) : "";
                  return (
                    <ActionCard
                      key={`${a.id}-${j}`}
                      action={a}
                      outcome={turn.actions[a.id]}
                      related={related}
                      route={a.route ? copilotRoute({ route: a.route }, role) : ""}
                      base={`${base}.action.${j}`}
                      onSave={() => onSave(turn, a)}
                      onGo={(r) => onGo(r, null)}
                      onDrafts={onDrafts}
                    />
                  );
                })
              : null}
            {sources.length ? (
              <div className="cpl-src">
                <span className="cpl-src__t">{t("basedOn")}</span>
                {sources.map((s, j) => {
                  const r = copilotRoute({ route: s.route, pageId: s.type === "system_page" ? s.id : "" }, role);
                  return r ? (
                    <button key={j} type="button" className="cpl-chip cpl-chip--go" onClick={() => onGo(r, null)} data-ai-id={`${base}.source.${j}`}>
                      {s.title}
                    </button>
                  ) : (
                    <span key={j} className="cpl-chip">
                      {s.title}
                    </span>
                  );
                })}
              </div>
            ) : null}
            {reply.toolResults.length ? (
              <details className="cpl-det">
                <summary data-ai-id={`${base}.details`}>
                  <ChevronDownIcon {...ICON} size={14} className="cpl-det__chev" />
                  {t("details")}
                  <span className="cpl-det__n">{reply.toolResults.length}</span>
                </summary>
                <ul>
                  {reply.toolResults.map((x, j) => (
                    <li key={`${x.name}-${j}`} data-ok={x.ok ? "1" : "0"}>
                      {x.ok ? <CircleCheckIcon {...ICON} size={14} /> : <CircleXIcon {...ICON} size={14} />}
                      <span>{toolLabel(x.name)}</span>
                      <small>{x.ok ? t("tool.ok") : x.status ? t("tool.failedCode", { code: x.status }) : t("tool.failed")}</small>
                    </li>
                  ))}
                  {reply.confidence !== null ? <li className="cpl-det__conf">{t("confidence", { value: Math.round(reply.confidence * 100) })}</li> : null}
                </ul>
              </details>
            ) : null}
            <Feedback key={reply.requestId} sent={turn.feedback} base={`${base}.feedback`} onRate={(fb) => onRate(turn, fb)} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

export const copilotSeg = (v: string) => aiSeg(v).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48) || "x";
