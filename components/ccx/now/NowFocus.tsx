"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import CcCallForm from "@/components/admin/CcCallForm";
import PersonName from "@/components/ui/PersonName";
import { directionLabel, useUrgentStatuses } from "@/components/admin/UrgentAdvocateQueue";
import { notify } from "@/lib/toast";
import { fmtAgeMin, shortDateTime } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import { humanize, labelOf, regionLabel } from "@/lib/labels";
import { leadCategoryLabel } from "@/lib/leadLabels";
import { initials } from "@/lib/lawyers";
import { assignNextSeller, claimUrgentRequest } from "@/lib/services/backend";
import { isSellerJob, prettyPhone, toneOf, type NowJob } from "./feed";
import { queueHref, useJobText } from "./text";
import NowTabs from "./NowTabs";
import { leadHref } from "../crm/nav";
import type { JobDetail, Who } from "./useNow";
import { IcArrowRight, IcCheck, IcClock, IcCopy, IcDoc, IcPhone, IcSnooze, IcUser, JobIcon } from "../icons";

type Resolve = { href: string; label: string } | { label: string; run: () => Promise<unknown>; done: string; fail: string };
type Step = { id: string; at: string; title: string; sub: string };

const RING = 2 * Math.PI * 21;

export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("admin.ccx.now");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setDone(false), 1400);
    return () => window.clearTimeout(id);
  }, [done]);

  return (
    <button
      type="button"
      className={`opx-copy${done ? " is-done" : ""}`}
      aria-label={done ? t("copied") : `${t("copy")}: ${label}`}
      title={done ? t("copied") : t("copy")}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(value)
          .then(() => setDone(true))
          .catch(() => undefined);
      }}
    >
      {done ? <IcCheck size={15} /> : <IcCopy size={15} />}
    </button>
  );
}

export default function NowFocus({
  job,
  detail,
  who,
  position,
  canLater,
  keys,
  onChanged,
  onLater,
  onLogged,
}: {
  job: NowJob;
  detail: JobDetail | null;
  who: Who;
  position: { i: number; n: number };
  canLater: boolean;
  keys: boolean;
  onChanged: () => void;
  onLater: () => void;
  onLogged: () => void;
}) {
  const t = useTranslations("admin.ccx.now");
  const tq = useTranslations("admin.callCenter.queue");
  const te = useTranslations("enums");
  const tu = useTranslations("admin.urgent");
  const tk = useTranslations("portal.client.urgent");
  const tsrc = useTranslations("crm.source");
  const tp = useTranslations("admin.pipeline");
  const urg = useUrgentStatuses();
  const locale = useLocale();
  const text = useJobText();
  const [logging, setLogging] = useState(false);
  const [running, setRunning] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [logBusy, setLogBusy] = useState(false);
  const [logDirty, setLogDirty] = useState(false);

  const lead = detail?.lead;
  const urgent = detail?.urgent;
  const tone = toneOf(job);
  const asksClient = job.kind === "lead" || job.kind === "urgent";
  const waitingDetail = asksClient && !detail;
  const sellerSide = isSellerJob(job) && !who.userId;
  const code = lead?.workId || urgent?.workId || job.code || `#${job.id.slice(0, 8).toUpperCase()}`;
  const age = fmtAgeMin(job.ageMin, locale);
  const frac = Math.max(0.05, Math.min(1, job.slaMin ? job.ageMin / job.slaMin : job.ageMin / 120));
  const urgentStatus = (s: string) => (s in urg ? urg[s].label : t.has(`ust.${s}`) ? t(`ust.${s}`) : humanize(s));
  const serviceName = urgent ? (urgent.serviceKind && tk.has(`kinds.${urgent.serviceKind}`) ? tk(`kinds.${urgent.serviceKind}`) : urgent.serviceTitle) : "";
  const category = lead?.category ? leadCategoryLabel(tp, lead.category) : "";
  const rating = (r: number) => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(r)} / 5`;

  const facts: [string, ReactNode][] = [];
  if (lead) {
    if (lead.source) facts.push([t("f.source"), tsrc.has(lead.source) ? tsrc(lead.source) : humanize(lead.source)]);
    if (category) facts.push([t("f.direction"), category]);
    if (lead.region) facts.push([t("f.region"), regionLabel(te, lead.region)]);
    if (lead.status) facts.push([t("f.status"), labelOf(tq, "status", lead.status)]);
  } else if (urgent) {
    if (serviceName) facts.push([t("f.service"), serviceName]);
    if (urgent.channel) facts.push([t("f.channel"), urgent.channel === "chat" ? tk("chChat") : tk("chVideo")]);
    if (urgent.directions.length) facts.push([t("f.direction"), urgent.directions.map((d) => directionLabel(te, d, tu)).join(", ")]);
    if (urgent.status) facts.push([t("f.status"), urgentStatus(urgent.status)]);
  } else if (job.queue) {
    if (job.queue.region) facts.push([t("f.region"), regionLabel(te, job.queue.region)]);
    if (job.queue.status) facts.push([t("f.status"), labelOf(tq, "status", job.queue.status)]);
  } else if (job.cockpit) {
    const c = job.cockpit;
    if (c.amount) facts.push([t("f.amount"), t("sum", { n: fmtUzs(c.amount) })]);
    if (c.docTitle && c.docTitle !== c.title) facts.push([t("f.service"), c.docTitle]);
    if (c.rating != null) facts.push([t("f.rating"), rating(c.rating)]);
    if (c.sellerUserId && !sellerSide) facts.push([t("f.seller"), <PersonName key="s" id={c.sellerUserId} />]);
  }
  const created = lead?.createdAt || urgent?.createdAt || job.queue?.createdAt || job.cockpit?.at || "";
  if (created) facts.push([t("f.created"), shortDateTime(created, locale)]);

  const reasonTitle = lead ? lead.title.trim() || text.title(job) : urgent ? serviceName || text.title(job) : job.cockpit ? text.reason(job) || job.cockpit.title || text.kind(job) : text.title(job);
  const reasonBody = lead?.problem || urgent?.need || job.cockpit?.note || "";

  const steps: Step[] = [];
  if (detail?.history?.length) {
    for (const e of detail.history) steps.push({ id: e.id, at: e.createdAt, title: e.title || t("change"), sub: [e.body, e.actor?.name].filter(Boolean).join(" · ") });
  } else if (urgent?.statusHistory.length) {
    urgent.statusHistory.forEach((s, i) => steps.push({ id: `${s.at}-${i}`, at: s.at, title: urgentStatus(s.to), sub: s.from ? `${urgentStatus(s.from)} → ${urgentStatus(s.to)}` : "" }));
  }
  if (!steps.length && created) steps.push({ id: "created", at: created, title: t("created"), sub: text.kind(job) });

  const claimedBy = urgent?.claimedByUserId || job.queue?.claimedByUserId || "";
  const resolve: Resolve =
    job.kind === "lead"
      ? { href: leadHref(job.id), label: t("act.openCrm") }
      : job.kind === "urgent"
        ? claimedBy
          ? { href: queueHref(job), label: t("act.openBoard") }
          : { label: t("act.claim"), run: () => claimUrgentRequest(job.id), done: t("act.claimed"), fail: t("act.claimFailed") }
        : job.kind === "order"
          ? { label: t("act.assign"), run: () => assignNextSeller(job.id), done: t("act.assigned"), fail: t("act.assignFailed") }
          : { href: queueHref(job), label: t("act.openQueue") };

  const run = async () => {
    if ("href" in resolve || running) return;
    setRunning(true);
    try {
      await resolve.run();
      notify.success(resolve.done, { id: `ccx-now-${job.key}` });
      onChanged();
    } catch (e) {
      notify.error(resolve.fail, { id: `ccx-now-${job.key}`, error: e, map: { 403: tq("noPermission") } });
    } finally {
      setRunning(false);
    }
  };

  const dial = who.phone.replace(/[^\d+]/g, "");
  const sellerId = job.cockpit?.sellerUserId ?? "";
  const nameNode = who.name ? (
    who.name
  ) : who.userId ? (
    <PersonName id={who.userId} fallback={t("unknownClient")} />
  ) : sellerSide && sellerId ? (
    <PersonName id={sellerId} fallback={t("unknownSeller")} />
  ) : sellerSide ? (
    t("unknownSeller")
  ) : (
    t("unknownClient")
  );

  return (
    <section className="opx-focus" data-tone={tone} aria-labelledby="opx-focus-code" data-ai-target="callcenter:now:focus">
      <div className="opx-focus__body" key={job.key}>
        <header className="opx-focus__head">
          <div className="opx-focus__id">
            <h2 id="opx-focus-code" className="opx-focus__code">
              {code}
            </h2>
            <div className="opx-focus__tags">
              <span className="opx-tag">
                <JobIcon kind={job.kind} size={16} />
                {text.kind(job)}
              </span>
              {job.hot ? <span className="opx-tag opx-tag--hot">{t("hot")}</span> : null}
              <span className="opx-focus__pos opx-num" aria-label={t("posAria", { i: position.i, n: position.n })}>
                {position.i} / {position.n}
              </span>
            </div>
          </div>
          <div className="opx-wait" data-tone={tone} role="img" aria-label={t("waitAria", { time: age })}>
            <span className="opx-wait__ring" aria-hidden="true">
              <svg className="opx-wait__svg" viewBox="0 0 48 48" width="48" height="48" style={{ width: 48, height: 48 }}>
                <circle cx="24" cy="24" r="21" className="opx-wait__track" />
                <circle cx="24" cy="24" r="21" className="opx-wait__bar" strokeDasharray={RING} strokeDashoffset={RING * (1 - frac)} />
              </svg>
              <IcClock size={20} />
            </span>
            <span className="opx-wait__txt">
              <b className="opx-num">{age}</b>
              <small>{job.leftMin == null ? t("waiting") : job.breached ? t("slaOver") : t("slaLeft", { time: fmtAgeMin(job.leftMin, locale) })}</small>
            </span>
          </div>
        </header>

        <div className="opx-who">
          <div className="opx-who__main">
            <span className="opx-av" aria-hidden="true">
              {who.name ? initials(who.name) : <IcUser size={22} />}
            </span>
            <div className="opx-who__txt">
              {sellerSide ? <small className="opx-who__role">{t("f.seller")}</small> : null}
              <b className="opx-who__name">{nameNode}</b>
              {who.phone ? (
                <span className="opx-who__line">
                  <IcPhone size={16} />
                  <span className="opx-num">{prettyPhone(who.phone)}</span>
                  <CopyButton value={who.phone} label={t("phone")} />
                </span>
              ) : (
                <span className="opx-who__line opx-who__line--mute">
                  <IcPhone size={16} />
                  {waitingDetail ? <i className="opx-shim opx-shim--line" /> : who.phoneHidden ? t("phoneHidden") : t("noPhone")}
                </span>
              )}
              {who.lexgoId ? (
                <span className="opx-who__line">
                  <small>{t("lexgoId")}</small>
                  <span className="opx-num">{who.lexgoId}</span>
                  <CopyButton value={who.lexgoId} label={t("lexgoId")} />
                </span>
              ) : null}
            </div>
          </div>
          {facts.length ? (
            <dl className="opx-who__facts">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="opx-reason">
          <span className="opx-reason__ic" aria-hidden="true">
            <IcDoc size={20} />
          </span>
          <div>
            <h3>{asksClient ? t("reason") : t("about")}</h3>
            <b>{reasonTitle}</b>
            {waitingDetail ? <i className="opx-shim opx-shim--para" /> : <p>{reasonBody || (asksClient ? t("noReason") : t("noDetails"))}</p>}
          </div>
        </div>

        <NowTabs job={job} detail={detail} steps={steps} waiting={waitingDetail} onNote={onLogged} />
      </div>

      <div className="opx-acts">
        {dial ? (
          <a className="opx-act opx-act--call" href={`tel:${dial}`} data-key="c" onClick={() => setLogging(true)}>
            <IcPhone size={21} />
            <span>{t("act.call")}</span>
            {keys ? <kbd>C</kbd> : null}
          </a>
        ) : (
          <button type="button" className="opx-act opx-act--call" data-key="c" onClick={() => setLogging(true)}>
            <IcPhone size={21} />
            <span>{t("act.logCall")}</span>
            {keys ? <kbd>C</kbd> : null}
          </button>
        )}
        {"href" in resolve ? (
          <Link className="opx-act opx-act--done" href={resolve.href} data-key="e">
            <IcArrowRight size={21} />
            <span>{resolve.label}</span>
            {keys ? <kbd>E</kbd> : null}
          </Link>
        ) : (
          <button type="button" className="opx-act opx-act--done" data-key="e" onClick={() => void run()} disabled={running} aria-busy={running}>
            <IcCheck size={21} />
            <span>{running ? t("act.working") : resolve.label}</span>
            {keys ? <kbd>E</kbd> : null}
          </button>
        )}
        <button type="button" className="opx-act opx-act--later" data-key="s" onClick={onLater} disabled={!canLater}>
          <IcSnooze size={21} />
          <span>{t("act.later")}</span>
          {keys ? <kbd>S</kbd> : null}
        </button>
      </div>

      {logging ? (
        <Modal
          open
          onClose={() => setLogging(false)}
          title={t("callTitle")}
          description={[who.name, prettyPhone(who.phone)].filter(Boolean).join(" · ")}
          busy={logBusy}
          dirty={logDirty}
          footer={<div className="ccslot" ref={setSlot} />}
        >
          <CcCallForm
            phone={who.phone}
            clientUserId={who.userId || undefined}
            footSlot={slot}
            onDirtyChange={setLogDirty}
            onBusyChange={setLogBusy}
            onCancel={() => setLogging(false)}
            onDone={() => {
              setLogging(false);
              onLogged();
            }}
          />
        </Modal>
      ) : null}
    </section>
  );
}
