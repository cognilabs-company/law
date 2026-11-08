"use client";

import "../../panel/panel.css";
import "../leads/leads.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { fmtNum } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { loadCrmMeta, useCrmEvents, useNow } from "@/lib/crm/useCrm";
import { claimCrmLead, crmCan, isClaimRace, isFinalStatus, leadCan, listCrmLeads, type CrmLead } from "@/lib/services/crm";
import { IcArrowRight, IcAward, IcCheck, IcClock, IcInbox, IcRefresh } from "../../icons";
import { crmHref, leadHref, type CrmSectionProps } from "../nav";
import { IcCalendar } from "../leads/icons";
import { NewLeadButton } from "../leads/NewLeadSheet";
import { stageVars, useCrmErr, useDayTime, useWhen } from "../leads/util";

export default function CrmOverviewX({ meta }: CrmSectionProps) {
  const t = useTranslations("crm.overview");
  const tl = useTranslations("crm.leads");
  const tx = useTranslations("admin.ccx.crmLeads");
  const tc = useTranslations("crm");
  const locale = useLocale();
  const router = useRouter();
  const crmErr = useCrmErr();
  const now = useNow();
  const when = useWhen();
  const dayTime = useDayTime();
  const [queue, setQueue] = useState<number | null>(null);
  const [top, setTop] = useState<CrmLead | null>(null);
  const [mine, setMine] = useState<CrmLead[] | null>(null);
  const [err, setErr] = useState("");
  const [bump, setBump] = useState(0);
  const [taking, setTaking] = useState(false);
  const prevQueue = useRef<number | null>(null);
  const canLeads = crmCan(meta, "crm.leads.view");

  const loadLists = useCallback(
    async (signal?: AbortSignal) => {
      if (!canLeads) return;
      try {
        const [q, m] = await Promise.all([listCrmLeads({ queueOnly: true, limit: 1 }, signal), listCrmLeads({ mineOnly: true, limit: 100 }, signal)]);
        setQueue(q.total);
        setTop(q.items[0] ?? null);
        setMine(m.items);
        setErr("");
        if (prevQueue.current !== null && q.total > prevQueue.current) setBump((b) => b + 1);
        prevQueue.current = q.total;
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.overview", e);
        setErr(crmErr(e));
      }
    },
    [canLeads, crmErr],
  );

  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void loadLists(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [loadLists]);

  useCrmEvents((ev) => {
    if (ev.invalidate.includes("meta") || ev.invalidate.includes("all")) void loadCrmMeta(true);
    if (ev.invalidate.some((k) => k === "all" || k === "queue" || k === "lists" || k === "counts" || k === "lead")) void loadLists();
  });

  const take = async () => {
    if (!top || taking) return;
    setTaking(true);
    try {
      await claimCrmLead(top.id);
      toast(tl("claimed", { title: top.title || top.workId }), { tone: "ok" });
      router.push(leadHref(top.id));
    } catch (e) {
      if (isClaimRace(e)) {
        toast(tl("claimLost"), { tone: "err" });
        void loadLists();
      } else toast(crmErr(e), { tone: "err" });
    } finally {
      setTaking(false);
    }
  };

  const agenda = (mine ?? [])
    .filter((l) => l.nextActionAt && !isFinalStatus(meta, l.status))
    .sort((a, b) => Date.parse(a.nextActionAt) - Date.parse(b.nextActionAt))
    .slice(0, 8);
  const canTake = !!top && leadCan(top, "claim");
  const nextUp = agenda[0] ?? null;
  const loaded = queue !== null && mine !== null;

  return (
    <div className="opx-ov" style={stageVars(meta)} data-ai-target="callcenter:crm-overview">
      {err ? (
        <p className="opx-ld-warn" role="alert">
          {err}
          <button type="button" onClick={() => void loadLists()}>
            <IcRefresh size={15} />
            {t("retry")}
          </button>
        </p>
      ) : null}

      {canLeads ? (
        <section className="opx-ov-hero" data-bump={bump || undefined} key={`q-${bump}`} aria-label={t("hero")}>
          {!loaded && !err ? (
            <i className="opx-shim opx-ov-hero__sk" />
          ) : canTake ? (
            <>
              <span className="opx-ov-hero__ic" aria-hidden="true">
                <IcInbox size={34} />
                <b className="opx-num">{fmtNum(queue ?? 0, locale)}</b>
              </span>
              <button type="button" className="opx-pbtn opx-pbtn--main opx-ov-hero__btn" onClick={() => void take()} disabled={taking} aria-busy={taking || undefined}>
                {tx("take")}
                <IcArrowRight size={24} />
              </button>
            </>
          ) : (queue ?? 0) > 0 ? (
            <>
              <span className="opx-ov-hero__ic" aria-hidden="true">
                <IcInbox size={34} />
                <b className="opx-num">{fmtNum(queue ?? 0, locale)}</b>
              </span>
              <Link href={crmHref("leads", { scope: "queue" })} className="opx-pbtn opx-pbtn--main opx-ov-hero__btn">
                {t("queue")}
                <IcArrowRight size={24} />
              </Link>
            </>
          ) : nextUp ? (
            <>
              <span className="opx-ov-hero__ic" aria-hidden="true">
                <IcClock size={34} />
              </span>
              <Link href={leadHref(nextUp.id)} className="opx-pbtn opx-pbtn--main opx-ov-hero__btn">
                <span className="opx-num">{dayTime(nextUp.nextActionAt, now, true)}</span>
                {nextUp.customer?.name || nextUp.title || nextUp.workId}
                <IcArrowRight size={24} />
              </Link>
            </>
          ) : (
            <span className="opx-ov-hero__calm">
              <span className="opx-ov-hero__ic" aria-hidden="true">
                <IcCheck size={34} />
              </span>
              <b>{t("todayEmpty")}</b>
            </span>
          )}
          <NewLeadButton meta={meta} quiet={!loaded || canTake || (queue ?? 0) > 0 || !!nextUp} />
        </section>
      ) : null}

      {canLeads ? (
        <section className="opx-ov-agenda" aria-labelledby="opx-ov-today">
          <header className="opx-ov-h">
            <IcCalendar size={19} />
            <h3 id="opx-ov-today">{t("today")}</h3>
            <Link href={crmHref("leads", { scope: "mine" })} className="opx-ov-all">
              {tx("seeAll")}
              <IcArrowRight size={14} />
            </Link>
          </header>
          {mine === null ? (
            <div className="opx-ov-sk">
              <i className="opx-shim" />
              <i className="opx-shim" />
              <i className="opx-shim" />
            </div>
          ) : agenda.length ? (
            <ol className="opx-ov-list">
              {agenda.map((l) => {
                const w = when(l.nextActionAt, now);
                return (
                  <li key={l.id}>
                    <Link href={leadHref(l.id)} className="opx-ov-row" data-tone={w?.tone || undefined}>
                      <span className="opx-ov-time opx-num">{dayTime(l.nextActionAt, now, true)}</span>
                      <span className="opx-ov-who">
                        <b>{l.customer?.name || l.title || "—"}</b>
                        {l.customer?.name && l.title ? <small>{l.title}</small> : null}
                      </span>
                      {w ? <em className="opx-ov-when">{w.text}</em> : null}
                      <span className="opx-ov-go" aria-hidden="true">
                        <IcArrowRight size={20} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="opx-ld-empty is-flat">
              <span className="opx-ld-empty__ic" aria-hidden="true">
                <IcCalendar size={24} />
              </span>
              <b>{t("todayEmpty")}</b>
            </div>
          )}
        </section>
      ) : crmCan(meta, "crm.analytics.self") ? (
        <Link href={crmHref("performance")} className="opx-ov-row opx-ov-solo">
          <span className="opx-ov-time" aria-hidden="true">
            <IcAward size={22} />
          </span>
          <span className="opx-ov-who">
            <b>{tc("nav.performance")}</b>
          </span>
          <span className="opx-ov-go" aria-hidden="true">
            <IcArrowRight size={20} />
          </span>
        </Link>
      ) : null}
    </div>
  );
}
