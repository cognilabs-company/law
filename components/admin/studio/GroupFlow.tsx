"use client";

import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { useStudioAccess, useStudioRegistry, type StudioConstructor, type StudioGroup, type StudioJourney } from "@/lib/services/studio";
import StudioShell from "./StudioShell";
import { ConstructorIcon, StudioEmpty, StudioLoading } from "./bits";
import { useStudioHuman } from "./human";
import { IconAlert, IconArrowRight, IconCheck, IconChevronRight, IconCircleCheck, IconFolder, IconInfo, IconLayers, IconLock, IconSearch } from "@/components/icons";

// The catalog as the backend arranges the work (spec 10-12 grouped
// workflows): nine business groups, each a sequence of constructors, and
// journeys that run one goal through several groups. Nothing here orders or
// groups constructors itself — the order is the backend's.

const wsHref = (code: string) => `/admin/studio/c/${encodeURIComponent(code)}`;

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <span className="stu-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}>
      <i style={{ width: `${value}%` }} />
    </span>
  );
}

// Where a constructor stands: done, blocked by a step that must come first,
// or open (perhaps with recommended steps still undone).
export function CtorState({ ctor, compact }: { ctor: StudioConstructor; compact?: boolean }) {
  const { t, ctorName } = useStudioHuman();
  if (ctor.completed)
    return (
      <span className="stu-cstate stu-cstate--done">
        <IconCircleCheck aria-hidden />
        {t("flow.state.done")}
      </span>
    );
  if (ctor.availability === "blocked" || ctor.missingRequired.length)
    return (
      <span className="stu-cstate stu-cstate--blocked" title={ctor.missingRequired.map((c) => ctorName(c)).join(", ")}>
        <IconLock aria-hidden />
        {compact ? t("flow.state.blocked") : t("flow.state.blockedBy", { list: ctor.missingRequired.map((c) => ctorName(c)).join(", ") })}
      </span>
    );
  if (ctor.missingRecommended.length)
    return (
      <span className="stu-cstate stu-cstate--rec" title={ctor.missingRecommended.map((c) => ctorName(c)).join(", ")}>
        <IconInfo aria-hidden />
        {t("flow.state.recommended")}
      </span>
    );
  return <span className="stu-cstate stu-cstate--open">{t("flow.state.open")}</span>;
}

export function DashGroups({ groups, items }: { groups: StudioGroup[]; items: StudioConstructor[] }) {
  const { t, ctorName, num, groupTitle, groupText } = useStudioHuman();
  if (!groups.length) return null;
  const done = groups.reduce((n, g) => n + g.completed, 0);
  const all = groups.reduce((n, g) => n + g.count, 0);
  return (
    <section className="stu-groups" aria-label={t("flow.groupsTitle")} data-ai-id="admin.studio.dash.groups" data-ai-type="section" data-ai-label={t("flow.groupsTitle")}>
      <header className="stu-sec-h">
        <div>
          <h3>{t("flow.groupsTitle")}</h3>
          <p>{t("flow.groupsLead", { done: num(done), all: num(all), n: num(groups.length) })}</p>
        </div>
      </header>
      <ol className="stu-groups__grid">
        {groups.map((g) => {
          const next = g.nextCode ? items.find((c) => c.code === g.nextCode) : null;
          return (
            <li key={g.key} className={`stu-gcard${g.progress >= 100 ? " is-done" : ""}`}>
              <Link href={`/admin/studio/g/${encodeURIComponent(g.key)}`} className="stu-gcard__main" data-ai-id={aiId("admin.studio.dash.group", g.key)} data-ai-type="card" data-ai-label={groupTitle(g.key, g.title)}>
                <span className="stu-gcard__n" aria-hidden>
                  {g.order}
                </span>
                <span className="stu-gcard__t">
                  <b>{groupTitle(g.key, g.title)}</b>
                  {groupText(g.key, g.description) ? <small>{groupText(g.key, g.description)}</small> : null}
                </span>
                <IconChevronRight className="stu-gcard__go" aria-hidden />
              </Link>
              <div className="stu-gcard__prog">
                <Progress value={g.progress} label={t("flow.progressAria", { title: groupTitle(g.key, g.title) })} />
                <span>
                  <b>{t("flow.doneOf", { done: num(g.completed), all: num(g.count) })}</b> · {g.progress}%
                </span>
              </div>
              {g.nextCode ? (
                <Link href={wsHref(g.nextCode)} className="stu-gcard__next" data-ai-id={aiId("admin.studio.dash.group", g.key, "next")} data-ai-type="link" data-ai-label={t("flow.continue")}>
                  <span>
                    <small>{t("flow.continue")}</small>
                    <b>{ctorName(g.nextCode, next?.title)}</b>
                  </span>
                  <IconArrowRight aria-hidden />
                </Link>
              ) : (
                <span className="stu-gcard__next is-done">
                  <IconCircleCheck aria-hidden />
                  {t("flow.groupDone")}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function DashJourneys({ journeys }: { journeys: StudioJourney[] }) {
  const { t, num, journeyTitle, journeyText } = useStudioHuman();
  if (!journeys.length) return null;
  return (
    <section className="stu-journeys" aria-label={t("flow.journeysTitle")} data-ai-id="admin.studio.dash.journeys" data-ai-type="section" data-ai-label={t("flow.journeysTitle")}>
      <header className="stu-sec-h">
        <div>
          <h3>{t("flow.journeysTitle")}</h3>
          <p>{t("flow.journeysLead")}</p>
        </div>
      </header>
      <ul className="stu-journeys__list">
        {journeys.map((j) => (
          <li key={j.key}>
            <Link href={`/admin/studio/j/${encodeURIComponent(j.key)}`} className="stu-jcard" data-ai-id={aiId("admin.studio.dash.journey", j.key)} data-ai-type="card" data-ai-label={journeyTitle(j.key, j.title)}>
              <span className="stu-jcard__t">
                <b>{journeyTitle(j.key, j.title)}</b>
                {journeyText(j.key, j.description) ? <small>{journeyText(j.key, j.description)}</small> : null}
              </span>
              <span className="stu-jcard__dots" aria-hidden>
                {j.steps.map((s) => (
                  <i key={`${s.step}-${s.code}`} className={s.completed ? "is-done" : s.blocked ? "is-blocked" : undefined} />
                ))}
              </span>
              <span className="stu-jcard__foot">
                <Progress value={j.progress} label={t("flow.progressAria", { title: journeyTitle(j.key, j.title) })} />
                <small>{t("flow.stepsDone", { done: num(j.completed), all: num(j.steps.length) })}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// One constructor as a step of a sequence: number, name, what it does, where
// it stands, and what it waits on.
function StepItem({ n, code, ctor, current, title }: { n: number; code: string; ctor: StudioConstructor | null; current: boolean; title?: string }) {
  const { t, ctorName, what } = useStudioHuman();
  const name = ctorName(code, ctor?.title || title);
  const blocked = Boolean(ctor && (ctor.availability === "blocked" || ctor.missingRequired.length));
  return (
    <li className={`stu-step${ctor?.completed ? " is-done" : ""}${blocked ? " is-blocked" : ""}${current ? " is-current" : ""}`} aria-current={current ? "step" : undefined}>
      <span className="stu-step__n" aria-hidden>
        {ctor?.completed ? <IconCheck /> : n}
      </span>
      <div className="stu-step__b">
        <Link href={wsHref(code)} className="stu-step__h" data-ai-id={aiId("admin.studio.flow.step", code)} data-ai-type="link" data-ai-label={name}>
          <ConstructorIcon code={code} size="sm" />
          <b>{name}</b>
        </Link>
        {ctor && what(ctor) ? <p>{what(ctor)}</p> : null}
        <div className="stu-step__f">
          {ctor ? <CtorState ctor={ctor} /> : null}
          {current ? <span className="stu-step__now">{t("flow.current")}</span> : null}
          {blocked && ctor
            ? ctor.missingRequired.map((c) => (
                <Link key={c} href={wsHref(c)} className="stu-step__dep">
                  {t("flow.goTo", { name: ctorName(c) })}
                  <IconArrowRight aria-hidden />
                </Link>
              ))
            : null}
        </div>
      </div>
      <Link href={wsHref(code)} className={`btn btn--sm ${current ? "btn--pri" : "btn--line"}`} aria-label={t("flow.openAria", { name })}>
        {blocked ? t("flow.why") : t("flow.open")}
      </Link>
    </li>
  );
}

function Missing({ text }: { text: string }) {
  const { t } = useStudioHuman();
  return (
    <StudioEmpty icon={IconSearch} title={t("flow.missingTitle")} text={text}>
      <Link href="/admin/studio" className="btn btn--line btn--sm">
        {t("actions.backHome")}
      </Link>
    </StudioEmpty>
  );
}

export function StudioGroupPage({ groupKey }: { groupKey: string }) {
  const { t, num, groupTitle, groupText } = useStudioHuman();
  const reg = useStudioRegistry();
  const acc = useStudioAccess();
  const g = reg.groups.find((x) => x.key === groupKey) ?? null;
  const loading = reg.avail === "checking" || (reg.avail === "on" && !reg.items.length && !reg.error);
  const byCode = (c: string) => reg.items.find((x) => x.code === c) ?? null;
  return (
    <StudioShell
      title={g ? groupTitle(g.key, g.title) : t("flow.groupTitle")}
      lead={g ? groupText(g.key, g.description) : ""}
      eyebrow={g ? t("flow.groupEyebrow", { n: g.order }) : undefined}
      icon={<span className="stu-gico"><IconFolder aria-hidden /></span>}
      back={{ href: "/admin/studio", label: t("actions.backHome") }}
      tabs={false}
    >
      {loading ? (
        <StudioLoading rows={5} />
      ) : !g ? (
        <Missing text={t("flow.groupMissing", { key: groupKey })} />
      ) : (
        <>
          <div className="stu-flowhead">
            <div>
              <b>{t("flow.doneOf", { done: num(g.completed), all: num(g.count) })}</b>
              <small>{t("flow.availableN", { n: num(g.available) })}</small>
            </div>
            <Progress value={g.progress} label={t("flow.progressAria", { title: groupTitle(g.key, g.title) })} />
            <span className="stu-flowhead__pct">{g.progress}%</span>
            {g.nextCode && acc.any ? (
              <Link href={wsHref(g.nextCode)} className="btn btn--pri btn--sm">
                {t("flow.continue")}
                <IconArrowRight aria-hidden />
              </Link>
            ) : null}
          </div>
          <ol className="stu-steps" aria-label={groupTitle(g.key, g.title)}>
            {g.codes.map((c, i) => (
              <StepItem key={c} n={i + 1} code={c} ctor={byCode(c)} current={c === g.nextCode} />
            ))}
          </ol>
        </>
      )}
    </StudioShell>
  );
}

export function StudioJourneyPage({ journeyKey }: { journeyKey: string }) {
  const { t, num, ctorName, journeyTitle, journeyText } = useStudioHuman();
  const reg = useStudioRegistry();
  const j = reg.journeys.find((x) => x.key === journeyKey) ?? null;
  const loading = reg.avail === "checking" || (reg.avail === "on" && !reg.items.length && !reg.error);
  const next = j?.steps.find((s) => !s.completed) ?? null;
  return (
    <StudioShell
      title={j ? journeyTitle(j.key, j.title) : t("flow.journeyTitle")}
      lead={j ? journeyText(j.key, j.description) : ""}
      eyebrow={t("flow.journeyEyebrow")}
      icon={<span className="stu-gico"><IconLayers aria-hidden /></span>}
      back={{ href: "/admin/studio", label: t("actions.backHome") }}
      tabs={false}
    >
      {loading ? (
        <StudioLoading rows={5} />
      ) : !j ? (
        <Missing text={t("flow.journeyMissing", { key: journeyKey })} />
      ) : (
        <>
          <div className="stu-flowhead">
            <div>
              <b>{t("flow.stepsDone", { done: num(j.completed), all: num(j.steps.length) })}</b>
              <small>{next ? t("flow.nextIs", { name: ctorName(next.code, next.title) }) : t("flow.journeyDone")}</small>
            </div>
            <Progress value={j.progress} label={t("flow.progressAria", { title: journeyTitle(j.key, j.title) })} />
            <span className="stu-flowhead__pct">{j.progress}%</span>
            {next ? (
              <Link href={wsHref(next.code)} className="btn btn--pri btn--sm">
                {t("flow.continue")}
                <IconArrowRight aria-hidden />
              </Link>
            ) : null}
          </div>
          {next?.blocked ? (
            <p className="stu-flownote" role="note">
              <IconAlert aria-hidden />
              {t("flow.nextBlocked", { list: next.missingRequired.map((c) => ctorName(c)).join(", ") })}
            </p>
          ) : null}
          <ol className="stu-steps" aria-label={journeyTitle(j.key, j.title)}>
            {j.steps.map((s) => {
              const c = reg.items.find((x) => x.code === s.code) ?? null;
              // The journey's own word on each step wins over the constructor's.
              const ctor = c ? { ...c, completed: s.completed, availability: s.blocked ? "blocked" : c.availability, missingRequired: s.missingRequired } : null;
              return <StepItem key={`${s.step}-${s.code}`} n={s.step} code={s.code} ctor={ctor} title={s.title} current={next === s} />;
            })}
          </ol>
        </>
      )}
    </StudioShell>
  );
}

// The workspace's view of the sequence: this constructor's place in its
// group, what must or should come first, and what comes next (§5, §7).
export function CtorSequence({ ctor }: { ctor: StudioConstructor }) {
  const { t, ctorName, groupTitle, reason } = useStudioHuman();
  const reg = useStudioRegistry();
  const nav = ctor.navigation;
  if (!nav) return null;
  const done = (c: string) => reg.items.find((x) => x.code === c)?.completed ?? false;
  const blocked = ctor.availability === "blocked" || ctor.missingRequired.length > 0;
  const chip = (c: string, tone: "req" | "rec" | "next") => (
    <Link key={c} href={wsHref(c)} className={`stu-seq__chip stu-seq__chip--${tone}${done(c) ? " is-done" : ""}`}>
      {done(c) ? <IconCircleCheck aria-hidden /> : tone === "req" ? <IconLock aria-hidden /> : tone === "rec" ? <IconInfo aria-hidden /> : <IconArrowRight aria-hidden />}
      <b>{ctorName(c)}</b>
    </Link>
  );
  return (
    <section className={`stu-seq${blocked ? " is-blocked" : ""}`} aria-label={t("flow.seqTitle")}>
      <div className="stu-seq__where">
        <Link href={`/admin/studio/g/${encodeURIComponent(nav.groupKey)}`} className="stu-seq__grp">
          <IconFolder aria-hidden />
          {groupTitle(nav.groupKey, nav.groupTitle)}
        </Link>
        {nav.steps ? <span className="stu-seq__step">{t("flow.stepOf", { n: nav.step, of: nav.steps })}</span> : null}
        <CtorState ctor={ctor} compact />
        {nav.step ? <p>{reason(groupTitle(nav.groupKey, nav.groupTitle), nav.step)}</p> : null}
      </div>
      {blocked ? (
        <div className="stu-seq__block" role="alert">
          <IconLock aria-hidden />
          <div>
            <b>{t("flow.blockedTitle")}</b>
            <p>{t("flow.blockedText")}</p>
            <div className="stu-seq__chips">{ctor.missingRequired.map((c) => chip(c, "req"))}</div>
          </div>
        </div>
      ) : null}
      {ctor.missingRecommended.length ? (
        <div className="stu-seq__rec" role="note">
          <IconInfo aria-hidden />
          <div>
            <b>{t("flow.recTitle")}</b>
            <div className="stu-seq__chips">{ctor.missingRecommended.map((c) => chip(c, "rec"))}</div>
          </div>
        </div>
      ) : null}
      {(nav.requiredBefore.length && !blocked) || nav.recommendedBefore.length || nav.nextSteps.length ? (
        <dl className="stu-seq__dl">
          {nav.requiredBefore.length && !blocked ? (
            <div>
              <dt>{t("ux.requiredBefore")}</dt>
              <dd className="stu-seq__chips">{nav.requiredBefore.map((c) => chip(c, "req"))}</dd>
            </div>
          ) : null}
          {nav.recommendedBefore.length ? (
            <div>
              <dt>{t("ux.recommendedBefore")}</dt>
              <dd className="stu-seq__chips">{nav.recommendedBefore.map((c) => chip(c, "rec"))}</dd>
            </div>
          ) : null}
          {nav.nextSteps.length ? (
            <div>
              <dt>{t("ux.nextSteps")}</dt>
              <dd className="stu-seq__chips">{nav.nextSteps.map((c) => chip(c, "next"))}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
