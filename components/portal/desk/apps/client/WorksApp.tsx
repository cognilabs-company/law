"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listClientWorks, getClientWork, listReviewable, listMyReviews, submitReview, WORKS_PAGE, type ClientWork, type ClientWorkDetail, type ClientWorkTab, type MyReview, type ReviewTarget } from "@/lib/services/backend";
import { subscribeUserEvents } from "@/lib/userSocket";
import { asDict, asStr } from "@/lib/http";
import { statusLabel } from "@/lib/labels";
import { shortDateTime } from "@/lib/date";
import { matchesSearch } from "@/lib/searchText";
import { profileTabHref } from "@/lib/profileTabs";
import { IconAlert, IconArrowRight, IconBolt, IconBriefcase, IconChat, IconDocLines, IconInbox, IconRefresh, IconScale, IconSearch, IconStarRate, IconVideo } from "@/components/icons";
import { App, Avatar, Btn, Dialog, Empty, Field, Loading, Search, Select, Sidebar, Table, Tag, TextArea, Tool, Toolbar, useOs, useToast, type Col, type NavSection } from "../../kit/kit";
import type { NativeProps } from "../../native";
import { StarPicker, StarsView, toneOf } from "./bits";
import "./client.css";

// The client's works as a desktop program — every legal process they have
// going (advocate document work, urgent help, orders, cases, complaints) in
// one list, by the kinds the backend names; the chosen one's details on the
// right with the way to its chat and to the program it is worked on in. The
// works waiting for a rating, and the ratings given, sit below.

const TYPE_ICON: Record<string, ReactNode> = {
  all: <IconInbox />,
  document_lawyer_work: <IconDocLines />,
  urgent_advokat: <IconBolt />,
  quality_complaint: <IconAlert />,
  complaint: <IconAlert />,
  service_order: <IconScale />,
  legal_case: <IconBriefcase />,
};
const TYPE_HREF: Record<string, string> = {
  document_lawyer_work: "/portal/client/documents",
  urgent_advokat: "/portal/client/urgent",
  quality_complaint: profileTabHref("complaints"),
  complaint: profileTabHref("complaints"),
  service_order: profileTabHref("payments"),
  legal_case: "/portal/client/cases",
};
const NS = ["status", "orderStatus", "orderStage", "paymentStatus", "docStatus"];

export default function WorksApp({ openLink }: NativeProps) {
  const t = useTranslations("portal.client.works");
  const tr = useTranslations("portal.client.reviews");
  const tcm = useTranslations("portal.common");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const os = useOs();
  const [view, setView] = useState("all");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ClientWork[] | null>(null);
  const [total, setTotal] = useState(0);
  const [tabs, setTabs] = useState<ClientWorkTab[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState("");
  const [pending, setPending] = useState<ReviewTarget[] | null>(null);
  const [mine, setMine] = useState<MyReview[] | null>(null);
  const [rate, setRate] = useState<ReviewTarget | null>(null);
  const [toast, say] = useToast();
  const reviews = view === "rate" || view === "reviews";
  const type = reviews ? "all" : view;

  useEffect(() => {
    if (reviews) return;
    let alive = true;
    listClientWorks({ type, status: status || undefined, limit: WORKS_PAGE, offset: 0 })
      .then((p) => {
        if (!alive) return;
        setRows(p.items);
        setTotal(p.total);
        if (p.tabs.length) setTabs(p.tabs);
        if (!status) setSeen((s) => [...new Set([...s, ...p.items.map((w) => w.status).filter(Boolean)])]);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [type, status, tick, reviews]);
  useEffect(() => {
    let alive = true;
    Promise.allSettled([listReviewable(), listMyReviews()]).then(([a, b]) => {
      if (!alive) return;
      setPending(a.status === "fulfilled" ? a.value : []);
      setMine(b.status === "fulfilled" ? b.value : []);
    });
    return () => {
      alive = false;
    };
  }, [tick]);
  useEffect(
    () =>
      subscribeUserEvents((e) => {
        const ev = typeof e.event === "string" ? e.event : "";
        if (/^(quality_complaint\.|urgent_advokat\.|document_request\.)/.test(ev)) setTick((n) => n + 1);
      }),
    [],
  );
  const loadMore = async () => {
    if (!rows || more) return;
    setMore(true);
    try {
      const p = await listClientWorks({ type, status: status || undefined, limit: WORKS_PAGE, offset: rows.length });
      setRows((r) => {
        const have = new Set((r ?? []).map((x) => x.id));
        return [...(r ?? []), ...p.items.filter((x) => !have.has(x.id))];
      });
      setTotal(p.total);
    } catch {
      say(tcm("loadError"), "err");
    } finally {
      setMore(false);
    }
  };

  const typeName = useCallback((k: string) => (k === "all" ? t("tabAll") : tabs.find((x) => x.key === k)?.title || (t.has(`type.${k}`) ? t(`type.${k}`) : k)), [t, tabs]);
  const statusText = (w: Pick<ClientWork, "status" | "type" | "statusLabel">) => {
    if (!w.status) return w.statusLabel;
    const complaint = w.type === "complaint" || w.type === "quality_complaint";
    if (complaint && t.has(`qcAction.${w.status}`)) return t(`qcAction.${w.status}`);
    if (NS.some((ns) => tcm.has(`${ns}.${w.status}`))) return statusLabel(tcm, w.status, w.type === "document_lawyer_work" ? "docStatus" : undefined);
    return w.statusLabel || statusLabel(tcm, w.status);
  };
  const shown = useMemo(() => (rows ?? []).filter((w) => !q.trim() || matchesSearch(`${w.title} ${w.workId} ${typeName(w.type)} ${w.assignedLawyer?.name ?? ""}`, q)), [rows, q, typeName]);
  const cur = shown.find((w) => w.id === sel) ?? null;
  const keys = tabs.length ? tabs.map((x) => x.key) : ["all", ...Object.keys(TYPE_HREF).filter((k) => k !== "complaint")];
  const sections: NavSection[] = [
    { id: "w", title: os === "mac" ? t("title") : undefined, items: keys.map((k) => ({ id: k, label: typeName(k), icon: TYPE_ICON[k] ?? <IconBriefcase /> })) },
    {
      id: "r",
      title: tr("mineTitle"),
      items: [
        { id: "rate", label: tr("pendingTitle"), icon: <IconStarRate />, count: pending?.length || undefined },
        { id: "reviews", label: tr("mineTitle"), icon: <IconChat />, count: mine?.length || undefined },
      ],
    },
  ];
  const cols: Col<ClientWork>[] = [
    {
      id: "title",
      label: t("title"),
      width: "minmax(220px,2fr)",
      cell: (w) => (
        <span className="dxcw-name">
          <span className={`dxcw-ic is-${toneOf(w.status)}`} aria-hidden>
            {TYPE_ICON[w.type] ?? <IconBriefcase />}
          </span>
          <span>
            <b>{w.title || typeName(w.type)}</b>
            <small>
              {w.workId ? <code>{w.workId}</code> : null}
              {typeName(w.type)}
            </small>
          </span>
        </span>
      ),
    },
    { id: "who", label: t("fLawyer"), width: "minmax(120px,1fr)", cell: (w) => w.assignedLawyer?.name || w.operator?.name || "—" },
    { id: "status", label: t("fStatus"), width: "minmax(120px,auto)", cell: (w) => <Tag tone={toneOf(w.status)}>{statusText(w)}</Tag> },
  ];
  const search = <Search value={q} onChange={setQ} placeholder={t("searchPh")} wide={os === "win"} />;

  let body: ReactNode;
  if (view === "rate")
    body = (
      <>
        <Toolbar title={tr("pendingTitle")} subtitle={tr("pendingLead")}>
          <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => setTick((n) => n + 1)} />
        </Toolbar>
        {pending === null ? (
          <Loading label={tr("pendingTitle")} />
        ) : !pending.length ? (
          <Empty icon={<IconStarRate />} title={tr("pendingTitle")} text={t("emptyText")} />
        ) : (
          <ul className="dxcw-cards">
            {pending.map((r) => (
              <li key={r.id}>
                <Avatar name={r.lawyerName || "?"} size={40} />
                <span>
                  <b>{r.lawyerName || "—"}</b>
                  <small>{[r.service, r.completedAt ? shortDateTime(r.completedAt, locale) : ""].filter(Boolean).join(" · ")}</small>
                </span>
                <Btn kind="primary" icon={<IconStarRate />} onClick={() => setRate(r)}>
                  {tr("rate")}
                </Btn>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  else if (view === "reviews")
    body = (
      <>
        <Toolbar title={tr("mineTitle")} />
        {mine === null ? (
          <Loading label={tr("mineTitle")} />
        ) : !mine.length ? (
          <Empty icon={<IconChat />} title={tr("mineTitle")} />
        ) : (
          <ul className="dxcw-cards">
            {mine.map((r) => (
              <li key={r.id}>
                <Avatar name={r.lawyerName || "?"} size={40} />
                <span>
                  <b>{r.lawyerName || "—"}</b>
                  <StarsView value={r.rating} small />
                  {r.comment ? <p>{r.comment}</p> : null}
                </span>
                <small>{r.createdAt ? shortDateTime(r.createdAt, locale) : ""}</small>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  else
    body = (
      <>
        <Toolbar title={typeName(view)} subtitle={rows ? d("works", { n: total }) : undefined} end={os === "mac" ? search : undefined}>
          {seen.length >= 2 ? <Select value={status} onChange={setStatus} ariaLabel={tcm("filterStatus")} options={[{ value: "", label: tcm("filterAllStatuses") }, ...seen.map((s) => ({ value: s, label: statusText({ status: s, type: view, statusLabel: "" }) }))]} /> : null}
          <Tool icon={<IconDocLines />} label={t("documentsLink")} onClick={() => openLink({ appId: "", route: "/portal/client/documents" })} />
          <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => setTick((n) => n + 1)} />
        </Toolbar>
        <div className="dxcw-body">
          {rows === null ? (
            failed ? (
              <Empty icon={<IconAlert />} title={tcm("loadError")} text={tcm("loadErrorText")} action={<Btn onClick={() => setTick((n) => n + 1)}>{d("refresh")}</Btn>} />
            ) : (
              <Loading label={t("title")} />
            )
          ) : (
            <>
              <Table
                label={t("title")}
                cols={cols}
                rows={shown}
                rowKey={(w) => w.id}
                selected={sel}
                onSelect={(w) => setSel(w.id)}
                onOpen={(w) => TYPE_HREF[w.type] && openLink({ appId: "", route: TYPE_HREF[w.type] })}
                empty={q.trim() ? <Empty icon={<IconSearch />} title={t("searchEmpty")} text={t("searchEmptyText")} /> : <Empty icon={TYPE_ICON[view] ?? <IconBriefcase />} title={t("empty")} text={status ? t("filterEmptyText") : t("emptyText")} />}
              />
              {rows.length < total ? (
                <div className="dxcw-more">
                  <Btn small busy={more} onClick={() => void loadMore()}>
                    {t("more", { n: total - rows.length })}
                  </Btn>
                </div>
              ) : null}
            </>
          )}
        </div>
      </>
    );

  return (
    <App
      name="cworks"
      sidebar={<Sidebar label={t("title")} sections={sections} value={view} onChange={(v) => (setView(v), setSel(""), setStatus(""))} header={os === "win" && !reviews ? search : undefined} />}
      inspector={cur && !reviews ? <WorkInfo key={cur.id} w={cur} typeName={typeName} statusText={statusText} openLink={openLink} /> : undefined}
    >
      {body}
      {rate ? (
        <RateDialog
          target={rate}
          onClose={() => setRate(null)}
          onDone={() => {
            setRate(null);
            setTick((n) => n + 1);
            say(tr("thanks"));
          }}
        />
      ) : null}
      {toast}
    </App>
  );
}

// The chosen work: its facts, what the backend adds for its kind, and the
// way to its chat and its own program.
function WorkInfo({ w, typeName, statusText, openLink }: { w: ClientWork; typeName: (k: string) => string; statusText: (w: ClientWork) => string; openLink: NativeProps["openLink"] }) {
  const t = useTranslations("portal.client.works");
  const locale = useLocale();
  const [d, setD] = useState<ClientWorkDetail | null>(null);
  useEffect(() => {
    if (!w.workId) return;
    let alive = true;
    getClientWork(w.workId)
      .then((x) => alive && setD(x))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [w.workId]);
  const b = d?.blocks ?? {};
  const complaint = asDict(b.complaint);
  const complaintText = asStr(complaint.complaint) || asStr(complaint.description) || asStr(complaint.text) || asStr(asDict(complaint.payload).description) || asStr(asDict(complaint.payload).complaint);
  const review = asDict(b.review ?? b.resolution);
  const reviewText = [asStr(review.action) || asStr(review.status), asStr(review.note) || asStr(review.comment) || asStr(review.text)].filter(Boolean).join(" — ");
  const room = asStr(asDict(b.chat).room_id) || asStr(asDict(b.lawyer_request).secure_chat_room_id);
  const rows: [string, string][] = [
    [t("fWorkId"), w.workId || "—"],
    [t("fType"), typeName(w.type)],
    [t("fLawyer"), w.assignedLawyer?.name || "—"],
    ...(w.operator?.name ? ([[t("fOperator"), w.operator.name]] as [string, string][]) : []),
    [t("fCreated"), w.createdAt ? shortDateTime(w.createdAt, locale) : "—"],
  ];
  return (
    <aside className="dxcw-insp" aria-label={w.title}>
      <header>
        <span className={`dxcw-ic is-big is-${toneOf(w.status)}`} aria-hidden>
          {TYPE_ICON[w.type] ?? <IconBriefcase />}
        </span>
        <h2>{w.title || typeName(w.type)}</h2>
        <span className="dxcw-tags">
          <Tag tone={toneOf(w.status)}>{statusText(w)}</Tag>
          {w.hasChat ? (
            <Tag tone="info">
              <IconChat aria-hidden /> {t("hasChat")}
            </Tag>
          ) : null}
          {w.hasMeeting ? (
            <Tag tone="info">
              <IconVideo aria-hidden /> {t("hasMeeting")}
            </Tag>
          ) : null}
        </span>
      </header>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {complaintText ? (
        <section>
          <h3>{t("bComplaint")}</h3>
          <p>{complaintText}</p>
        </section>
      ) : null}
      {reviewText ? (
        <section>
          <h3>{t("bReview")}</h3>
          <p>{reviewText}</p>
        </section>
      ) : null}
      <div className="dxcw-acts">
        {room ? (
          <Btn kind="primary" icon={<IconChat />} onClick={() => openLink({ appId: "", route: `/portal/chat/${room}` })}>
            {t("openChat")}
          </Btn>
        ) : null}
        {TYPE_HREF[w.type] ? (
          <Btn kind={room ? "default" : "primary"} icon={<IconArrowRight />} onClick={() => openLink({ appId: "", route: TYPE_HREF[w.type] })}>
            {t("openWork")}
          </Btn>
        ) : null}
      </div>
    </aside>
  );
}

function RateDialog({ target, onClose, onDone }: { target: ReviewTarget; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("portal.client.reviews");
  const tw = useTranslations("portal.client.rate");
  const d = useTranslations("portal.desk.client");
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await submitReview({ case_id: target.caseId, lawyer_user_id: target.lawyerUserId, rating: stars, comment: comment.trim() || undefined });
      onDone();
    } catch {
      setErr(t("sendFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t("modalTitle")}
      onClose={onClose}
      onSubmit={() => void send()}
      actions={
        <>
          <Btn onClick={onClose}>{d("cancel")}</Btn>
          <Btn kind="primary" type="submit" busy={busy}>
            {busy ? t("sending") : t("submit")}
          </Btn>
        </>
      }
    >
      <p className="dx-dlg__text">{[target.lawyerName, target.service].filter(Boolean).join(" · ")}</p>
      <Field label={t("ratingLabel")}>
        <StarPicker value={stars} onChange={setStars} label={t("ratingLabel")} words={(n) => (tw.has(`w${n}`) ? tw(`w${n}`) : String(n))} />
      </Field>
      <Field label={t("commentLabel")}>
        <TextArea value={comment} onChange={setComment} placeholder={t("commentPh")} rows={3} maxLength={1000} ariaLabel={t("commentLabel")} />
      </Field>
      {err ? <p className="dxcw-err">{err}</p> : null}
    </Dialog>
  );
}
