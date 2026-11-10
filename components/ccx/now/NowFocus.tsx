"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import CcCallForm from "@/components/admin/CcCallForm";
import PersonName from "@/components/ui/PersonName";
import { directionLabel, useUrgentStatuses } from "@/components/admin/UrgentAdvocateQueue";
import { notify } from "@/lib/toast";
import { fmtAgeMin } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import { humanize, labelOf, regionLabel } from "@/lib/labels";
import { assignNextSeller, claimUrgentRequest } from "@/lib/services/backend";
import { useCrmMeta } from "@/lib/crm/useCrm";
import { crmCan } from "@/lib/services/crm";
import { isForbidden } from "@/lib/http";
import { useCan } from "@/lib/useCan";
import { isSellerJob, prettyPhone, toneOf, type NowJob } from "./feed";
import { queueHref, useJobText } from "./text";
import NowTabs from "./NowTabs";
import { leadHref } from "../crm/nav";
import { LeadJourney } from "../crm/detail/LeadJourney";
import { useCategoryName } from "../crm/leads/util";
import { UrgentJourney } from "../urgent/UrgentJourney";
import type { JobDetail, Who } from "./useNow";
import { IcArrowRight, IcAward, IcCheck, IcChevron, IcClock, IcCoins, IcCopy, IcDoc, IcFlag, IcInbox, IcLayers, IcMeeting, IcPhone, IcScale, IcSnooze, IcTimeline, IcUser, JobIcon } from "../icons";
import { IconMapPin } from "@/components/icons";
import { Chip, CodeRow, Disclosure, Facts, Grid, Group, People, Root, When, statusIcon, type FactItem } from "../panel/Detail";

type Resolve = { href: string; label: string } | { label: string; run: () => Promise<unknown>; done: string; fail: string };
type Step = { id: string; at: string; title: string; sub: string; icon?: ReactNode };

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
  canLater,
  extra,
  onChanged,
  onLater,
  onLogged,
}: {
  job: NowJob;
  detail: JobDetail | null;
  who: Who;
  canLater: boolean;
  extra?: ReactNode;
  onChanged: () => void;
  onLater: () => void;
  onLogged: () => void;
}) {
  const t = useTranslations("admin.ccx.now");
  const tq = useTranslations("admin.callCenter.queue");
  const te = useTranslations("enums");
  const tu = useTranslations("admin.urgent");
  const tx = useTranslations("admin.ccx.detail");
  const tk = useTranslations("portal.client.urgent");
  const tsrc = useTranslations("crm.source");
  const urg = useUrgentStatuses();
  const locale = useLocale();
  const text = useJobText();
  const [logging, setLogging] = useState(false);
  const [running, setRunning] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [logBusy, setLogBusy] = useState(false);
  const [logDirty, setLogDirty] = useState(false);
  const [more, setMore] = useState(false);
  const crm = useCrmMeta().meta;
  const canDo = useCan();
  // Jobs whose action answered 403: that action leaves the card.
  const [refused, setRefused] = useState<string[]>([]);
  const categoryName = useCategoryName();

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
  const category = lead?.category ? categoryName(lead.category) : "";
  const rating = (r: number) => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(r)} / 5`;

  // «Batafsil»: every row a translated label with its own icon; the status
  // goes to the status-and-deadline group as a chip, the seller as a person.
  const facts: FactItem[] = [];
  const fact = (key: string, icon: ReactNode, label: string, value: ReactNode) => facts.push({ key, icon, label, value });
  const region = <IconMapPin width={15} height={15} style={{ width: 15, height: 15 }} aria-hidden="true" />;
  let statusText = "";
  let statusKey = "";
  if (lead) {
    if (lead.source) fact("source", <IcLayers size={15} />, t("f.source"), tsrc.has(lead.source) ? tsrc(lead.source) : humanize(lead.source));
    if (category) fact("direction", <IcScale size={15} />, t("f.direction"), category);
    if (lead.region) fact("region", region, t("f.region"), regionLabel(te, lead.region));
    if (lead.status) [statusText, statusKey] = [labelOf(tq, "status", lead.status), lead.status];
  } else if (urgent) {
    if (serviceName) fact("service", <IcDoc size={15} />, t("f.service"), serviceName);
    if (urgent.channel) fact("channel", <IcMeeting size={15} />, t("f.channel"), urgent.channel === "chat" ? tk("chChat") : tk("chVideo"));
    if (urgent.directions.length) fact("direction", <IcScale size={15} />, t("f.direction"), urgent.directions.map((d) => directionLabel(te, d, tu)).join(", "));
    if (urgent.status) [statusText, statusKey] = [urgentStatus(urgent.status), urgent.status];
  } else if (job.queue) {
    if (job.queue.region) fact("region", region, t("f.region"), regionLabel(te, job.queue.region));
    if (job.queue.status) [statusText, statusKey] = [labelOf(tq, "status", job.queue.status), job.queue.status];
  } else if (job.cockpit) {
    const c = job.cockpit;
    if (c.amount) fact("amount", <IcCoins size={15} />, t("f.amount"), <span className="opx-num">{t("sum", { n: fmtUzs(c.amount) })}</span>);
    if (c.docTitle && c.docTitle !== c.title) fact("service", <IcDoc size={15} />, t("f.service"), c.docTitle);
    if (c.rating != null) fact("rating", <IcAward size={15} />, t("f.rating"), <span className="opx-num">{rating(c.rating)}</span>);
  }
  const sellerRow = job.cockpit?.sellerUserId && !sellerSide ? job.cockpit.sellerUserId : "";
  const created = lead?.createdAt || urgent?.createdAt || job.queue?.createdAt || job.cockpit?.at || "";
  const deadline =
    job.leftMin == null
      ? null
      : job.breached
        ? { tone: "hot" as const, text: tx("slaOver") }
        : { tone: job.leftMin <= 15 ? ("warn" as const) : ("ok" as const), text: tx("slaLeft", { time: fmtAgeMin(job.leftMin, locale) }) };

  const reasonTitle = lead ? lead.title.trim() || text.title(job) : urgent ? serviceName || text.title(job) : job.cockpit ? text.reason(job) || job.cockpit.title || text.kind(job) : text.title(job);
  const reasonBody = lead?.problem || urgent?.need || job.cockpit?.note || "";

  const steps: Step[] = [];
  if (detail?.history?.length) {
    for (const e of detail.history) steps.push({ id: e.id, at: e.createdAt, title: e.title || t("change"), sub: [e.body, e.actor?.name].filter(Boolean).join(" · "), icon: e.actor?.name ? <IcUser size={14} /> : <IcTimeline size={14} /> });
  } else if (urgent?.statusHistory.length) {
    urgent.statusHistory.forEach((s, i) => steps.push({ id: `${s.at}-${i}`, at: s.at, title: urgentStatus(s.to), sub: s.from ? `${urgentStatus(s.from)} → ${urgentStatus(s.to)}` : "", icon: statusIcon(s.to) }));
  }
  if (!steps.length && created) steps.push({ id: "created", at: created, title: t("created"), sub: text.kind(job), icon: <IcInbox size={14} /> });

  const claimedBy = urgent?.claimedByUserId || job.queue?.claimedByUserId || "";
  // The CRM lead opens only with the CRM's own lead permission (GET /crm/meta;
  // the session's codes until it loads). Assigning an order follows
  // orders.manage (POST /matching/orders/{id}/assign-next). An urgent request
  // is claimable only while its lifecycle still allows it.
  const canLeads = crm ? crmCan(crm, "crm.leads.view") : canDo("crm.leads.view");
  const claimable = !claimedBy && (!urgent || urgent.status === "open_pool" || urgent.nextStatuses.includes("claimed"));
  const resolve: Resolve | null = refused.includes(job.key)
    ? null
    : job.kind === "lead"
      ? canLeads
        ? { href: leadHref(job.id), label: t("act.openCrm") }
        : null
      : job.kind === "urgent"
        ? !claimable
          ? { href: queueHref(job), label: t("act.openBoard") }
          : { label: t("act.claim"), run: () => claimUrgentRequest(job.id), done: t("act.claimed"), fail: t("act.claimFailed") }
        : job.kind === "order"
          ? canDo("orders.manage")
            ? { label: t("act.assign"), run: () => assignNextSeller(job.id), done: t("act.assigned"), fail: t("act.assignFailed") }
            : null
          : { href: queueHref(job), label: t("act.openQueue") };

  const run = async () => {
    if (!resolve || "href" in resolve || running) return;
    setRunning(true);
    try {
      await resolve.run();
      notify.success(resolve.done, { id: `ccx-now-${job.key}` });
      onChanged();
    } catch (e) {
      notify.error(resolve.fail, { id: `ccx-now-${job.key}`, error: e, map: { 403: tq("noPermission") } });
      if (isForbidden(e)) setRefused((r) => [...r, job.key]);
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

  const callEl = dial ? (
    <a className="opx-act opx-act--call" href={`tel:${dial}`} data-key="c" onClick={() => setLogging(true)}>
      <IcPhone size={21} />
      <span>{t("act.call")}</span>
    </a>
  ) : (
    <button type="button" className="opx-act opx-act--call" data-key="c" onClick={() => setLogging(true)}>
      <IcPhone size={21} />
      <span>{t("act.logCall")}</span>
    </button>
  );
  const resolveEl = !resolve ? null : "href" in resolve ? (
      <Link className="opx-act opx-act--done" href={resolve.href} data-key="e">
        <IcArrowRight size={21} />
        <span>{resolve.label}</span>
      </Link>
    ) : (
      <button type="button" className="opx-act opx-act--done" data-key="e" onClick={() => void run()} disabled={running} aria-busy={running}>
        <IcCheck size={21} />
        <span>{running ? t("act.working") : resolve.label}</span>
      </button>
    );
  // One thing to do: a job that needs taking is taken first, otherwise the client is called.
  const callFirst = !resolve || ("href" in resolve && (!!dial || asksClient));

  return (
    <section className="opx-focus" data-tone={tone} aria-labelledby="opx-focus-code" data-ai-target="callcenter:now:focus">
      <div className="opx-focus__body" key={job.key}>
        <header className="opx-focus__head">
          <div className="opx-focus__id">
            <div className="opx-focus__tags">
              <span className="opx-tag">
                <JobIcon kind={job.kind} size={16} />
                {text.kind(job)}
              </span>
              {job.hot ? <span className="opx-tag opx-tag--hot">{t("hot")}</span> : null}
            </div>
            <h2 id="opx-focus-code" className="opx-focus__code">
              {nameNode}
            </h2>
            {sellerSide ? <small className="opx-who__role">{t("f.seller")}</small> : null}
            {who.phone ? (
              <span className="opx-focus__phone opx-num" dir="ltr">
                {prettyPhone(who.phone)}
              </span>
            ) : waitingDetail ? (
              <i className="opx-shim opx-shim--line" />
            ) : null}
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
            </span>
          </div>
        </header>

        <div className="opx-focus__need">
          <b>{reasonTitle}</b>
          {waitingDetail ? <i className="opx-shim opx-shim--para" /> : reasonBody ? <p>{reasonBody}</p> : null}
        </div>

        {lead && crm ? <LeadJourney meta={crm} status={lead.status} /> : null}
        {urgent ? <UrgentJourney r={urgent} /> : null}

        <div className="opx-acts">
          {callFirst ? callEl : resolveEl}
          {callFirst ? resolveEl : callEl}
          <button type="button" className="opx-act opx-act--later" data-key="s" onClick={onLater} disabled={!canLater}>
            <IcSnooze size={21} />
            <span>{t("act.later")}</span>
          </button>
        </div>

        <button type="button" className="opx-focus__more" aria-expanded={more} aria-controls="opx-focus-more" onClick={() => setMore((o) => !o)}>
          {t("more")}
          <IcChevron size={15} />
        </button>
        <Disclosure id="opx-focus-more" open={more}>
          <Root className="opx-focus__extra">
            <Grid>
              <Group icon={<IcClock size={16} />} title={tx("state")} tone={job.breached ? "hot" : undefined}>
                <div className="opx-dk-chips">
                  {deadline ? (
                    <Chip tone={deadline.tone} icon={<IcFlag size={14} />}>
                      {deadline.text}
                    </Chip>
                  ) : null}
                </div>
                <Facts
                  items={[
                    { key: "wait", icon: <IcSnooze size={15} />, label: tx("wait"), value: <span className="opx-num">{age}</span> },
                    ...(statusText ? [{ key: "status", icon: statusIcon(statusKey, 15), label: t("f.status"), value: statusText }] : []),
                    ...(created ? [{ key: "created", icon: <IcInbox size={15} />, label: t("f.created"), value: <When at={created} /> }] : []),
                  ]}
                />
              </Group>
              <Group icon={<IcDoc size={16} />} title={tx("details")}>
                <div className="opx-dk-chips">
                  <CodeRow code={code} label={t("f.code")} />
                  {who.lexgoId ? <CodeRow code={who.lexgoId} label={t("lexgoId")} /> : null}
                </div>
                {facts.length ? <Facts items={facts} /> : null}
                {sellerRow ? <People people={[{ key: "seller", name: <PersonName id={sellerRow} />, avatarName: "", role: t("f.seller") }]} /> : null}
                {!facts.length && !sellerRow ? <p className="opx-dk-none">{t("noDetails")}</p> : null}
              </Group>
            </Grid>
            <NowTabs job={job} detail={detail} steps={steps} waiting={waitingDetail} onNote={onLogged} />
            {extra}
          </Root>
        </Disclosure>
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
