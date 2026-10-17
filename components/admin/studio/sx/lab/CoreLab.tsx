"use client";

import "../sx-core.css";
import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { aiId } from "@/lib/ai/ids";
import { SxButton, type SxButtonVariant } from "../Button";
import * as iconSet from "../icons";
import { ArchiveIcon, ArrowCounterClockwiseIcon, ArrowRightIcon, FloppyDiskIcon, GROUP_ICON, PaperPlaneTiltIcon, XIcon, ctorGlyph, glyph } from "../icons";
import { StatusPill } from "../StatusPill";
import { StatusRail } from "../StatusRail";
import { sxStatus } from "../status";
import type { SxIcon, SxRecordSource } from "../types";
import { useStudioLabels, type StudioLabels } from "../useStudioLabels";

const AI = "admin.studio.lab.core";

const FLOW = ["draft", "submitted", "in_review", "approved", "published"] as const;
const PICKS = ["draft", "submitted", "in_review", "approved", "published", "changes_requested", "rejected", "archived"] as const;
const GALLERY: readonly { status: string; source?: SxRecordSource }[] = [
  { status: "draft" },
  { status: "submitted" },
  { status: "in_review" },
  { status: "approved" },
  { status: "scheduled" },
  { status: "published" },
  { status: "changes_requested" },
  { status: "rejected" },
  { status: "archived" },
  { status: "inactive", source: "runtime" },
  { status: "deleted", source: "runtime" },
  { status: "blocked" },
];
const PILLS: readonly { status: string; source?: SxRecordSource }[] = [
  { status: "draft" },
  { status: "submitted" },
  { status: "in_review" },
  { status: "approved" },
  { status: "scheduled" },
  { status: "published" },
  { status: "active", source: "runtime" },
  { status: "changes_requested" },
  { status: "rejected" },
  { status: "archived" },
  { status: "inactive", source: "runtime" },
  { status: "paused", source: "runtime" },
  { status: "deleted", source: "runtime" },
  { status: "expired", source: "runtime" },
  { status: "failed" },
  { status: "blocked" },
];
const VARIANTS: readonly { variant: SxButtonVariant; icon: SxIcon; text: (t: Translate) => string }[] = [
  { variant: "primary", icon: PaperPlaneTiltIcon, text: (t) => t("sx.core.lab.send") },
  { variant: "secondary", icon: FloppyDiskIcon, text: (t) => t("sx.ui.save") },
  { variant: "ghost", icon: XIcon, text: (t) => t("sx.ui.cancel") },
  { variant: "danger", icon: ArchiveIcon, text: (t) => t("sx.ui.archive") },
];
const GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ["services_packages", ["K01", "K34", "K31", "K32", "K33", "K02", "K29", "K03-M", "K30"]],
  ["documents_texts", ["K07", "K06", "K05", "K26", "K11"]],
  ["process_quality", ["K08", "K10", "K09", "K13", "K12-M", "MP05"]],
  ["communications", ["K27", "K14", "CALL01", "K22", "MP08"]],
  ["finance_tariffs", ["K17", "K04", "K18", "K25", "MP02", "MP03", "MP07"]],
  ["security_access", ["SEC01", "SEC02", "SEC03", "SEC04", "SEC05", "K20", "K21", "MP06"]],
  ["operations", ["OPS01", "OPS02", "OPS03", "OPS04", "OPS05", "OPS06", "ORG01", "K23", "K24", "MP01", "MP10", "K28", "K19"]],
  ["integrations", ["INT01", "INT02", "INT03"]],
  ["system_reference", ["CORE", "K16", "OPS07", "OPS08", "SEARCH01", "M1", "M2", "M3"]],
  ["advertising", ["MP04", "K12-PROMO", "MP09"]],
];
const ICONS: readonly (readonly [string, SxIcon])[] = Object.entries(iconSet)
  .filter((e): e is [string, SxIcon] => /^[A-Z][A-Za-z]+Icon$/.test(e[0]) && e[1] !== null && (typeof e[1] === "object" || typeof e[1] === "function"))
  .sort((a, b) => a[0].localeCompare(b[0]));

type Translate = ReturnType<typeof useTranslations>;

function Block({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="sx-lab-core__block" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {lead ? <p className="sx-lab-core__lead">{lead}</p> : null}
      {children}
    </section>
  );
}

function nextStage(status: string): string {
  const info = sxStatus(status);
  if (info.branch) return "in_review";
  if (info.stage < 0) return "draft";
  return FLOW[Math.min(FLOW.length - 1, info.stage + 1)];
}

function RailLab({ t, labels }: { t: Translate; labels: StudioLabels }) {
  const [status, setStatus] = useState<string>("draft");
  const [direct, setDirect] = useState<string>("draft");
  return (
    <Block title={t("sx.core.lab.rail")} lead={t("sx.core.lab.railLead")}>
      <div className="sx-lab-core__row" role="group" aria-label={t("sx.core.lab.statusPick")}>
        {PICKS.map((s) => (
          <SxButton key={s} size="sm" variant={status === s ? "primary" : "secondary"} aria-pressed={status === s} onClick={() => setStatus(s)} aiId={aiId(AI, "status", s)}>
            {labels.status(s)}
          </SxButton>
        ))}
        <SxButton size="sm" variant="ghost" iconEnd={ArrowRightIcon} onClick={() => setStatus(nextStage(status))} aiId={aiId(AI, "status", "next")}>
          {t("sx.core.lab.next")}
        </SxButton>
        <SxButton size="sm" variant="ghost" icon={ArrowCounterClockwiseIcon} onClick={() => setStatus("draft")} aiId={aiId(AI, "status", "restart")}>
          {t("sx.core.lab.restart")}
        </SxButton>
      </div>
      <div className="sx-lab-core__stage" data-lab="rail">
        <StatusRail status={status} note={labels.statusHint(status)} id="sx-lab-rail" />
        <div className="sx-lab-core__row">
          <span className="sx-lab-core__tag">{t("sx.core.lab.compact")}</span>
          <StatusRail status={status} variant="compact" celebrateOnPublish={false} />
        </div>
      </div>
      <h4>{t("sx.core.lab.direct")}</h4>
      <div className="sx-lab-core__row" role="group" aria-label={t("sx.core.lab.direct")}>
        {(["draft", "published"] as const).map((s) => (
          <SxButton key={s} size="sm" variant={direct === s ? "primary" : "secondary"} aria-pressed={direct === s} onClick={() => setDirect(s)} aiId={aiId(AI, "direct", s)}>
            {labels.status(s)}
          </SxButton>
        ))}
      </div>
      <div className="sx-lab-core__stage" data-lab="direct">
        <StatusRail status={direct} direct />
      </div>
      <h4>{t("sx.core.lab.all")}</h4>
      <div className="sx-lab-core__stage" data-lab="gallery">
        {GALLERY.map((g) => (
          <StatusRail key={`${g.status}-${g.source ?? "studio"}`} status={g.status} source={g.source} />
        ))}
        <div className="sx-lab-core__row">
          {GALLERY.map((g) => (
            <StatusRail key={`${g.status}-${g.source ?? "studio"}`} status={g.status} source={g.source} variant="compact" />
          ))}
        </div>
      </div>
    </Block>
  );
}

function PillLab({ t }: { t: Translate }) {
  return (
    <Block title={t("sx.core.lab.pills")} lead={t("sx.core.lab.pillsLead")}>
      <div className="sx-lab-core__row" data-lab="pills">
        {PILLS.map((p) => (
          <StatusPill key={`${p.status}-${p.source ?? "studio"}`} status={p.status} source={p.source} />
        ))}
      </div>
      <div className="sx-lab-core__row" data-lab="pills-sm">
        {PILLS.map((p) => (
          <StatusPill key={`${p.status}-${p.source ?? "studio"}`} status={p.status} source={p.source} size="sm" />
        ))}
      </div>
    </Block>
  );
}

function ButtonLab({ t }: { t: Translate }) {
  const cell = (variant: SxButtonVariant, icon: SxIcon, text: string, size: "md" | "sm") => (
    <div className="sx-lab-core__row">
      <SxButton variant={variant} size={size} icon={icon} aiId={aiId(AI, "btn", variant, size, "rest")}>
        {text}
      </SxButton>
      <SxButton variant={variant} size={size} icon={icon} disabled aiId={aiId(AI, "btn", variant, size, "disabled")}>
        {text}
      </SxButton>
      <SxButton variant={variant} size={size} icon={icon} busy aiId={aiId(AI, "btn", variant, size, "busy")}>
        {text}
      </SxButton>
    </div>
  );
  return (
    <Block title={t("sx.core.lab.buttons")} lead={t("sx.core.lab.buttonsLead")}>
      <div className="sx-lab-core__scroll" tabIndex={0} role="region" aria-label={t("sx.core.lab.buttons")}>
        <table className="sx-lab-core__table" data-lab="buttons">
          <thead>
            <tr>
              <th scope="col">{t("sx.core.lab.kind")}</th>
              <th scope="col">{t("sx.core.lab.sizeMd")}</th>
              <th scope="col">{t("sx.core.lab.sizeSm")}</th>
            </tr>
          </thead>
          <tbody>
            {VARIANTS.map((v) => (
              <tr key={v.variant}>
                <th scope="row">{t(`sx.core.lab.variant.${v.variant}`)}</th>
                <td>{cell(v.variant, v.icon, v.text(t), "md")}</td>
                <td>{cell(v.variant, v.icon, v.text(t), "sm")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function IconLab({ t, labels }: { t: Translate; labels: StudioLabels }) {
  return (
    <>
      <Block title={t("sx.core.lab.ctors")}>
        {GROUPS.map(([group, codes]) => (
          <div key={group} className="sx-lab-core__block">
            <h4 className="sx-lab-core__row">
              {glyph(GROUP_ICON[group], { size: 18 })}
              {labels.groupName(group)}
            </h4>
            <ul className="sx-lab-core__ctors">
              {codes.map((code) => {
                const name = labels.ctorName(code);
                return (
                  <li key={code} className="sx-lab-core__ctor">
                    {ctorGlyph(code, group)}
                    <span>{name}</span>
                    {name !== code ? <code className="sx-code">{code}</code> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </Block>
      <Block title={t("sx.core.lab.icons")} lead={t("sx.core.lab.iconsLead")}>
        <ul className="sx-lab-core__icons" data-lab="icons">
          {ICONS.map(([name, icon]) => (
            <li key={name} className="sx-lab-core__icon">
              {glyph(icon, { size: 20 })}
              <code>{name.replace(/Icon$/, "")}</code>
            </li>
          ))}
        </ul>
      </Block>
    </>
  );
}

function LabelLab({ t, labels }: { t: Translate; labels: StudioLabels }) {
  const kv = labels.splitCodeLabel("K01 - Kategoriya");
  const rows: readonly (readonly [string, string])[] = [
    ["K12-PROMO - Marketplace reklama paketlari", labels.ctorName("K12-PROMO", "K12-PROMO - Marketplace reklama paketlari")],
    ["K99 - Webhook registry", labels.ctorName("K99", "K99 - Webhook registry")],
    ["K01 - Kategoriya", `${kv.name} · ${kv.code}`],
    ["REAL | K12-PROMO | Marketplace reklama paketlari", labels.splitCodeLabel("REAL | K12-PROMO | Marketplace reklama paketlari").name],
    ["call_center_lawyer · Call Center Lawyer", labels.role("call_center_lawyer", "Call Center Lawyer")],
    ["biznes-abonent-basic · Бизнес абонент — Basic", labels.plan("biznes-abonent-basic", "Бизнес абонент — Basic")],
    ["kind · choose_one", labels.option("choose_one", { field: "kind" })],
    ["placement · service_boost", labels.placement("service_boost")],
    ["changes_requested", labels.status("changes_requested")],
    ["399000 UZS", labels.money(399000, "UZS")],
    ["14", labels.days(14)],
    ["@code:minimum:1", labels.error("@code:minimum:1", { type: "number" })],
    ["Advokat, Yurist, Mijoz, Moderator", labels.list(["Advokat", "Yurist", "Mijoz", "Moderator"], 2)],
  ];
  return (
    <Block title={t("sx.core.lab.labels")}>
      <div className="sx-lab-core__scroll" tabIndex={0} role="region" aria-label={t("sx.core.lab.labels")}>
        <table className="sx-lab-core__table" data-lab="labels">
          <thead>
            <tr>
              <th scope="col">{t("sx.core.lab.fromServer")}</th>
              <th scope="col">{t("sx.core.lab.onScreen")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([from, shown]) => (
              <tr key={from}>
                <td>
                  <code className="sx-code">{from}</code>
                </td>
                <td>{shown}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

export function CoreLab() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  return (
    <div className="sx-lab-core">
      <RailLab t={t} labels={labels} />
      <PillLab t={t} />
      <ButtonLab t={t} />
      <IconLab t={t} labels={labels} />
      <LabelLab t={t} labels={labels} />
    </div>
  );
}
