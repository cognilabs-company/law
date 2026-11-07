"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { assignUrgentGroup, listUrgentCandidates, searchUrgentCandidates, urgentAssignRefusal, type UrgentCandidate, type UrgentRequest } from "@/lib/services/backend";
import { logApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { regionKeyOf, regionLabel } from "@/lib/labels";
import { directionLabel } from "@/components/admin/UrgentAdvocateQueue";
import { IconUsers } from "@/components/icons";
import { Field, Loading, Note } from "../panel/bits";
import { IcSearch } from "../icons";
import { CAND_PAGE, DIRECTION_SLUGS, localToday, ntfId } from "./model";
import { CandRow, StepError, StepFoot, useReportDirty } from "./kit";
import { px } from "./parts";

type Query = { dirs: string[]; region: string; n: number };

export default function UrgentCandidates({
  req,
  onBack,
  onDirty,
  onBusy,
  onDone,
}: {
  req: UrgentRequest;
  onBack: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onDone: (r: UrgentRequest, msg: string) => void;
}) {
  const t = useTranslations("admin.urgent");
  const te = useTranslations("enums");
  const uid = useId();
  const errBox = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<UrgentCandidate[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [fail, setFail] = useState<unknown>(undefined);
  const [ids, setIds] = useState<string[]>(req.groupLawyerUserIds);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okCount, setOkCount] = useState(false);
  const [okDirection, setOkDirection] = useState(false);
  const [offer, setOffer] = useState<"" | "count" | "direction">("");
  const [external, setExternal] = useState(true);
  const [callcenter, setCallcenter] = useState(true);
  const [wide, setWide] = useState(false);
  const [wideDirs, setWideDirs] = useState<string[]>(req.directions);
  const [wideRegion, setWideRegion] = useState(req.region);
  const [query, setQuery] = useState<Query>({ dirs: req.directions, region: req.region, n: 0 });
  const [shown, setShown] = useState(CAND_PAGE);

  const fetchKey = `${req.id}|${external}|${callcenter}|${wide}|${query.n}`;
  const [prevKey, setPrevKey] = useState(fetchKey);
  if (fetchKey !== prevKey) {
    setPrevKey(fetchKey);
    setState("loading");
    setShown(CAND_PAGE);
  }

  useEffect(() => {
    let alive = true;
    const load = wide
      ? searchUrgentCandidates({ directions: query.dirs, region: query.region, limit: 50 })
      : listUrgentCandidates(req.id, { includeExternal: external, includeCallcenter: callcenter, limit: 50 });
    load
      .then((c) => {
        if (!alive) return;
        setList(c);
        setState("ready");
      })
      .catch((e) => {
        if (!alive) return;
        logApiError("urgent candidates", e);
        setFail(e);
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [req.id, external, callcenter, wide, query]);

  useEffect(() => {
    if (err) errBox.current?.scrollIntoView({ block: "nearest" });
  }, [err]);

  const [matched, mismatched] = useMemo(() => {
    const sorted = [...list].sort((a, b) => b.score - a.score);
    return [sorted.filter((c) => c.directionMatch), sorted.filter((c) => !c.directionMatch)];
  }, [list]);
  const shownMatched = matched.slice(0, shown);
  const shownOff = mismatched.slice(0, Math.max(0, shown - matched.length));
  const rest = matched.length + mismatched.length - shownMatched.length - shownOff.length;

  const startIds = req.groupLawyerUserIds;
  const changed = ids.length !== startIds.length || ids.some((x) => !startIds.includes(x));
  useReportDirty(changed || !!date || !!time || !!note.trim(), onDirty);

  const regionSeen = new Map<string, string>();
  for (const v of [wideRegion, req.region, ...list.map((c) => c.region)]) {
    const raw = (v || "").trim();
    if (!raw) continue;
    const k = regionKeyOf(te, raw) || raw.toLowerCase();
    if (!regionSeen.has(k)) regionSeen.set(k, raw);
  }
  const regionOpts = [{ value: "", label: te("regions.all") }, ...[...regionSeen.values()].map((v) => ({ value: v, label: regionLabel(te, v) }))];

  const want = req.lawyerCount || 2;
  const full = !okCount && ids.length >= want;
  const toggle = (id: string) => {
    setErr("");
    setIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (!okCount && cur.length >= want) return cur;
      return [...cur, id];
    });
  };

  const rerun = () => setQuery((q) => ({ dirs: wideDirs, region: wideRegion, n: q.n + 1 }));
  const flipWide = () => {
    setWide((v) => !v);
    rerun();
  };

  async function submit() {
    if (!ids.length || busy) return;
    setBusy(true);
    onBusy(true);
    setErr("");
    try {
      const scheduledAt = date && time ? new Date(`${date}T${time}:00`).toISOString() : undefined;
      const out = await assignUrgentGroup(req.id, {
        lawyerUserIds: ids,
        scheduledAt,
        note: note.trim(),
        allowCountOverride: okCount,
        allowDirectionMismatch: okDirection,
      });
      onDone(out, t("notify.groupAssigned", { n: ids.length }));
    } catch (e) {
      const refusal = urgentAssignRefusal(e);
      if (refusal?.kind === "minimum") {
        setOffer("");
        setErr(t("belowMinimum", { min: refusal.minimum, got: refusal.selected || ids.length }));
      } else if (refusal?.kind === "count") {
        setOffer("count");
        setErr(t("countMismatch", { want: refusal.requested || want, got: refusal.selected || ids.length }));
      } else if (refusal?.kind === "direction") {
        setOffer("direction");
        setErr(t("directionMismatch", { n: refusal.userIds.length }));
      } else {
        logApiError("urgent assign-group", e);
        notify.error(t("notify.groupFailed"), { id: ntfId(req.id), error: e });
      }
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  const today = localToday();
  const row = (c: UrgentCandidate) => {
    const on = ids.includes(c.userId);
    return <CandRow key={c.userId} c={c} on={on} disabled={full && !on} title={full && !on ? t("pickedFullHint", { n: want }) : undefined} onToggle={() => toggle(c.userId)} />;
  };

  return (
    <>
      <div className="opx-pscroll" data-ai-private>
        <div className="opx-ug-candhead">
          <p className="opx-ug-lead">{t("candidatesLead", { n: want })}</p>
          <span className={`opx-ug-count opx-num${full ? " is-full" : ""}`}>
            {ids.length} / {want}
          </span>
        </div>

        <div className="opx-ug-candtools">
          <label className={`opx-ug-check${wide ? " is-off" : ""}`}>
            <input type="checkbox" checked={external} disabled={wide} onChange={(e) => setExternal(e.target.checked)} />
            <span>{t("includeExternal")}</span>
          </label>
          <label className={`opx-ug-check${wide ? " is-off" : ""}`}>
            <input type="checkbox" checked={callcenter} disabled={wide} onChange={(e) => setCallcenter(e.target.checked)} />
            <span>{t("includeCallcenter")}</span>
          </label>
          <button type="button" className={`opx-pbtn opx-ug-sm${wide ? " is-on" : ""}`} aria-pressed={wide} onClick={flipWide}>
            <IcSearch size={15} />
            {wide ? t("searchNarrow") : t("searchWide")}
          </button>
        </div>

        {wide ? (
          <section className="opx-psec opx-ug-wide">
            <span className="opx-ug-lbl" id={`${uid}-d`}>
              {t("directions")}
            </span>
            <div className="opx-ug-fchips" role="group" aria-labelledby={`${uid}-d`}>
              {DIRECTION_SLUGS.map((d) => (
                <button key={d} type="button" className="opx-ug-fchip" aria-pressed={wideDirs.includes(d)} onClick={() => setWideDirs((cur) => (cur.includes(d) ? cur.filter((y) => y !== d) : [...cur, d]))}>
                  {directionLabel(te, d, t)}
                </button>
              ))}
            </div>
            <div className="opx-ug-widerow">
              <div className="opx-field">
                <label htmlFor={`${uid}-r`}>{t("region")}</label>
                <select id={`${uid}-r`} value={wideRegion} onChange={(e) => setWideRegion(e.target.value)}>
                  {regionOpts.map((o) => (
                    <option key={o.value || "all"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="opx-pbtn" onClick={rerun}>
                <IcSearch size={15} />
                {t("searchApply")}
              </button>
            </div>
          </section>
        ) : null}

        {state === "loading" ? (
          <Loading label={t("candidates")} />
        ) : state === "error" ? (
          <StepError title={t("candidatesError")} error={fail} onRetry={rerun} />
        ) : !list.length ? (
          <p className="opx-pnone">{t("noAdvocates")}</p>
        ) : (
          <section className="opx-ug-pick" aria-label={t("candidates")}>
            {shownMatched.length ? <ul className="opx-ug-cands">{shownMatched.map(row)}</ul> : null}
            {shownOff.length ? (
              <>
                <Note tone="warn">{t("offDirectionLead")}</Note>
                <ul className="opx-ug-cands is-off">{shownOff.map(row)}</ul>
              </>
            ) : null}
            {rest > 0 ? (
              <button type="button" className="opx-pbtn opx-ug-sm opx-ug-moreb" onClick={() => setShown((n) => n + CAND_PAGE)}>
                {t("showMore", { n: rest })}
              </button>
            ) : null}
          </section>
        )}

        <p className={`opx-ug-picked${ids.length === want ? " is-ok" : ""}`}>{t("pickedOf", { n: ids.length, want })}</p>

        <div className="opx-pgrid2">
          <div className="opx-field">
            <label htmlFor={`${uid}-dt`}>{t("date")}</label>
            <input id={`${uid}-dt`} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="opx-field">
            <label htmlFor={`${uid}-tm`}>{t("time")}</label>
            <input id={`${uid}-tm`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <p className="opx-ug-hint">{t("timeOptional")}</p>

        <Field label={t("note")} value={note} onChange={setNote} multiline rows={2} placeholder={t("notePh")} />

        <div ref={errBox} className="opx-ug-errs">
          {err ? <Note tone="bad">{err}</Note> : null}
          {offer === "count" ? (
            <label className="opx-ug-check opx-ug-check--hint">
              <input type="checkbox" checked={okCount} onChange={(e) => setOkCount(e.target.checked)} />
              <span>
                {t("overrideCount")}
                <small>{t("overrideCountHint")}</small>
              </span>
            </label>
          ) : null}
          {offer === "direction" ? (
            <label className="opx-ug-check opx-ug-check--hint">
              <input type="checkbox" checked={okDirection} onChange={(e) => setOkDirection(e.target.checked)} />
              <span>
                {t("overrideDirection")}
                <small>{t("overrideDirectionHint")}</small>
              </span>
            </label>
          ) : null}
        </div>
      </div>
      <StepFoot
        onBack={onBack}
        backLabel={t("back")}
        primary={() => void submit()}
        label={t("assignSubmit")}
        busy={busy}
        busyLabel={t("assigning")}
        disabled={!ids.length}
        icon={<IconUsers {...px(16)} aria-hidden="true" />}
      />
    </>
  );
}
