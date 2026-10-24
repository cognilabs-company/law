"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { contactBlockedOf } from "@/lib/http";
import { dateOnly, dateTimeFull } from "@/lib/date";
import { humanize, personName } from "@/lib/labels";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  COMPLAINT_CATEGORIES,
  DESC_MAX,
  DESC_MIN,
  SUBJECT_MAX,
  SUBJECT_MIN,
  complaintMatches,
  complaintStage,
  fileComplaint,
  findWorkRef,
  getQualityComplaintDetail,
  getWorkRef,
  isComplaintEvent,
  listComplaintTargets,
  loadComplaintFeed,
  matchesRef,
  sourceHref,
  workHref,
  workRefValue,
  type ComplaintDetail as Detail,
  type ComplaintItem,
  type ComplaintStage,
  type WorkRef,
} from "@/lib/services/complaints";
import { CategoryIcon, STAGE_ICONS, useComplaintLabels } from "@/components/complaints/bits";
import ContactBlockedNote from "@/components/ContactBlockedNote";
import { IconArrowRight, IconChat, IconCheck, IconClose, IconPlus, IconRefresh, IconSearch, IconSend, IconStarRate } from "@/components/icons";
import { Banner, Btn, Dialog, Field, Group, Input, Search, Select, SettingRow, Spinner, Tag, TextArea, type Tone } from "../../kit/kit";
import type { NativeProps } from "../../native";
import { StarsView } from "./bits";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

// Complaints as a settings page: the three steps (write, review, the
// decision) and the client's complaints — written ones and those opened by
// a 1–2 star rating — as rows with their stage; a row opens its details
// (the process, the work it is about, the staff's reply, the rating), and
// "New complaint" asks which work, what kind, and what happened. Realtime
// events refresh the list. The rules are ClientComplaints'.

type Feed = { status: "loading" | "ready" | "error"; items: ComplaintItem[]; manualFailed: boolean; qualityFailed: boolean };
type Draft = { category: string; subject: string; description: string; related: string };
const STAGE_TONE: Record<ComplaintStage, Tone> = { new: "warn", review: "info", rework: "warn", resolved: "ok", rejected: "err", closed: "neutral" };

export default function Complaints({ work, about, fresh, openLink, say }: { work: string; about: string; fresh: boolean; openLink: NativeProps["openLink"]; say: (m: string, tone?: "err") => void }) {
  const t = useTranslations("portal.client.complaints");
  const tcm = useTranslations("portal.common");
  const tc = useTranslations("common");
  const L = useComplaintLabels();
  const [feed, setFeed] = useState<Feed>({ status: "loading", items: [], manualFailed: false, qualityFailed: false });
  const [req, setReq] = useState({ n: 0, soft: false });
  const [stage, setStage] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ComplaintItem | null>(null);
  const [writing, setWriting] = useState(fresh);
  const [focus, setFocus] = useState(work);
  const [missing, setMissing] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadComplaintFeed()
      .then((r) => alive && setFeed({ status: "ready", ...r }))
      .catch(() => alive && !req.soft && setFeed((f) => ({ ...f, status: "error" })));
    return () => {
      alive = false;
    };
  }, [req]);
  const soft = useCallback(() => setReq((r) => ({ n: r.n + 1, soft: true })), []);
  useEffect(() => subscribeUserEvents((ev) => isComplaintEvent(ev) && soft()), [soft]);
  // A link naming a work (?work=) opens its complaint once the list is in.
  if (focus && feed.status === "ready") {
    const hit = feed.items.find((x) => matchesRef(x, focus));
    setFocus("");
    if (hit) setOpen(hit);
    else if (!feed.manualFailed && !feed.qualityFailed) setMissing(true);
  }

  const stages = useMemo(() => [...new Set(feed.items.map((x) => complaintStage(x.status)))], [feed.items]);
  const shown = feed.items.filter((x) => (!stage || complaintStage(x.status) === stage) && (!q.trim() || complaintMatches(x, q.trim(), [x.category ? L.category(x.category) : "", L.source(x.source)])));

  return (
    <>
      <div className="dxcc-head">
        <p>{t("lead")}</p>
        <Btn kind="primary" icon={<IconPlus />} onClick={() => (setSent(null), setWriting(true))}>
          {t("new")}
        </Btn>
      </div>
      <ol className="dxco-steps dxcc-steps" aria-label={t("stepsLabel")}>
        {(["write", "review", "decision"] as const).map((k, i) => (
          <li key={k}>
            <i>{i + 1}</i>
            <span>{t(`steps.${k}`)}</span>
          </li>
        ))}
      </ol>
      <p className="dxcs-lead dxcc-auto">
        <IconStarRate aria-hidden /> {t("auto")}{" "}
        <button type="button" className="dxcc-link" onClick={() => openLink({ appId: "", route: "/portal/client/support" })}>
          {t("chatLink")}
        </button>
      </p>
      {sent !== null ? (
        <Banner tone="ok" title={t("sent")} onClose={() => setSent(null)} closeLabel={t("cancel")}>
          {[sent ? `${t("sentRef")} ${sent}` : "", t("sentNext")].filter(Boolean).join(" · ")}
        </Banner>
      ) : null}
      {missing ? (
        <Banner tone="info" onClose={() => setMissing(false)} closeLabel={t("cancel")}>
          {t("linkMissing")}
        </Banner>
      ) : null}
      {feed.status === "ready" && (feed.manualFailed || feed.qualityFailed) ? (
        <Banner tone="warn" action={<Btn small icon={<IconRefresh />} onClick={() => setReq((r) => ({ n: r.n + 1, soft: false }))}>{tc("retry")}</Btn>}>
          {feed.manualFailed ? t("partialManual") : t("partialQuality")}
        </Banner>
      ) : null}
      {feed.items.length > 1 ? (
        <div className="dxcc-bar">
          {stages.length > 1 ? <Select value={stage} onChange={setStage} ariaLabel={tcm("filterStatus")} options={[{ value: "", label: tcm("filterAllStatuses") }, ...stages.map((s) => ({ value: s, label: L.stage(s) }))]} /> : null}
          {feed.items.length >= 5 ? <Search value={q} onChange={(v) => setQ(v.slice(0, 120))} placeholder={t("filter.searchPh")} /> : null}
        </div>
      ) : null}
      <Group title={t("listLabel")}>
        {feed.status === "loading" ? (
          <Spinner small />
        ) : feed.status === "error" ? (
          <SettingRow title={t("loadError")} desc={tcm("loadErrorText")}>
            <Btn small icon={<IconRefresh />} onClick={() => (setFeed((f) => ({ ...f, status: "loading" })), setReq((r) => ({ n: r.n + 1, soft: false })))}>
              {tc("retry")}
            </Btn>
          </SettingRow>
        ) : !feed.items.length ? (
          <SettingRow title={t("empty")} desc={t("emptyText")} />
        ) : !shown.length ? (
          <SettingRow icon={<IconSearch />} title={t("filter.empty")}>
            <Btn small onClick={() => (setStage(""), setQ(""))}>
              {t("filter.reset")}
            </Btn>
          </SettingRow>
        ) : (
          shown.map((x) => <Row key={x.key} x={x} onOpen={() => setOpen(x)} />)
        )}
      </Group>
      {open ? <DetailDialog key={open.key} item={feed.items.find((x) => x.key === open.key) ?? open} openLink={openLink} onClose={() => setOpen(null)} /> : null}
      {writing ? (
        <NewDialog
          about={about}
          onClose={() => setWriting(false)}
          onCreated={(item) => {
            setWriting(false);
            setSent(item.workId);
            setStage("");
            setQ("");
            setFeed((f) => ({ ...f, status: "ready", items: [item, ...f.items.filter((y) => y.key !== item.key)] }));
            soft();
          }}
          onError={(m) => say(m, "err")}
        />
      ) : null}
    </>
  );
}

function Row({ x, onOpen }: { x: ComplaintItem; onOpen: () => void }) {
  const t = useTranslations("portal.client.complaints");
  const locale = useLocale();
  const L = useComplaintLabels();
  const quality = x.kind === "quality";
  const facet = quality ? L.source(x.source) : x.category ? L.category(x.category) : "";
  const st = complaintStage(x.status);
  return (
    <SettingRow
      icon={quality ? <IconStarRate /> : <CategoryIcon category={x.category} />}
      title={x.subject || facet || L.kind(x.kind)}
      desc={[quality ? t("filter.quality") : facet, x.workId, x.createdAt ? dateOnly(x.createdAt, locale) : ""].filter(Boolean).join(" · ")}
      onClick={onOpen}
    >
      <Tag tone={STAGE_TONE[st]}>{L.tag(x.status)}</Tag>
    </SettingRow>
  );
}

// One complaint: the process, what it is about, the staff's reply, and —
// for a rating complaint — the stars and the comment.
function DetailDialog({ item, openLink, onClose }: { item: ComplaintItem; openLink: NativeProps["openLink"]; onClose: () => void }) {
  const t = useTranslations("portal.client.complaints");
  const tw = useTranslations("portal.client.works");
  const tc = useTranslations("common");
  const locale = useLocale();
  const L = useComplaintLabels();
  const quality = item.kind === "quality";
  const ref = item.workId || item.id;
  const [detail, setDetail] = useState<Detail | null | "loading" | "error">(quality && ref ? "loading" : null);
  const [tick, setTick] = useState(0);
  const [workRef, setWorkRef] = useState<WorkRef | null | "loading">(item.relatedRef ? "loading" : null);
  useEffect(() => {
    if (!quality || !ref) return;
    let alive = true;
    getQualityComplaintDetail(ref)
      .then((x) => alive && setDetail(x))
      .catch(() => alive && setDetail((cur) => (cur && typeof cur === "object" ? cur : "error")));
    return () => {
      alive = false;
    };
  }, [quality, ref, tick, item.status, item.updatedAt]);
  useEffect(() => {
    if (!item.relatedRef) return;
    let alive = true;
    getWorkRef(item.relatedRef)
      .then((x) => alive && setWorkRef(x))
      .catch(() => alive && setWorkRef(null));
    return () => {
      alive = false;
    };
  }, [item.relatedRef]);
  const d = detail && typeof detail === "object" ? detail : null;
  const status = d?.status || item.status;
  const stage = complaintStage(status);
  const decided = stage === "resolved" || stage === "rejected" || stage === "closed";
  const reviewed = decided || stage === "rework";
  const operator = personName(d?.operatorName || item.operatorName);
  const note = d?.operatorNote || item.operatorNote;
  const lawyer = personName(d?.lawyerName || item.lawyerName);
  const decidedAt = decided ? d?.resolvedAt || item.resolvedAt || d?.updatedAt || item.updatedAt : "";
  const StateIcon = STAGE_ICONS[stage];
  const go = (route: string) => (onClose(), openLink({ appId: "", route }));
  const rel =
    quality && item.source
      ? { title: d?.workTitle || item.subject || L.source(item.source), id: "", href: sourceHref(item.source) }
      : workRef && workRef !== "loading" && workRef.id
        ? { title: workRef.title || (tw.has(`type.${workRef.type}`) ? tw(`type.${workRef.type}`) : humanize(workRef.type)), id: workRef.workId, href: workHref(workRef.type) }
        : item.relatedRef && workRef !== "loading"
          ? { title: t("relatedId", { id: item.relatedRef }), id: "", href: "" }
          : null;
  const steps: { label: string; sub: string; tone: "done" | "now" | "todo" | "fail" }[] = [
    { label: t("step.received"), sub: item.createdAt ? dateTimeFull(item.createdAt, locale) : "", tone: "done" },
    { label: reviewed ? t("step.reviewed") : t("step.review"), sub: reviewed ? "" : stage === "new" ? t("step.queued") : t("step.active"), tone: reviewed ? "done" : "now" },
    { label: decided || stage === "rework" ? L.tag(status) : t("step.decision"), sub: decidedAt ? dateTimeFull(decidedAt, locale) : "", tone: stage === "rejected" ? "fail" : decided ? "done" : reviewed ? "now" : "todo" },
  ];
  return (
    <Dialog
      open
      title={t("detailTitle")}
      width={620}
      onClose={onClose}
      actions={
        <>
          <Btn icon={<IconChat />} onClick={() => go("/portal/client/support")}>
            {t("chatShort")}
          </Btn>
          <Btn kind="primary" onClick={onClose}>
            {t("cancel")}
          </Btn>
        </>
      }
    >
      <div className={`dxcc-state is-${stage}`}>
        <StateIcon aria-hidden />
        <span>
          <b>{quality ? L.kind("quality") : item.category ? L.category(item.category) : L.kind("manual")}</b>
          <small>{L.hint({ kind: item.kind, status })}</small>
          {stage === "rejected" ? <small>{t("escalate")}</small> : null}
        </span>
        <Tag tone={STAGE_TONE[stage]}>{L.tag(status)}</Tag>
      </div>
      {item.workId ? <code className="dxcw-code">{item.workId}</code> : null}
      <ol className="dxco-steps" aria-label={t("timeline")}>
        {steps.map((s, i) => (
          <li key={i} className={s.tone === "done" ? "is-done" : s.tone === "now" ? "is-now" : s.tone === "fail" ? "is-fail" : ""}>
            <i>{s.tone === "done" ? <IconCheck /> : s.tone === "fail" ? <IconClose /> : i + 1}</i>
            <span title={s.sub}>{s.label}</span>
          </li>
        ))}
      </ol>
      {rel || workRef === "loading" ? (
        <div className="dx-field">
          <span className="dx-field__l">{t("related")}</span>
          {workRef === "loading" && !rel ? (
            <Spinner small />
          ) : rel ? (
            <SettingRow title={rel.title} desc={[rel.id, lawyer ? `${t("f.lawyer")}: ${lawyer}` : ""].filter(Boolean).join(" · ")}>
              {rel.href ? (
                <Btn small kind="plain" icon={<IconArrowRight />} onClick={() => go(rel.href)}>
                  {t("relatedOpen")}
                </Btn>
              ) : null}
            </SettingRow>
          ) : null}
        </div>
      ) : null}
      {note ? (
        <div className="dxcc-reply">
          <small>{`${operator || t("reply.staff")}${decidedAt ? ` · ${dateTimeFull(decidedAt, locale)}` : ""}`}</small>
          <p>{note}</p>
        </div>
      ) : null}
      {quality ? (
        detail === "loading" ? (
          <Spinner small />
        ) : detail === "error" ? (
          <Banner tone="err" action={<Btn small icon={<IconRefresh />} onClick={() => (setDetail("loading"), setTick((n) => n + 1))}>{tc("retry")}</Btn>}>
            {t("detailError")}
          </Banner>
        ) : (
          <div className="dx-field">
            <span className="dx-field__l">{t("ratingTitle")}</span>
            <span className="dxcc-rate">
              <StarsView value={d?.rating ?? 0} /> {t("ratingOf", { n: d?.rating ?? 0 })}
            </span>
            <p className="dxcs-bio">{d?.comment || t("noCommentShort")}</p>
          </div>
        )
      ) : item.description ? (
        <div className="dx-field">
          <span className="dx-field__l">{t("text")}</span>
          <p className="dxcs-bio">{item.description}</p>
        </div>
      ) : null}
    </Dialog>
  );
}

// A new complaint: which work (optional), what kind, a subject and what
// happened.
function NewDialog({ about, onClose, onCreated, onError }: { about: string; onClose: () => void; onCreated: (item: ComplaintItem) => void; onError: (m: string) => void }) {
  const t = useTranslations("portal.client.complaints");
  const tw = useTranslations("portal.client.works");
  const [d, setD] = useState<Draft>({ category: "", subject: "", description: "", related: about });
  const [works, setWorks] = useState<WorkRef[] | null | "error">(null);
  const [worksTry, setWorksTry] = useState(0);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const once = useSameTickGuard();
  const [blocked, setBlocked] = useState<unknown>(null);
  useEffect(() => {
    let alive = true;
    listComplaintTargets()
      .then((l) => alive && setWorks(l))
      .catch(() => alive && setWorks("error"));
    return () => {
      alive = false;
    };
  }, [worksTry]);
  const subject = d.subject.trim();
  const desc = d.description.trim();
  const catErr = tried && !(COMPLAINT_CATEGORIES as readonly string[]).includes(d.category) ? t("v.category") : "";
  const subErr = tried ? (!subject ? t("v.subject") : subject.length < SUBJECT_MIN ? t("v.subjectShort", { min: SUBJECT_MIN }) : "") : "";
  const descErr = tried ? (!desc ? t("descRequired") : desc.length < DESC_MIN ? t("v.descShort", { min: DESC_MIN }) : "") : "";
  const target = Array.isArray(works) ? findWorkRef(works, d.related) : null;
  const set = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));
  async function send() {
    if (busy || !once()) return;
    setTried(true);
    if (!(COMPLAINT_CATEGORIES as readonly string[]).includes(d.category) || subject.length < SUBJECT_MIN || desc.length < DESC_MIN) return;
    setBusy(true);
    setBlocked(null);
    try {
      onCreated(await fileComplaint({ category: d.category, subject, description: desc, relatedRef: target ? workRefValue(target) : "" }));
    } catch (e) {
      if (contactBlockedOf(e)) setBlocked(e);
      else onError(t("sendFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={t("new")}
      width={600}
      onClose={onClose}
      onSubmit={() => void send()}
      actions={
        <>
          <Btn onClick={onClose}>{t("cancel")}</Btn>
          <Btn kind="primary" type="submit" busy={busy} icon={<IconSend />}>
            {t("submit")}
          </Btn>
        </>
      }
    >
      {Array.isArray(works) && !works.length ? null : (
        <Field label={`${t("form.related")} · ${t("form.optional")}`}>
          {works === null ? (
            <Spinner small />
          ) : works === "error" ? (
            <Btn small icon={<IconRefresh />} onClick={() => (setWorks(null), setWorksTry((n) => n + 1))}>
              {t("form.relatedError")}
            </Btn>
          ) : (
            <Select
              value={target ? workRefValue(target) : ""}
              onChange={(v) => set({ related: v })}
              ariaLabel={t("form.related")}
              options={[{ value: "", label: t("form.relatedNone") }, ...works.map((w) => ({ value: workRefValue(w), label: [w.title || (tw.has(`type.${w.type}`) ? tw(`type.${w.type}`) : humanize(w.type)), w.workId].filter(Boolean).join(" · ") }))]}
            />
          )}
        </Field>
      )}
      <div className="dx-field">
        <span className="dx-field__l">{t("catLabel")}</span>
        <div className={`dxcc-cats${catErr ? " is-bad" : ""}`} role="radiogroup" aria-label={t("catLabel")}>
          {COMPLAINT_CATEGORIES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={d.category === c} className={d.category === c ? "is-on" : ""} onClick={() => set({ category: c })}>
              <CategoryIcon category={c} />
              <span>
                <b>{t(`categories.${c}`)}</b>
                <small>{t(`catHint.${c}`)}</small>
              </span>
            </button>
          ))}
        </div>
        {catErr ? <small className="dx-field__e">{catErr}</small> : null}
      </div>
      <Field label={t("subject")} error={subErr || undefined}>
        <Input value={d.subject} onChange={(v) => set({ subject: v })} placeholder={t("subjectPh")} maxLength={SUBJECT_MAX} />
      </Field>
      <Field label={t("desc")} error={descErr || undefined} hint={`${t("form.descHint")} · ${t("form.counter", { n: d.description.length, max: DESC_MAX })}`}>
        <TextArea value={d.description} onChange={(v) => set({ description: v })} placeholder={t("descPh")} rows={5} maxLength={DESC_MAX} />
      </Field>
      {blocked ? <ContactBlockedNote error={blocked} /> : null}
      <p className="dx-dlg__text">{t("form.reassure")}</p>
    </Dialog>
  );
}
