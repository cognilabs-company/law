"use client";

import "../sx-core.css";
import "../sx-layout.css";
import { useState, useSyncExternalStore, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import Menu, { type MenuEntry } from "@/components/ui/Menu";
import { SxButton } from "../Button";
import { ArchiveIcon, ArrowRightIcon, FloppyDiskIcon, InfoIcon, SquaresFourIcon, glyph, moreGlyph } from "../icons";
import { StatusRail } from "../StatusRail";
import { useStudioLabels } from "../useStudioLabels";
import { SxGuide } from "../layout/Guide";
import { SxPage } from "../layout/Page";
import { SxPanel, SxSectionHeader } from "../layout/Panel";
import { CoreLab } from "./CoreLab";
import { FormLab } from "./FormLab";
import { LayoutLab } from "./LayoutLab";

const AI = "admin.studio.lab";
const CODE = "K12-PROMO";
const FLOW = ["draft", "submitted", "in_review", "approved", "published"] as const;
const LAYOUTS = ["page", "record"] as const;
const PHONE_QUERY = "(max-width: 640px)";

type Layout = (typeof LAYOUTS)[number];

function subscribePhone(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function phoneNow(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
}

const phoneOnServer = () => false;

export function SxLab(): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const phone = useSyncExternalStore(subscribePhone, phoneNow, phoneOnServer);
  const [layout, setLayout] = useState<Layout>("page");
  const [step, setStep] = useState(0);
  const [guide, setGuide] = useState(false);
  const record = layout === "record";
  const status = FLOW[step];

  const toggle = (
    <div className="sx-lab__switch" role="group" aria-label={t("sx.layout.lab.layout")}>
      {LAYOUTS.map((l) => (
        <SxButton key={l} variant="ghost" size="sm" aria-pressed={layout === l} onClick={() => setLayout(l)} aiId={`${AI}.mode.${l}`}>
          {t(l === "page" ? "sx.layout.lab.page" : "sx.layout.lab.record")}
        </SxButton>
      ))}
    </div>
  );

  const noWrites = t("sx.layout.lab.noWrites");
  const moreItems: MenuEntry[] = [
    ...(phone ? [{ key: "save", label: t("sx.ui.save"), icon: glyph(FloppyDiskIcon, { size: 16 }), disabled: noWrites, aiId: `${AI}.more.save` }] : []),
    { key: "page", label: t("sx.layout.lab.page"), icon: glyph(SquaresFourIcon, { size: 16 }), onSelect: () => setLayout("page"), aiId: `${AI}.mode.page` },
    { key: "guide", label: t("sx.guide.title"), icon: glyph(InfoIcon, { size: 16 }), onSelect: () => setGuide(true), aiId: `${AI}.more.guide` },
    { key: "archive", label: t("sx.ui.archive"), icon: glyph(ArchiveIcon, { size: 16 }), danger: true, disabled: noWrites, aiId: `${AI}.more.archive` },
  ];

  const recordActions = (
    <>
      {phone ? null : (
        <SxButton icon={FloppyDiskIcon} aria-disabled title={noWrites} aiId={`${AI}.save`}>
          {t("sx.ui.save")}
        </SxButton>
      )}
      <SxButton variant="primary" iconEnd={ArrowRightIcon} onClick={() => setStep((s) => (s + 1) % FLOW.length)} aiId={`${AI}.next`}>
        {t("sx.layout.lab.next")}
      </SxButton>
      <Menu label={t("sx.ui.more")} className="sx-pop sx-menu" triggerClassName="sx-ibtn" icon={moreGlyph()} align="end" aiId={`${AI}.more`} items={moreItems} />
    </>
  );

  return (
    <SxPage
      title={record ? labels.promoPackage("profile-starter-7", "Profile boost - 7 days") : t("sx.lab.title")}
      layout={layout}
      section="home"
      need="admin"
      crumbs={
        record
          ? [
              { label: labels.groupName("advertising", "Reklama"), href: "/admin/studio/g/advertising" },
              { label: labels.ctorName(CODE), href: `/admin/studio/c/${CODE}` },
            ]
          : []
      }
      lead={record ? undefined : t("sx.layout.lab.lead")}
      meta={
        record ? (
          <span className="sx-lab__meta">
            <code className="sx-code">{CODE}</code>
            <span>{t("sx.layout.version", { n: 3 })}</span>
          </span>
        ) : undefined
      }
      actions={record ? recordActions : toggle}
      below={record ? <StatusRail status={status} note={labels.statusHint(status)} /> : undefined}
      statusWhenStuck={record ? <StatusRail variant="compact" status={status} /> : undefined}
      aiId={AI}
    >
      <SxPanel title={t("sx.lab.core")} aiId={`${AI}.core`}>
        <CoreLab />
      </SxPanel>
      <SxPanel title={t("sx.lab.form")} aiId={`${AI}.form`}>
        <FormLab />
      </SxPanel>
      <section className="sx-lab__section" aria-labelledby="sx-lab-layout">
        <SxSectionHeader id="sx-lab-layout" title={t("sx.lab.layout")} />
        <LayoutLab />
      </section>
      <SxGuide code={CODE} open={guide} onClose={() => setGuide(false)} />
    </SxPage>
  );
}
