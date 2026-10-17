"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "../shared/sx-shared.css";
import "./sx-paths.css";
import { Fragment, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { useStudioRegistry, type StudioConstructor, type StudioGroup, type StudioJourney } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { ArrowRightIcon, ArrowsClockwiseIcon, CheckCircleIcon, LockSimpleIcon, MagnifyingGlassIcon, ctorGlyph, glyph } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxPage } from "../layout/Page";
import { SxPanel } from "../layout/Panel";
import { SxTable, type SxColumn } from "../layout/Table";
import { launchSteps, type GroupStepRow } from "../home/groupModel";
import { SxProgress } from "../shared/Progress";
import { useStudioLabels } from "../useStudioLabels";

const LIST_MARK = "⁣";
const ctorHref = (code: string) => `/admin/studio/c/${encodeURIComponent(code)}`;

export type LaunchNext = { code: string; title: string; missing: string[] };

export function launchNext(j: StudioJourney, items: readonly StudioConstructor[]): LaunchNext | null {
  const s = j.steps.find((x) => !x.completed);
  if (!s) return null;
  const ctor = items.find((c) => c.code === s.code) ?? null;
  const own = s.missingRequired.filter(Boolean);
  const missing = own.length ? own : s.blocked ? (ctor?.missingRequired ?? []).filter(Boolean) : [];
  return { code: s.code, title: s.title || ctor?.title || "", missing };
}

function groupLabelOf(row: GroupStepRow, groups: readonly StudioGroup[], name: (key: string, title?: string) => string): string {
  const nav = row.ctor?.navigation;
  if (nav?.groupKey) return name(nav.groupKey, nav.groupTitle);
  const g = groups.find((x) => x.codes.includes(row.code));
  return g ? name(g.key, g.title) : "";
}

function splitAround(text: string): [string, string] {
  const at = text.indexOf(LIST_MARK);
  if (at < 0) return [text, ""];
  return [text.slice(0, at), text.slice(at + LIST_MARK.length)];
}

function StepState({ row, nameOf }: { row: GroupStepRow; nameOf: (code: string) => string }): ReactElement {
  const t = useTranslations("studio");
  if (row.state === "done") {
    return (
      <span className="sx-lp-state" data-state="done">
        {glyph(CheckCircleIcon, { size: 16 })}
        <span>{t("sx.guide.done")}</span>
      </span>
    );
  }
  if (row.state === "next") {
    return (
      <span className="sx-lp-state" data-state="next">
        {glyph(ArrowRightIcon, { size: 16 })}
        <span>{t("sx.gpage.state.next")}</span>
      </span>
    );
  }
  const missing = row.missing.length ? row.missing : (row.ctor?.missingRequired ?? []);
  if (row.state === "blocked" && missing.length) {
    const [before, after] = splitAround(t("sx.gpage.state.blocked", { list: LIST_MARK }));
    return (
      <span className="sx-lp-state" data-state="blocked">
        {glyph(LockSimpleIcon, { size: 16 })}
        <span>
          {before}
          {missing.map((code, i) => (
            <Fragment key={code}>
              {i ? ", " : null}
              <Link href={ctorHref(code)} className="sx-link sx-lp-state__link">
                {nameOf(code)}
              </Link>
            </Fragment>
          ))}
          {after}
        </span>
      </span>
    );
  }
  return (
    <span className="sx-lp-state" data-state={row.state === "blocked" ? "blocked" : "open"}>
      {row.state === "blocked" ? glyph(LockSimpleIcon, { size: 16 }) : null}
      <span>{t("sx.guide.notDone")}</span>
    </span>
  );
}

export function LaunchPathPage({ pathKey }: { pathKey: string }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const j = reg.journeys.find((x) => x.key === pathKey) ?? null;
  const empty = !reg.items.length && !reg.journeys.length;
  const failed = !j && !!reg.error && empty;
  const loading = !j && reg.avail === "on" && empty && !reg.error;
  const missing = !j && reg.avail === "on" && !failed && !loading;

  const nameOf = (code: string) => labels.ctorName(code, reg.items.find((c) => c.code === code)?.title);
  const rows = j ? launchSteps(j, reg.items) : [];
  const next = j ? launchNext(j, reg.items) : null;
  const nextName = next ? labels.ctorName(next.code, next.title) : "";
  const pathName = j ? labels.journeyName(j.key, j.title) : "";

  const title = j ? pathName : missing ? t("sx.lpath.missingTitle") : failed ? t("sx.journeyRun.launchPath") : "";
  const crumbs = [{ label: t("sx.journeyRun.launchPaths"), href: "/admin/studio#paths" }];

  const columns: readonly SxColumn<GroupStepRow>[] = [
    {
      key: "step",
      header: t("sx.gpage.col.step"),
      width: "64px",
      numeric: true,
      cell: (row) => <span className="sx-lp-num">{labels.num(row.step)}</span>,
    },
    {
      key: "ctor",
      header: t("sx.gpage.col.ctor"),
      primary: true,
      cell: (row) => {
        const name = labels.ctorName(row.code, j?.steps.find((s) => s.code === row.code && s.step === row.step)?.title || row.ctor?.title);
        const group = groupLabelOf(row, reg.groups, labels.groupName);
        return (
          <span className="sx-lp-ctor">
            {ctorGlyph(row.code, row.ctor?.navigation?.groupKey, { size: 18, className: "sx-lp-ctor__icon" })}
            <span className="sx-lp-ctor__text">
              <Link href={ctorHref(row.code)} className="sx-table__primary sx-lp-ctor__name" data-ai-id={aiId("admin.studio.flow.step", row.code)} data-ai-type="link" data-ai-label={name}>
                {name}
              </Link>
              {group ? <span className="sx-lp-ctor__group">{group}</span> : null}
            </span>
          </span>
        );
      },
    },
    {
      key: "state",
      header: t("sx.gpage.col.state"),
      cell: (row) => <StepState row={row} nameOf={nameOf} />,
    },
  ];

  let below: ReactNode = null;
  if (j) {
    const firstMissing = next?.missing[0] ?? "";
    below = (
      <div className="sx-lp-head">
        <div className="sx-lp-prog">
          <span className="sx-lp-prog__count sx-num">{t("sx.journeyRun.progress", { done: j.completed, total: j.steps.length })}</span>
          <SxProgress size="md" value={j.progress} label={pathName} className="sx-lp-prog__bar" />
          {next ? (
            <span className="sx-lp-prog__pct sx-num">{t("sx.journeyRun.percent", { n: j.progress })}</span>
          ) : (
            <span className="sx-lp-prog__done">
              {glyph(CheckCircleIcon, { size: 16 })}
              <span>{t("sx.lpath.done")}</span>
            </span>
          )}
        </div>
        {next && firstMissing ? (
          <SxNote
            tone="warn"
            action={
              <SxLinkButton variant="secondary" size="sm" href={ctorHref(firstMissing)} aiId="admin.studio.path.goto-missing">
                {t("sx.cpage.goTo", { name: nameOf(firstMissing) })}
              </SxLinkButton>
            }
          >
            {t("sx.lpath.blocked", { list: labels.list(next.missing.map(nameOf), 5) })}
          </SxNote>
        ) : null}
      </div>
    );
  } else if (loading) {
    below = <span className="sx-sk sx-lp-sk" aria-hidden="true" />;
  }

  const actions = next ? (
    <SxLinkButton variant="primary" iconEnd={ArrowRightIcon} href={ctorHref(next.code)} aiId="admin.studio.path.next" aiLabel={t("sx.home.card.next", { name: nextName })} className="sx-lp-next">
      {t("sx.home.card.next", { name: nextName })}
    </SxLinkButton>
  ) : null;

  let body: ReactNode;
  if (failed) {
    body = (
      <SxNote
        tone="error"
        title={t("sx.ui.errorTitle")}
        action={
          <SxButton variant="ghost" size="sm" icon={ArrowsClockwiseIcon} onClick={() => void reg.reload()} aiId="admin.studio.path.retry">
            {t("sx.ui.retry")}
          </SxButton>
        }
      >
        {t("sx.ui.loadFail")}
      </SxNote>
    );
  } else if (missing) {
    body = (
      <SxEmpty
        icon={MagnifyingGlassIcon}
        title={t("sx.lpath.missingTitle")}
        text={t("sx.lpath.missingText")}
        action={
          <SxLinkButton variant="secondary" href="/admin/studio" aiId="admin.studio.path.home">
            {t("sx.editor.toHome")}
          </SxLinkButton>
        }
      />
    );
  } else {
    body = (
      <SxPanel flush title={t("sx.lpath.caption")} titleAs="h2">
        <SxTable rows={rows} columns={columns} rowKey={(r) => `${r.step}-${r.code}`} caption={t("sx.lpath.caption")} loading={!j} skeletonRows={6} stacked="auto" aiId="admin.studio.path.steps" />
      </SxPanel>
    );
  }

  return (
    <SxPage
      title={title}
      section="home"
      crumbs={crumbs}
      lead={j ? labels.journeyWhat(j.key, j.description) || undefined : undefined}
      actions={actions}
      below={below}
      aiId="admin.studio.path"
    >
      <div className="sx-lp">{body}</div>
    </SxPage>
  );
}
