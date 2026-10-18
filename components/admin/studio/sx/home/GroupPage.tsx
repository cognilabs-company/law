"use client";

import "../sx-tones.css";
import "./sx-home.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { aiId } from "@/lib/ai/ids";
import { useStudioAccess, useStudioRegistry } from "@/lib/services/studio";
import { SxButton, SxLinkButton } from "../Button";
import { ArrowRightIcon, RefreshCwIcon, CircleCheckIcon, LockIcon, SearchIcon, ctorGlyph, glyph } from "../icons";
import { SxEmpty } from "../layout/Empty";
import { SxNote } from "../layout/Note";
import { SxPage } from "../layout/Page";
import { SxPanel } from "../layout/Panel";
import { SxTable, type SxColumn } from "../layout/Table";
import { SxProgress } from "../shared/Progress";
import { StartJourneyButton } from "../shared/StartJourney";
import { groupHue } from "../tones";
import { useStudioLabels, type StudioLabels } from "../useStudioLabels";
import { groupNext, groupProgress, groupSteps, type GroupStepRow } from "./groupModel";
import { GroupTile } from "./GroupTile";
import { useActionItems } from "./useActionItems";
import { WaitingPanel } from "./WaitingPanel";

export type GroupNeed = "" | "returned" | "review" | "publish";

const enc = encodeURIComponent;
const SENTINEL = "\u0000";

function withList(text: string, nodes: readonly ReactNode[]): ReactNode {
  const at = text.indexOf(SENTINEL);
  if (at < 0) return text;
  const list: ReactNode[] = [];
  nodes.forEach((n, i) => {
    if (i) list.push(", ");
    list.push(n);
  });
  return (
    <>
      {text.slice(0, at)}
      {list}
      {text.slice(at + SENTINEL.length)}
    </>
  );
}

function StateCell({ row, labels }: { row: GroupStepRow; labels: StudioLabels }) {
  const t = useTranslations("studio");
  if (row.state === "done")
    return (
      <span className="sx-gstate" data-state="done">
        {glyph(CircleCheckIcon, { size: 16 })}
        <span>{t("sx.guide.done")}</span>
      </span>
    );
  if (row.state === "next")
    return (
      <span className="sx-gstate" data-state="next">
        {glyph(ArrowRightIcon, { size: 16 })}
        <span>{t("sx.gpage.state.next")}</span>
      </span>
    );
  if (row.state === "blocked") {
    const links = row.missing.map((code) => (
      <Link key={code} href={`/admin/studio/c/${enc(code)}`} className="sx-link">
        {labels.ctorName(code)}
      </Link>
    ));
    return (
      <span className="sx-gstate" data-state="blocked">
        {glyph(LockIcon, { size: 16 })}
        <span>{links.length ? withList(t("sx.gpage.state.blocked", { list: SENTINEL }), links) : t("sx.guide.notDone")}</span>
      </span>
    );
  }
  return (
    <span className="sx-gstate" data-state="open">
      <span>{t("sx.guide.notDone")}</span>
    </span>
  );
}

export function GroupPage({ groupKey, need }: { groupKey: string; need: GroupNeed }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const acc = useStudioAccess();
  const reg = useStudioRegistry();
  const actions = useActionItems();
  const g = reg.groups.find((x) => x.key === groupKey) ?? null;
  const loaded = reg.items.length > 0 || reg.groups.length > 0;
  const loading = !g && reg.avail === "on" && !loaded && !reg.error;
  const failed = !g && !loaded && !!reg.error;
  const missing = !g && loaded;
  const hue = g ? groupHue(g.key, g.order) : groupHue(groupKey, 1);
  const rows = g ? groupSteps(g, reg.items) : [];
  const { done, total } = groupProgress(rows);
  const next = g ? groupNext(g, rows) : null;
  const nextName = next ? labels.ctorName(next.code, next.ctor?.title) : "";
  const counts = g ? actions.byGroup[g.key] : undefined;
  const hasItems = !!counts && counts.returned + counts.review + counts.publish > 0;
  const name = g ? labels.groupName(g.key, g.title) : "";

  const title = g ? name : missing ? t("sx.gpage.missingTitle") : failed ? t("sx.ui.studio") : "";

  const columns: readonly SxColumn<GroupStepRow>[] = [
    { key: "step", header: t("sx.gpage.col.step"), width: "64px", numeric: true, cell: (r) => <span className="sx-gstep-num">{labels.num(r.step)}</span> },
    {
      key: "ctor",
      header: t("sx.gpage.col.ctor"),
      primary: true,
      cell: (r) => {
        const what = labels.ctorWhat(r.code);
        return (
          <span className="sx-gstep" data-ai-id={aiId("admin.studio.flow.step", r.code)} data-ai-type="list_item" data-ai-label={labels.ctorName(r.code, r.ctor?.title)}>
            {ctorGlyph(r.code, g?.key, { size: 18 })}
            <span className="sx-gstep__text">
              <span className="sx-gstep__name">{labels.ctorName(r.code, r.ctor?.title)}</span>
              {what ? (
                <span className="sx-gstep__what" title={what}>
                  {what}
                </span>
              ) : null}
            </span>
          </span>
        );
      },
    },
    { key: "state", header: t("sx.gpage.col.state"), cell: (r) => <StateCell row={r} labels={labels} /> },
    { key: "records", header: t("sx.gpage.col.records"), numeric: true, hideBelow: "md", cell: (r) => (r.ctor?.recordCount === null || r.ctor?.recordCount === undefined ? "—" : labels.num(r.ctor.recordCount)) },
  ];

  const headActions =
    g && g.key === "services_packages" && acc.canEdit ? (
      <>
        <StartJourneyButton type="service" variant="primary" label={t("sx.journeyRun.newService")} aiId="admin.studio.group.new-service" />
        <StartJourneyButton type="package" variant="secondary" label={t("sx.journeyRun.newPackage")} aiId="admin.studio.group.new-package" />
      </>
    ) : undefined;

  let below: ReactNode;
  if (loading)
    below = (
      <div className="sx-gprog" aria-hidden="true">
        <span className="sx-sk sx-gprog__sk" />
      </div>
    );
  else if (g && acc.any)
    below = (
      <>
        <div className="sx-gprog" data-hue={hue}>
          <span className="sx-gprog__count sx-num">{t("sx.home.card.progress", { done, total })}</span>
          <SxProgress value={total ? (done / total) * 100 : 0} label={t("sx.home.card.progressLabel", { name, done, total })} size="md" className="sx-gprog__bar" />
          {next ? (
            <SxLinkButton variant="secondary" size="sm" href={`/admin/studio/c/${enc(next.code)}`} iconEnd={ArrowRightIcon} aiId="admin.studio.group.next">
              {t("sx.home.card.next", { name: nextName })}
            </SxLinkButton>
          ) : (
            <span className="sx-gcard__done">
              {glyph(CircleCheckIcon, { size: 16 })}
              <span>{t("sx.home.card.allDone")}</span>
            </span>
          )}
        </div>
      </>
    );

  let body: ReactNode;
  if (failed)
    body = (
      <SxNote
        tone="error"
        title={t("sx.ui.errorTitle")}
        action={
          <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={() => void reg.reload()} aiId="admin.studio.group.retry">
            {t("sx.ui.retry")}
          </SxButton>
        }
      >
        {t("sx.ui.loadFail")}
      </SxNote>
    );
  else if (missing)
    body = (
      <SxEmpty
        icon={SearchIcon}
        title={t("sx.gpage.missingTitle")}
        text={t("sx.gpage.missingText")}
        action={
          <SxLinkButton variant="secondary" href="/admin/studio" aiId="admin.studio.group.missing.back">
            {t("sx.editor.toHome")}
          </SxLinkButton>
        }
      />
    );
  else
    body = (
      <>
        {g && (hasItems || need) ? (
          <WaitingPanel
            data={actions}
            scope={{ group: g.key, need: need || undefined }}
            aiId="admin.studio.group.waiting"
            headerAction={
              need ? (
                <SxLinkButton variant="ghost" size="sm" href={`/admin/studio/g/${enc(g.key)}`} aiId="admin.studio.group.waiting.need-all">
                  {t("sx.gpage.needAll")}
                </SxLinkButton>
              ) : undefined
            }
          />
        ) : null}
        <SxPanel flush title={t("sx.gpage.steps")} titleAs="h2">
          <SxTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.code}
            caption={t("sx.gpage.steps")}
            loading={loading}
            stacked="auto"
            rowHref={(r) => `/admin/studio/c/${enc(r.code)}`}
            rowTitle={(r) => labels.ctorName(r.code, r.ctor?.title)}
            aiId="admin.studio.group.steps"
          />
        </SxPanel>
      </>
    );

  return (
    <SxPage
      title={title}
      section="home"
      crumbs={[]}
      lead={g ? labels.groupWhat(g.key, g.description) : undefined}
      icon={
        g ? (
          <span data-hue={hue} className="sx-head__tile">
            <GroupTile groupKey={g.key} order={g.order} size="lg" />
          </span>
        ) : undefined
      }
      actions={headActions}
      below={below}
      aiId="admin.studio.group"
    >
      <>
        <div data-hue={hue} className="sx-gpage">
          {body}
        </div>
      </>
    </SxPage>
  );
}
