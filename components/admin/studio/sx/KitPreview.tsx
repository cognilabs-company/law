"use client";

import "./sx-core.css";
import "./sx-form.css";
import "./sx-layout.css";
import "./sx-kit.css";
import { memo, useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import Menu, { type MenuEntry } from "@/components/ui/Menu";
import { aiId } from "@/lib/ai/ids";
import { matchesSearch } from "@/lib/searchText";
import { setThemePref } from "@/lib/theme";
import { notify } from "@/lib/toast";
import { SxButton, SxLinkButton, type SxButtonVariant } from "./Button";
import * as iconSet from "./icons";
import {
  ArchiveIcon,
  RotateCcwIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  BriefcaseBusinessIcon,
  CircleCheckIcon,
  CopyIcon,
  CrownIcon,
  EyeIcon,
  SaveIcon,
  GROUP_ICON,
  InfoIcon,
  SearchIcon,
  PackageIcon,
  SendIcon,
  PencilIcon,
  PLACEMENT_ICON,
  PlusIcon,
  LayoutGridIcon,
  CircleAlertIcon,
  XIcon,
  ctorGlyph,
  ctorIcon,
  glyph,
  moreGlyph,
} from "./icons";
import { StatusPill } from "./StatusPill";
import { StatusRail } from "./StatusRail";
import { sxStatus } from "./status";
import type { SxErrors, SxIcon, SxOption, SxRecordSource, SxRule } from "./types";
import { useStudioLabels } from "./useStudioLabels";
import { ChoiceCards, type ChoiceCard } from "./form/ChoiceCards";
import { DateField } from "./form/DateField";
import { Field, FormGrid } from "./form/Field";
import { useSxFormPolicy } from "./form/formPolicy";
import { KeyValue } from "./form/KeyValue";
import { MoneyInput } from "./form/MoneyInput";
import { NumberInput } from "./form/NumberInput";
import { Picker } from "./form/Picker";
import { Repeater } from "./form/Repeater";
import { Switch } from "./form/Switch";
import { TextArea, TextCount } from "./form/TextArea";
import { TextInput } from "./form/TextInput";
import { useReferenceOptions } from "./form/useReferenceOptions";
import { SxDrawer } from "./layout/Drawer";
import { SxEmpty } from "./layout/Empty";
import { SxGuide, SxGuideButton } from "./layout/Guide";
import { SxNote } from "./layout/Note";
import { SxOutline, type SxOutlineItem } from "./layout/Outline";
import { SxPage } from "./layout/Page";
import { SxPanel, SxSectionHeader } from "./layout/Panel";
import { SxStatStrip, type SxStat } from "./layout/StatStrip";
import { SxPager, SxTable, type SxColumn, type SxRowAction } from "./layout/Table";
import { SxToolbar } from "./layout/Toolbar";

const AI = "admin.studio.kit";
const PROMO = "K12-PROMO";
const PACKAGE = "K03-M";
const PAGE_SIZE = 6;
const LOAD_MS = 800;
const FAIL_MS = 700;
const BADGE_MAX = 40;
const PHONE_QUERY = "(max-width: 640px)";

const FLOW = ["draft", "submitted", "in_review", "approved", "published"] as const;
const PICKS = ["draft", "submitted", "in_review", "approved", "published", "changes_requested", "rejected", "archived"] as const;
const PLACEMENTS = ["banner", "profile_boost", "service_boost"] as const;
const PLACEMENT_RULE: Readonly<Record<string, string>> = {
  banner: "sx.placementRule.bannerAsset",
  profile_boost: "sx.placementRule.none",
  service_boost: "sx.placementRule.service",
};
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
  { status: "expired", source: "runtime" },
  { status: "deleted", source: "runtime" },
  { status: "failed" },
];
const CTOR_GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ["services_packages", ["K01", "K34", "K31", "K32", "K33", "K02", "K29", "K03-M", "K30"]],
  ["finance_tariffs", ["K17", "K04", "K18", "K25"]],
  ["advertising", ["MP04", "K12-PROMO", "MP09"]],
];
const ALL_GROUPS: readonly (readonly [string, readonly string[]])[] = [
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
const PLAN_SLUGS = ["lexgo-ai-lite", "lexgo-ai-pro", "biznes-abonent-basic", "shaxsiy-advokat-standard"] as const;
const TABLE_VIEWS = ["data", "loading", "empty", "error"] as const;
const TABLE_VIEW_KEY: Readonly<Record<TableView, string>> = {
  data: "sx.layout.lab.stateData",
  loading: "sx.layout.lab.stateLoading",
  empty: "sx.layout.lab.stateEmpty",
  error: "sx.layout.lab.stateError",
};
const GUIDES = [PROMO, PACKAGE] as const;

type View = "page" | "record";
type Theme = "light" | "dark";
type KitState = "empty" | "filled" | "focus" | "error" | "disabled" | "readOnly";
type TableView = (typeof TABLE_VIEWS)[number];

const STATES: readonly KitState[] = ["empty", "filled", "focus", "error", "disabled", "readOnly"];
const STATE_KEY: Readonly<Record<KitState, string>> = {
  empty: "sx.kit.state.empty",
  filled: "sx.kit.state.filled",
  focus: "sx.kit.state.focus",
  error: "sx.kit.state.error",
  disabled: "sx.kit.state.disabled",
  readOnly: "sx.form.readOnly",
};

type Pkg = { id: string; code: string; title: string; placement: string; days: number; price: number; status: string; updated: string };

const PACKAGES: readonly Pkg[] = [
  { id: "p01", code: "banner-main-7", title: "Bosh banner · 7 kun", placement: "banner", days: 7, price: 1500000, status: "published", updated: "2026-10-16T10:20:00+05:00" },
  { id: "p02", code: "banner-main-30", title: "Bosh banner · 30 kun", placement: "banner", days: 30, price: 5000000, status: "approved", updated: "2026-10-15T16:05:00+05:00" },
  { id: "p03", code: "banner-category-14", title: "Kategoriya banneri · 14 kun", placement: "banner", days: 14, price: 900000, status: "in_review", updated: "2026-10-14T11:40:00+05:00" },
  { id: "p04", code: "banner-holiday-3", title: "Bayram banneri · 3 kun", placement: "banner", days: 3, price: 600000, status: "archived", updated: "2026-09-02T09:00:00+05:00" },
  { id: "p05", code: "profile-starter-7", title: "Profil reklamasi · 7 kun", placement: "profile_boost", days: 7, price: 150000, status: "published", updated: "2026-10-12T13:30:00+05:00" },
  { id: "p06", code: "profile-pro-14", title: "Profil reklamasi · 14 kun", placement: "profile_boost", days: 14, price: 270000, status: "submitted", updated: "2026-10-16T08:45:00+05:00" },
  { id: "p07", code: "profile-premium-30", title: "Profil reklamasi Premium · 30 kun", placement: "profile_boost", days: 30, price: 650000, status: "changes_requested", updated: "2026-10-13T17:10:00+05:00" },
  { id: "p08", code: "profile-trial-3", title: "Profil sinovi · 3 kun", placement: "profile_boost", days: 3, price: 50000, status: "draft", updated: "2026-10-17T09:15:00+05:00" },
  { id: "p09", code: "service-top-7", title: "Xizmat reklamasi · 7 kun", placement: "service_boost", days: 7, price: 120000, status: "published", updated: "2026-10-10T12:00:00+05:00" },
  { id: "p10", code: "service-top-14", title: "Xizmat reklamasi · 14 kun", placement: "service_boost", days: 14, price: 220000, status: "approved", updated: "2026-10-11T15:25:00+05:00" },
  { id: "p11", code: "service-top-30", title: "Xizmat reklamasi · 30 kun", placement: "service_boost", days: 30, price: 400000, status: "draft", updated: "2026-10-09T10:00:00+05:00" },
  { id: "p12", code: "service-new-7", title: "Yangi xizmatlar uchun · 7 kun", placement: "service_boost", days: 7, price: 99000, status: "rejected", updated: "2026-10-08T14:50:00+05:00" },
];

type Service = { id: string; name: string; category: string; price: number };

const SERVICES: readonly Service[] = [
  { id: "srv-01", name: "Ajrashish bo'yicha maslahat", category: "Oila huquqi", price: 300000 },
  { id: "srv-02", name: "Da'vo arizasini tayyorlash", category: "Fuqarolik ishlari", price: 450000 },
  { id: "srv-03", name: "Mehnat shartnomasini tekshirish", category: "Mehnat huquqi", price: 250000 },
  { id: "srv-04", name: "Meros hujjatlarini rasmiylashtirish", category: "Meros", price: 600000 },
  { id: "srv-05", name: "MChJni ro'yxatdan o'tkazish", category: "Biznes", price: 1200000 },
  { id: "srv-06", name: "Ijara shartnomasini tuzish", category: "Ko'chmas mulk", price: 350000 },
  { id: "srv-07", name: "Sudda vakillik", category: "Sud ishlari", price: 2500000 },
  { id: "srv-08", name: "Aliment undirish", category: "Oila huquqi", price: 400000 },
  { id: "srv-09", name: "Soliq bo'yicha maslahat", category: "Soliq", price: 300000 },
  { id: "srv-10", name: "Iste'molchi huquqlarini himoya qilish", category: "Iste'molchi huquqi", price: 280000 },
  { id: "srv-11", name: "Kredit bo'yicha nizo", category: "Bank va moliya", price: 500000 },
  { id: "srv-12", name: "Yer uchastkasi hujjatlari", category: "Ko'chmas mulk", price: 700000 },
];

type Tier = { tier: string; title: string; price: number | undefined; included: string[] };

function seedTiers(): Tier[] {
  return [
    { tier: "BASIC", title: "Maslahat", price: 300000, included: ["Huquqiy maslahat", "Hujjatlarni ko'rib chiqish"] },
    { tier: "STANDARD", title: "Maslahat va hujjatlar", price: 900000, included: ["Da'vo arizasini tayyorlash", "Sudgacha muzokara"] },
    { tier: "PREMIUM", title: "", price: 2500000, included: ["Sudda vakillik"] },
  ];
}

const SETTINGS_SEED: Readonly<Record<string, unknown>> = {
  enabled: true,
  timeout: 10,
  provider: "Eskiz",
  sender_name: "LexGo",
  retry_policy: { attempts: 3, backoff: "exponential" },
};
const KNOWN_SETTINGS: ReadonlySet<string> = new Set(["enabled", "timeout", "provider"]);

const DAYS_RULE: SxRule = { type: "number", key: "days", ctor: PROMO, min: 1, max: 90 };
const BADGE_RULE: SxRule = { type: "textarea", key: "label", ctor: PROMO, max: BADGE_MAX };
const SAMPLE_DAYS: Readonly<Record<KitState, number | undefined>> = { empty: undefined, filled: 7, focus: 14, error: 120, disabled: 7, readOnly: 7 };
const SAMPLE_PRICE: Readonly<Record<KitState, number | undefined>> = { empty: undefined, filled: 150000, focus: 1250000, error: undefined, disabled: 150000, readOnly: 150000 };
const SAMPLE_BADGE: Readonly<Record<KitState, string>> = {
  empty: "",
  filled: "Tavsiya etiladi",
  focus: "Eng ko'p tanlanadi",
  error: "Eng ko'p tanlanadigan va ishonchli reklama paketi",
  disabled: "Tavsiya etiladi",
  readOnly: "Tavsiya etiladi",
};
const SAMPLE_PLACE: Readonly<Record<KitState, string>> = { empty: "", filled: "profile_boost", focus: "banner", error: "", disabled: "service_boost", readOnly: "banner" };
const SAMPLE_DATE: Readonly<Record<KitState, string>> = { empty: "", filled: "2026-10-20", focus: "2026-11-01", error: "", disabled: "2026-10-20", readOnly: "2026-10-20" };
const SAMPLE_SWITCH: Readonly<Record<KitState, boolean>> = { empty: false, filled: true, focus: true, error: false, disabled: false, readOnly: true };

function watchTheme(onChange: () => void): () => void {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return () => {};
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

const themeNow = (): Theme => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
const themeOnServer = (): Theme => "light";

function watchPhone(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const phoneNow = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
const phoneOnServer = (): boolean => false;

function later<T>(make: () => T, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    if (signal.aborted) {
      abort();
      return;
    }
    let timer = 0;
    const onAbort = () => {
      window.clearTimeout(timer);
      abort();
    };
    timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      try {
        resolve(make());
      } catch (e) {
        reject(e);
      }
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function nextStatus(status: string): string {
  const info = sxStatus(status);
  if (info.key === "returned") return "submitted";
  if (info.key === "rejected" || info.stage < 0) return "draft";
  return FLOW[Math.min(FLOW.length - 1, info.stage + 1)];
}

function useKitId(): string {
  return `kit-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function useBusyPulse(ms = 900): [boolean, () => void] {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const id = window.setTimeout(() => setBusy(false), ms);
    return () => window.clearTimeout(id);
  }, [busy, ms]);
  return [busy, () => setBusy(true)];
}

function Seg<T extends string>({ label, value, options, onChange, ai }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; ai: string }) {
  return (
    <div className="sx-kit-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <SxButton key={o.value} variant="ghost" size="sm" aria-pressed={value === o.value} onClick={() => onChange(o.value)} aiId={aiId(ai, o.value.toLowerCase())}>
          {o.label}
        </SxButton>
      ))}
    </div>
  );
}

function Cap({ state }: { state: KitState }) {
  const t = useTranslations("studio");
  return <span className="sx-kit-cap">{t(STATE_KEY[state])}</span>;
}

function Kind({ title, children }: { title: string; children: ReactNode }) {
  const id = useKitId();
  return (
    <section className="sx-kit-kind" aria-labelledby={id}>
      <SxSectionHeader as="h3" id={id} title={title} />
      <div className="sx-kit-states">
        <div className="sx-kit-states__in">{children}</div>
      </div>
    </section>
  );
}

function placementOptions(labels: ReturnType<typeof useStudioLabels>): SxOption[] {
  return PLACEMENTS.map((key) => ({ value: key, label: labels.placement(key), description: labels.placementWhat(key), icon: PLACEMENT_ICON[key] }));
}

function RailPanel({ status, onStatus, celebrate }: { status: string; onStatus: (s: string) => void; celebrate: boolean }) {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const [direct, setDirect] = useState<"draft" | "published">("draft");
  const next = nextStatus(status);
  const atEnd = next === status;
  return (
    <SxPanel id="kit-rail" title={t("sx.kit.rail")} lead={t("sx.kit.railLead")} aiId={aiId(AI, "rail")}>
      <div className="sx-kit-block">
        <div className="sx-kit-row">
          <Seg label={t("sx.kit.step")} value={status} options={PICKS.map((s) => ({ value: s as string, label: labels.status(s) }))} onChange={onStatus} ai={aiId(AI, "status")} />
          <SxButton
            variant="primary"
            size="sm"
            iconEnd={ArrowRightIcon}
            aria-disabled={atEnd || undefined}
            onClick={() => {
              if (!atEnd) onStatus(next);
            }}
            aiId={aiId(AI, "status", "next")}
          >
            {t("sx.kit.next")}
          </SxButton>
          <SxButton variant="ghost" size="sm" icon={RotateCcwIcon} onClick={() => onStatus("draft")} aiId={aiId(AI, "status", "restart")}>
            {t("sx.kit.restart")}
          </SxButton>
        </div>
        <StatusRail status={status} note={labels.statusHint(status)} celebrateOnPublish={celebrate} id="sx-kit-rail" />
        <div className="sx-kit-row">
          <span className="sx-kit-cap">{t("sx.kit.compact")}</span>
          <StatusRail status={status} variant="compact" celebrateOnPublish={false} />
        </div>
      </div>
      <SxSectionHeader as="h3" title={t("sx.kit.direct")} />
      <div className="sx-kit-block">
        <div className="sx-kit-row">
          <Seg
            label={t("sx.kit.direct")}
            value={direct}
            options={[
              { value: "draft", label: labels.status("draft") },
              { value: "published", label: labels.status("published") },
            ]}
            onChange={setDirect}
            ai={aiId(AI, "direct")}
          />
        </div>
        <StatusRail status={direct} direct celebrateOnPublish={celebrate} />
      </div>
      <SxSectionHeader as="h3" title={t("sx.kit.every")} />
      <div className="sx-kit-gallery">
        <ul className="sx-kit-gallery__in">
          {PICKS.map((s) => (
            <li key={s}>
              <StatusRail status={s} celebrateOnPublish={false} />
            </li>
          ))}
        </ul>
      </div>
    </SxPanel>
  );
}

function PillsPanel() {
  const t = useTranslations("studio");
  return (
    <SxPanel id="kit-pills" title={t("sx.kit.pills")} aiId={aiId(AI, "pills")}>
      <div className="sx-kit-block">
        <ul className="sx-kit-pills">
          {PILLS.map((p) => (
            <li key={`${p.status}-${p.source ?? "studio"}`}>
              <StatusPill status={p.status} source={p.source} />
            </li>
          ))}
        </ul>
        <ul className="sx-kit-pills">
          {PILLS.map((p) => (
            <li key={`${p.status}-${p.source ?? "studio"}`}>
              <StatusPill status={p.status} source={p.source} size="sm" />
            </li>
          ))}
        </ul>
      </div>
    </SxPanel>
  );
}

function ButtonsPanel() {
  const t = useTranslations("studio");
  const [busy, pulse] = useBusyPulse(1400);
  const rows: readonly { variant: SxButtonVariant; icon: SxIcon; text: string }[] = [
    { variant: "primary", icon: SendIcon, text: t("sx.kit.send") },
    { variant: "secondary", icon: SaveIcon, text: t("sx.ui.save") },
    { variant: "ghost", icon: XIcon, text: t("sx.ui.cancel") },
    { variant: "danger", icon: ArchiveIcon, text: t("sx.ui.archive") },
  ];
  const more: MenuEntry[] = [
    { key: "view", label: t("sx.ui.view"), icon: glyph(EyeIcon, { size: 16 }), aiId: aiId(AI, "btn", "menu", "view") },
    { key: "clone", label: t("sx.ui.clone"), icon: glyph(CopyIcon, { size: 16 }), aiId: aiId(AI, "btn", "menu", "clone") },
    { kind: "separator", key: "sep" },
    { key: "archive", label: t("sx.ui.archive"), icon: glyph(ArchiveIcon, { size: 16 }), danger: true, disabled: t("sx.kit.noWrites"), aiId: aiId(AI, "btn", "menu", "archive") },
  ];
  return (
    <SxPanel id="kit-buttons" title={t("sx.kit.buttons")} aiId={aiId(AI, "buttons")}>
      <div className="sx-kit-btns">
        {rows.map((r) => (
          <div key={r.variant} className="sx-kit-row">
            <SxButton variant={r.variant} icon={r.icon} busy={busy} onClick={pulse} aiId={aiId(AI, "btn", r.variant, "md")}>
              {r.text}
            </SxButton>
            <SxButton variant={r.variant} icon={r.icon} disabled aiId={aiId(AI, "btn", r.variant, "off")}>
              {r.text}
            </SxButton>
            <SxButton variant={r.variant} icon={r.icon} busy aiId={aiId(AI, "btn", r.variant, "busy")}>
              {r.text}
            </SxButton>
            <SxButton variant={r.variant} size="sm" icon={r.icon} onClick={pulse} aiId={aiId(AI, "btn", r.variant, "sm")}>
              {r.text}
            </SxButton>
          </div>
        ))}
        <div className="sx-kit-row">
          <SxLinkButton size="sm" icon={ExternalLinkIcon} href={`/admin/studio/c/${PROMO}`} aiId={aiId(AI, "btn", "link")}>
            {t("sx.ui.open")}
          </SxLinkButton>
          <IconButton className="sx-ibtn" label={t("sx.ui.edit")} icon={glyph(PencilIcon)} aiId={aiId(AI, "btn", "icon", "edit")} />
          <IconButton className="sx-ibtn" label={t("sx.ui.clone")} icon={glyph(CopyIcon)} aiId={aiId(AI, "btn", "icon", "clone")} />
          <IconButton className="sx-ibtn" variant="danger" label={t("sx.ui.archive")} icon={glyph(ArchiveIcon)} aiId={aiId(AI, "btn", "icon", "archive")} />
          <IconButton className="sx-ibtn" size="sm" label={t("sx.ui.edit")} icon={glyph(PencilIcon)} aiId={aiId(AI, "btn", "icon", "edit-sm")} />
          <Menu label={t("sx.ui.more")} className="sx-pop sx-menu" triggerClassName="sx-ibtn" icon={moreGlyph()} items={more} aiId={aiId(AI, "btn", "menu")} />
        </div>
      </div>
    </SxPanel>
  );
}

function TextCell({ state, label, ph, sample }: { state: KitState; label: string; ph: string; sample: string }) {
  const labels = useStudioLabels();
  const id = useKitId();
  const [value, setValue] = useState(state === "empty" || state === "error" ? "" : sample);
  return (
    <div className="sx-kit-cell" data-kit-state={state}>
      <Field id={id} label={label} required error={state === "error" ? labels.error("@required", { type: "text" }) : ""} labelAside={<Cap state={state} />}>
        {(a) => (
          <TextInput
            {...a}
            value={value}
            onChange={setValue}
            placeholder={ph}
            disabled={state === "disabled"}
            readOnly={state === "readOnly"}
            aiId={aiId(AI, "text", state.toLowerCase())}
            aiLabel={label}
          />
        )}
      </Field>
    </div>
  );
}

function AreaCell({ state, label, help, ph }: { state: KitState; label: string; help: string; ph: string }) {
  const labels = useStudioLabels();
  const id = useKitId();
  const countId = `${id}-count`;
  const [value, setValue] = useState(SAMPLE_BADGE[state]);
  return (
    <div className="sx-kit-cell" data-kit-state={state}>
      <Field
        id={id}
        label={label}
        help={help}
        error={state === "error" ? labels.error("@max", BADGE_RULE) : ""}
        labelAside={
          <span className="sx-kit-aside">
            <Cap state={state} />
            <TextCount value={value} max={BADGE_MAX} id={countId} />
          </span>
        }
      >
        {(a) => (
          <TextArea
            {...a}
            aria-describedby={[a["aria-describedby"], countId].filter(Boolean).join(" ")}
            value={value}
            onChange={setValue}
            maxLength={BADGE_MAX}
            minRows={2}
            maxRows={4}
            placeholder={ph}
            disabled={state === "disabled"}
            readOnly={state === "readOnly"}
            aiId={aiId(AI, "area", state.toLowerCase())}
            aiLabel={label}
          />
        )}
      </Field>
    </div>
  );
}

function NumberCell({ state, label, hint }: { state: KitState; label: string; hint: string }) {
  const labels = useStudioLabels();
  const id = useKitId();
  const [value, setValue] = useState<number | undefined>(SAMPLE_DAYS[state]);
  const [bad, setBad] = useState(false);
  const shownError = bad ? labels.error("@number", DAYS_RULE) : state === "error" ? labels.error("@max", DAYS_RULE) : "";
  return (
    <div className="sx-kit-cell" data-kit-state={state}>
      <Field id={id} label={label} hint={hint} required error={shownError} labelAside={<Cap state={state} />}>
        {(a) => (
          <NumberInput
            {...a}
            value={value}
            onChange={setValue}
            onDraftInvalid={setBad}
            min={1}
            max={90}
            disabled={state === "disabled"}
            readOnly={state === "readOnly"}
            aiId={aiId(AI, "number", state.toLowerCase())}
            aiLabel={label}
          />
        )}
      </Field>
    </div>
  );
}

function MoneyCell({ state, label }: { state: KitState; label: string }) {
  const labels = useStudioLabels();
  const id = useKitId();
  const [value, setValue] = useState<number | undefined>(SAMPLE_PRICE[state]);
  return (
    <div className="sx-kit-cell" data-kit-state={state}>
      <Field id={id} label={label} required error={state === "error" ? labels.error("@required", { type: "money" }) : ""} labelAside={<Cap state={state} />}>
        {(a) => (
          <MoneyInput
            {...a}
            value={value}
            onChange={setValue}
            disabled={state === "disabled"}
            readOnly={state === "readOnly"}
            aiId={aiId(AI, "money", state.toLowerCase())}
            aiLabel={label}
          />
        )}
      </Field>
    </div>
  );
}

function PickerCell({ state, label, options }: { state: KitState; label: string; options: readonly SxOption[] }) {
  const labels = useStudioLabels();
  const id = useKitId();
  const [value, setValue] = useState(SAMPLE_PLACE[state]);
  return (
    <div className="sx-kit-cell" data-kit-state={state}>
      <Field id={id} label={label} required error={state === "error" ? labels.error("@required", { type: "select" }) : ""} labelAside={<Cap state={state} />}>
        {(a) => (
          <Picker
            {...a}
            label={label}
            options={options}
            value={value}
            onChange={setValue}
            disabled={state === "disabled"}
            readOnly={state === "readOnly"}
            aiId={aiId(AI, "picker", state.toLowerCase())}
          />
        )}
      </Field>
    </div>
  );
}

function DateCell({ state, label }: { state: KitState; label: string }) {
  const labels = useStudioLabels();
  const id = useKitId();
  const [value, setValue] = useState(SAMPLE_DATE[state]);
  return (
    <div className="sx-kit-cell" data-kit-state={state}>
      <Field id={id} label={label} required error={state === "error" ? labels.error("@required", { type: "date" }) : ""} labelAside={<Cap state={state} />}>
        {(a) => (
          <DateField
            {...a}
            label={label}
            value={value}
            onChange={(v) => setValue(v ?? "")}
            disabled={state === "disabled"}
            readOnly={state === "readOnly"}
            aiId={aiId(AI, "date", state.toLowerCase())}
          />
        )}
      </Field>
    </div>
  );
}

function SwitchCell({ state, label }: { state: KitState; label: string }) {
  const t = useTranslations("studio");
  const id = useKitId();
  const [on, setOn] = useState(SAMPLE_SWITCH[state]);
  return (
    <div className="sx-kit-cell" data-kit-state={state}>
      <Field id={id} layout="inline" label={label} error={state === "error" ? t("sx.err.invalid") : ""} labelAside={<Cap state={state} />}>
        {(a) => (
          <Switch
            {...a}
            checked={on}
            onChange={setOn}
            disabled={state === "disabled"}
            readOnly={state === "readOnly"}
            aiId={aiId(AI, "switch", state.toLowerCase())}
            aiLabel={label}
          />
        )}
      </Field>
    </div>
  );
}

function ControlsPanel() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const viewId = useKitId();
  const scope = { ctor: PROMO };
  const badge = { ctor: PROMO, path: "preview.label" };
  const title = labels.field("title", scope);
  const place = labels.field("placement", scope);
  const days = labels.field("days", scope);
  const price = labels.field("price", scope);
  const badgeLabel = labels.field("label", badge);
  const needs = labels.field("requires_service", scope);
  const options = placementOptions(labels);
  const sample = labels.promoPackage("profile-starter-7");
  return (
    <SxPanel id="kit-controls" title={t("sx.kit.controls")} aiId={aiId(AI, "controls")}>
      <Kind title={t("sx.kit.kind.text")}>
        {STATES.map((s) => (
          <TextCell key={s} state={s} label={title} ph={labels.placeholder("title", scope)} sample={sample} />
        ))}
      </Kind>
      <Kind title={t("sx.kit.kind.textarea")}>
        {STATES.map((s) => (
          <AreaCell key={s} state={s} label={badgeLabel} help={labels.help("label", badge)} ph={labels.placeholder("label", badge)} />
        ))}
      </Kind>
      <Kind title={t("sx.kit.kind.number")}>
        {STATES.map((s) => (
          <NumberCell key={s} state={s} label={days} hint={labels.hint(DAYS_RULE)} />
        ))}
      </Kind>
      <Kind title={t("sx.kit.kind.money")}>
        {STATES.map((s) => (
          <MoneyCell key={s} state={s} label={price} />
        ))}
      </Kind>
      <Kind title={t("sx.kit.kind.picker")}>
        {STATES.map((s) => (
          <PickerCell key={s} state={s} label={place} options={options} />
        ))}
      </Kind>
      <Kind title={t("sx.kit.kind.date")}>
        {STATES.map((s) => (
          <DateCell key={s} state={s} label={labels.field("effective_from")} />
        ))}
      </Kind>
      <Kind title={t("sx.kit.kind.switch")}>
        {STATES.map((s) => (
          <SwitchCell key={s} state={s} label={needs} />
        ))}
      </Kind>
      <section className="sx-kit-kind" aria-labelledby={viewId}>
        <SxSectionHeader as="h3" id={viewId} title={t("sx.kit.kind.view")} />
        <FormGrid>
          <Field id={`${viewId}-title`} span={1} label={title} readOnly value={sample} />
          <Field id={`${viewId}-place`} span={1} label={place} readOnly value={labels.placement("profile_boost")} />
          <Field id={`${viewId}-days`} span={1} label={days} readOnly value={labels.days(7)} />
          <Field id={`${viewId}-price`} span={1} label={price} readOnly value={<span className="sx-num">{labels.money(150000)}</span>} />
          <Field id={`${viewId}-badge`} span={1} label={badgeLabel} readOnly value="" />
          <Field id={`${viewId}-needs`} span={1} label={needs} readOnly value={labels.display(false)} />
        </FormGrid>
      </section>
    </SxPanel>
  );
}

function PickersPanel() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useKitId();
  const liveRoles = useReferenceOptions("roles");
  const liveMissing = useReferenceOptions("sx-kit-missing");
  const [ctor, setCtor] = useState<string>(PROMO);
  const [roles, setRoles] = useState<string[]>(["advokat", "yurist"]);
  const [service, setService] = useState("srv-02");
  const [category, setCategory] = useState("");
  const [missing, setMissing] = useState("");
  const [startsAt, setStartsAt] = useState("2026-10-20T09:00:00+05:00");
  const ctorLabel = labels.field("constructor_code");
  const rolesLabel = labels.field("roles");
  const serviceLabel = labels.field("service_id", { ctor: "K29" });
  const categoryLabel = labels.field("category_id");
  const plansLabel = labels.field("plans");
  const startsLabel = labels.field("starts_at");
  const ctorOptions: SxOption[] = CTOR_GROUPS.flatMap(([group, codes]) =>
    codes.map((code) => ({ value: code, label: labels.ctorName(code), code, icon: ctorIcon(code, group), group: labels.groupName(group) })),
  );
  const planOptions: SxOption[] = PLAN_SLUGS.map((slug) => ({ value: slug, label: labels.plan(slug), icon: CrownIcon }));
  const loaders = useMemo(() => {
    const toOption = (s: Service): SxOption => ({ value: s.id, label: s.name, description: `${s.category} · ${labels.money(s.price)}`, icon: BriefcaseBusinessIcon });
    return {
      load: (query: string, signal: AbortSignal) => later(() => SERVICES.filter((s) => matchesSearch(`${s.name} ${s.category}`, query)).map(toOption), LOAD_MS, signal),
      resolve: (values: readonly string[], signal: AbortSignal) => later(() => SERVICES.filter((s) => values.includes(s.id)).map(toOption), 120, signal),
      fail: (query: string, signal: AbortSignal) =>
        later<SxOption[]>(() => {
          throw new Error(`offline ${query}`);
        }, FAIL_MS, signal),
    };
  }, [labels]);
  const aside = (key: string) => <span className="sx-kit-cap">{t(key)}</span>;
  return (
    <SxPanel id="kit-pickers" title={t("sx.kit.pickers")} aiId={aiId(AI, "pickers")}>
      <FormGrid>
        <Field id={`${uid}-ctor`} span={1} label={ctorLabel} labelAside={aside("sx.kit.pick.single")}>
          {(a) => <Picker {...a} label={ctorLabel} options={ctorOptions} value={ctor} onChange={setCtor} aiId={aiId(AI, "pick", "single")} />}
        </Field>
        <Field id={`${uid}-roles`} span={1} label={rolesLabel} labelAside={aside("sx.kit.pick.live")}>
          {(a) => (
            <Picker
              {...a}
              multiple
              max={4}
              label={rolesLabel}
              loadOptions={liveRoles.loadOptions}
              resolveOptions={liveRoles.resolveOptions}
              leadingIcon={liveRoles.leadingIcon}
              value={roles}
              onChange={setRoles}
              aiId={aiId(AI, "pick", "multi")}
            />
          )}
        </Field>
        <Field id={`${uid}-service`} span={1} label={serviceLabel} labelAside={aside("sx.kit.pick.async")}>
          {(a) => (
            <Picker
              {...a}
              label={serviceLabel}
              loadOptions={loaders.load}
              resolveOptions={loaders.resolve}
              leadingIcon={BriefcaseBusinessIcon}
              value={service}
              onChange={setService}
              aiId={aiId(AI, "pick", "async")}
            />
          )}
        </Field>
        <Field id={`${uid}-category`} span={1} label={categoryLabel} labelAside={aside("sx.kit.pick.fail")}>
          {(a) => <Picker {...a} label={categoryLabel} loadOptions={loaders.fail} value={category} onChange={setCategory} aiId={aiId(AI, "pick", "fail")} />}
        </Field>
        <Field id={`${uid}-missing`} span={1} label={t("sx.form.lab.broken")} labelAside={aside("sx.kit.pick.live")}>
          {(a) => (
            <Picker
              {...a}
              label={t("sx.form.lab.broken")}
              loadOptions={liveMissing.loadOptions}
              resolveOptions={liveMissing.resolveOptions}
              leadingIcon={liveMissing.leadingIcon}
              value={missing}
              onChange={setMissing}
              aiId={aiId(AI, "pick", "missing")}
            />
          )}
        </Field>
        <Field id={`${uid}-starts`} span={1} label={startsLabel}>
          {(a) => <DateField {...a} withTime label={startsLabel} value={startsAt} onChange={(v) => setStartsAt(v ?? "")} aiId={aiId(AI, "pick", "starts")} />}
        </Field>
        <Field id={`${uid}-plans`} span={1} label={plansLabel} labelAside={aside("sx.form.readOnly")}>
          {(a) => <Picker {...a} multiple readOnly label={plansLabel} options={planOptions} value={PLAN_SLUGS} onChange={() => undefined} />}
        </Field>
        <Field id={`${uid}-target`} span={1} label={labels.field("target_type", { ctor: "K29" })} labelAside={aside("sx.kit.state.disabled")}>
          {(a) => (
            <Picker
              {...a}
              disabled
              label={labels.field("target_type", { ctor: "K29" })}
              options={[{ value: "service", label: labels.option("service", { ctor: "K29", field: "target_type" }) }]}
              value="service"
              onChange={() => undefined}
            />
          )}
        </Field>
      </FormGrid>
    </SxPanel>
  );
}

function RowsPanel() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useKitId();
  const [tiers, setTiers] = useState<Tier[]>(seedTiers);
  const [settings, setSettings] = useState<Record<string, unknown>>(() => ({ ...SETTINGS_SEED }));
  const tierOptions: SxOption[] = ["BASIC", "STANDARD", "PREMIUM"].map((c) => ({ value: c, label: labels.tier(c) }));
  const tiersLabel = labels.field("tiers");
  const tierLabel = labels.field("tier");
  const nameOf = (key: string): string | null => {
    if (!KNOWN_SETTINGS.has(key)) return null;
    const name = labels.field(key);
    return name && name !== key ? name : null;
  };
  return (
    <SxPanel id="kit-rows" title={t("sx.kit.rows")} aiId={aiId(AI, "rows")}>
      <div className="sx-kit-block">
        <Field as="fieldset" id={`${uid}-tiers`} label={tiersLabel}>
          <Repeater<Tier>
            id={`${uid}-tiers-list`}
            label={tiersLabel}
            itemName={tierLabel}
            items={tiers}
            onChange={setTiers}
            maxItems={3}
            newItem={() => ({ tier: "", title: "", price: undefined, included: [] })}
            summary={(item) => [item.tier ? labels.tier(item.tier) : "", item.title].filter(Boolean).join(" · ")}
            meta={(item) => (item.price !== undefined ? labels.money(item.price) : null)}
            rowErrors={(i) => (tiers[i] && !tiers[i].title.trim() ? 1 : 0)}
            aiId={aiId(AI, "tiers")}
            renderItem={(item, index, set) => {
              const base = `${uid}-t${index}`;
              const path = `tiers.${index}`;
              const titleLabel = labels.field("title", { ctor: PACKAGE, path: `${path}.title` });
              const priceLabel = labels.field("price", { ctor: PACKAGE, path: `${path}.price` });
              const incLabel = labels.field("included", { ctor: PACKAGE, path: `${path}.included` });
              return (
                <FormGrid>
                  <Field id={`${base}-tier`} span={1} label={tierLabel}>
                    {(a) => <Picker {...a} label={tierLabel} options={tierOptions} value={item.tier} onChange={(v) => set({ ...item, tier: v })} />}
                  </Field>
                  <Field id={`${base}-price`} span={1} label={priceLabel}>
                    {(a) => <MoneyInput {...a} value={item.price} onChange={(v) => set({ ...item, price: v })} aiLabel={priceLabel} />}
                  </Field>
                  <Field id={`${base}-title`} label={titleLabel} required error={item.title.trim() ? "" : labels.error("@required", { type: "text" })}>
                    {(a) => (
                      <TextInput
                        {...a}
                        value={item.title}
                        onChange={(v) => set({ ...item, title: v })}
                        placeholder={labels.placeholder("title", { ctor: PACKAGE, path: `${path}.title` })}
                      />
                    )}
                  </Field>
                  <Field as="fieldset" id={`${base}-inc`} label={incLabel}>
                    <Repeater<string>
                      inline
                      defaultExpanded="all"
                      id={`${base}-inc-list`}
                      label={incLabel}
                      itemName={incLabel}
                      addLabel={t("sx.rep.add")}
                      items={item.included}
                      onChange={(next) => set({ ...item, included: next })}
                      newItem={() => ""}
                      summary={(v) => v}
                      renderItem={(v, i, setItem) => (
                        <TextInput
                          size="sm"
                          value={v}
                          onChange={setItem}
                          aria-label={`${incLabel} ${i + 1}`}
                          placeholder={labels.placeholder("value", { ctor: PACKAGE, path: `${path}.included.${i}.value` })}
                        />
                      )}
                    />
                  </Field>
                </FormGrid>
              );
            }}
          />
        </Field>
        <Field as="fieldset" id={`${uid}-kv`} label={labels.field("settings")}>
          <KeyValue id={`${uid}-kv-list`} label={labels.field("settings")} value={settings} onChange={setSettings} nameOf={nameOf} aiId={aiId(AI, "settings")} />
        </Field>
      </div>
    </SxPanel>
  );
}

function CardsPanel() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useKitId();
  const [placement, setPlacement] = useState("profile_boost");
  const cards: ChoiceCard[] = PLACEMENTS.map((key) => ({
    value: key,
    title: labels.placement(key),
    description: labels.placementWhat(key),
    icon: PLACEMENT_ICON[key],
    meta: t(PLACEMENT_RULE[key]),
  }));
  const label = labels.field("placement", { ctor: PROMO });
  return (
    <SxPanel id="kit-cards" title={t("sx.kit.cards")} aiId={aiId(AI, "cards")}>
      <div className="sx-kit-block">
        <Field as="fieldset" id={`${uid}-place`} label={label} required>
          {(a) => <ChoiceCards {...a} value={placement} onChange={setPlacement} options={cards} aiId={aiId(AI, "placement")} />}
        </Field>
        <Field as="fieldset" id={`${uid}-place-ro`} label={label} labelAside={<span className="sx-kit-cap">{t("sx.form.readOnly")}</span>}>
          {(a) => <ChoiceCards {...a} readOnly value="banner" onChange={() => undefined} options={cards} />}
        </Field>
      </div>
    </SxPanel>
  );
}

type PkgRow = Pkg & { name: string };

function PackagesPanel() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState("");
  const [view, setView] = useState<TableView>("data");
  const [busy, pulse] = useBusyPulse();
  const noWrites = t("sx.kit.noWrites");
  const field = (key: string) => labels.field(key, { ctor: PROMO });
  const all: PkgRow[] = PACKAGES.map((p) => ({ ...p, name: labels.promoPackage(p.code, p.title) }));
  const filtered = all.filter((r) => (!place || r.placement === place) && matchesSearch(`${r.name} ${r.code}`, query));
  const total = view === "data" ? filtered.length : 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const current = Math.min(page, lastPage);
  const rows = view === "data" ? filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE) : [];
  const opened = all.find((r) => r.id === openId) ?? null;
  const reset = () => {
    setQuery("");
    setPlace("");
    setPage(0);
  };
  const columns: SxColumn<PkgRow>[] = [
    { key: "name", header: field("title"), primary: true, cell: (r) => r.name, sortValue: (r) => r.name },
    { key: "days", header: field("days"), numeric: true, width: "120px", cell: (r) => labels.days(r.days), sortValue: (r) => r.days },
    { key: "price", header: field("price"), numeric: true, width: "160px", cell: (r) => labels.money(r.price), sortValue: (r) => r.price },
    {
      key: "status",
      header: labels.field("status"),
      width: "200px",
      cell: (r) => <StatusRail variant="compact" status={r.status} celebrateOnPublish={false} />,
      sortValue: (r) => sxStatus(r.status).stage,
    },
    { key: "updated", header: t("sx.layout.updated"), width: "150px", hideBelow: "lg", cell: (r) => labels.date(r.updated), sortValue: (r) => r.updated },
  ];
  const actions: SxRowAction<PkgRow>[] = [
    { key: "view", label: t("sx.ui.view"), icon: EyeIcon, onSelect: (r) => setOpenId(r.id) },
    { key: "clone", label: t("sx.ui.clone"), icon: CopyIcon, disabled: () => noWrites },
    { key: "archive", label: t("sx.ui.archive"), icon: ArchiveIcon, danger: true, disabled: () => noWrites, hidden: (r) => r.status === "archived" },
  ];
  return (
    <SxPanel
      id="kit-table"
      flush
      title={labels.ctorName(PROMO)}
      actions={
        <Seg
          label={t("sx.layout.lab.state")}
          value={view}
          options={TABLE_VIEWS.map((v) => ({ value: v, label: t(TABLE_VIEW_KEY[v]) }))}
          onChange={(v) => {
            setView(v);
            setPage(0);
          }}
          ai={aiId(AI, "table", "state")}
        />
      }
      aiId={aiId(AI, "table")}
    >
      <div className="sx-kit-tablebar">
        <SxToolbar
          aiId={aiId(AI, "toolbar")}
          search={{
            value: query,
            onChange: (v) => {
              setQuery(v);
              setPage(0);
            },
            placeholder: t("sx.kit.searchPh"),
            label: t("sx.kit.search"),
          }}
          count={view === "data" ? t("sx.layout.results", { n: total }) : undefined}
          active={!!query || !!place}
          onReset={reset}
        >
          <Picker
            size="sm"
            label={field("placement")}
            placeholder={field("placement")}
            options={placementOptions(labels)}
            value={place}
            onChange={(v: string) => {
              setPlace(v);
              setPage(0);
            }}
            aiId={aiId(AI, "filter", "placement")}
          />
        </SxToolbar>
      </div>
      <SxTable
        caption={labels.ctorName(PROMO)}
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        rowTitle={(r) => r.name}
        rowTone={(r) => (r.status === "archived" ? "muted" : undefined)}
        onRowClick={(r) => setOpenId(r.id)}
        rowActions={actions}
        groupBy={(r) => ({ key: r.placement, title: labels.placement(r.placement) })}
        loading={view === "loading"}
        error={
          view === "error" ? (
            <SxEmpty
              tone="error"
              icon={CircleAlertIcon}
              title={t("sx.ui.loadFail")}
              action={
                <SxButton size="sm" icon={RefreshCwIcon} busy={busy} onClick={pulse} aiId={aiId(AI, "table", "retry")}>
                  {t("sx.ui.retry")}
                </SxButton>
              }
            />
          ) : undefined
        }
        empty={
          view === "empty" ? (
            <SxEmpty
              icon={PackageIcon}
              title={t("sx.kit.emptyTitle")}
              text={t("sx.kit.emptyText")}
              action={
                <SxButton variant="primary" size="sm" icon={PlusIcon} onClick={() => notify.info(noWrites)} aiId={aiId(AI, "table", "create")}>
                  {t("sx.kit.create")}
                </SxButton>
              }
            />
          ) : (
            <SxEmpty
              compact
              icon={SearchIcon}
              title={t("sx.table.noMatch")}
              action={
                <SxButton variant="ghost" size="sm" icon={RotateCcwIcon} onClick={reset} aiId={aiId(AI, "table", "reset")}>
                  {t("sx.table.reset")}
                </SxButton>
              }
            />
          )
        }
        footer={
          total > PAGE_SIZE ? (
            <SxPager
              from={current * PAGE_SIZE + 1}
              to={Math.min(total, current * PAGE_SIZE + PAGE_SIZE)}
              total={total}
              onPrev={() => setPage(Math.max(0, current - 1))}
              onNext={() => setPage(Math.min(lastPage, current + 1))}
              aiId={aiId(AI, "pager")}
            />
          ) : undefined
        }
        aiId={aiId(AI, "table", "rows")}
      />
      <SxDrawer
        open={!!opened}
        onClose={() => setOpenId("")}
        title={t("sx.kit.details")}
        description={opened ? opened.name : undefined}
        aiId={aiId(AI, "drawer")}
        footer={
          <SxButton onClick={() => setOpenId("")} aiId={aiId(AI, "drawer", "close")}>
            {t("sx.ui.close")}
          </SxButton>
        }
      >
        {opened ? (
          <dl className="sx-kit-dl">
            <dt>{field("code")}</dt>
            <dd>
              <code className="sx-code">{opened.code}</code>
            </dd>
            <dt>{field("placement")}</dt>
            <dd>{labels.placement(opened.placement)}</dd>
            <dt>{field("days")}</dt>
            <dd className="sx-num">{labels.days(opened.days)}</dd>
            <dt>{field("price")}</dt>
            <dd className="sx-num">{labels.money(opened.price)}</dd>
            <dt>{labels.field("status")}</dt>
            <dd>
              <StatusRail variant="compact" status={opened.status} celebrateOnPublish={false} />
            </dd>
            <dt>{t("sx.layout.updated")}</dt>
            <dd>{labels.dateTime(opened.updated)}</dd>
          </dl>
        ) : null}
      </SxDrawer>
    </SxPanel>
  );
}

function EmptiesPanel() {
  const t = useTranslations("studio");
  const [busy, pulse] = useBusyPulse();
  return (
    <SxPanel id="kit-empty" title={t("sx.kit.empties")} aiId={aiId(AI, "empties")}>
      <div className="sx-kit-empties">
        <SxEmpty
          icon={PackageIcon}
          title={t("sx.kit.emptyTitle")}
          text={t("sx.kit.emptyText")}
          action={
            <SxButton variant="primary" icon={PlusIcon} onClick={() => notify.info(t("sx.kit.noWrites"))} aiId={aiId(AI, "empty", "create")}>
              {t("sx.kit.create")}
            </SxButton>
          }
        />
        <SxEmpty icon={SearchIcon} title={t("sx.table.noMatch")} text={t("sx.kit.noMatchText")} />
        <SxEmpty
          tone="error"
          icon={CircleAlertIcon}
          title={t("sx.ui.errorTitle")}
          text={t("sx.ui.loadFail")}
          action={
            <SxButton icon={RefreshCwIcon} busy={busy} onClick={pulse} aiId={aiId(AI, "empty", "retry")}>
              {t("sx.ui.retry")}
            </SxButton>
          }
        />
      </div>
    </SxPanel>
  );
}

function NotesPanel() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const [busy, pulse] = useBusyPulse();
  const [shown, setShown] = useState(true);
  const blocked = ["MP04", "K02"];
  return (
    <SxPanel id="kit-notes" title={t("sx.kit.notes")} aiId={aiId(AI, "notes")}>
      <div className="sx-kit-notes">
        <SxNote tone="info" title={labels.status("in_review")}>
          {labels.statusHint("in_review")}
        </SxNote>
        <SxNote
          tone="warn"
          action={
            <SxLinkButton variant="secondary" size="sm" href={`/admin/studio/c/${blocked[0]}`} iconEnd={ArrowRightIcon} aiId={aiId(AI, "note", "blocked")}>
              {labels.ctorName(blocked[0])}
            </SxLinkButton>
          }
        >
          {t("sx.guide.blocked", { list: labels.list(blocked.map((c) => labels.ctorName(c))) })}
        </SxNote>
        <SxNote
          tone="error"
          title={t("sx.ui.errorTitle")}
          action={
            <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} busy={busy} onClick={pulse} aiId={aiId(AI, "note", "retry")}>
              {t("sx.ui.retry")}
            </SxButton>
          }
        >
          {t("sx.ui.loadFail")}
        </SxNote>
        {shown ? (
          <SxNote tone="success" role="status" onDismiss={() => setShown(false)}>
            {t("sx.rail.live")}
          </SxNote>
        ) : (
          <div className="sx-kit-row">
            <SxButton variant="ghost" size="sm" icon={RotateCcwIcon} onClick={() => setShown(true)} aiId={aiId(AI, "note", "restore")}>
              {t("sx.rep.undo")}
            </SxButton>
          </div>
        )}
      </div>
    </SxPanel>
  );
}

function GuidePanel({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  return (
    <SxPanel
      id="kit-guide"
      title={t("sx.kit.guide")}
      actions={
        <SxButton icon={InfoIcon} aria-haspopup="dialog" onClick={onOpen} aiId={aiId(AI, "guide", "open")}>
          {t("sx.kit.guideOpen")}
        </SxButton>
      }
      aiId={aiId(AI, "guide")}
    >
      <ul className="sx-kit-guides">
        {GUIDES.map((code) => (
          <li key={code} className="sx-kit-guide">
            {ctorGlyph(code, undefined, { size: 20 })}
            <div className="sx-kit-guide__text">
              <p className="sx-kit-guide__name">
                <span>{labels.ctorName(code)}</span>
                <code className="sx-code">{code}</code>
              </p>
              <p className="sx-kit-guide__what">
                {labels.ctorWhat(code)} <SxGuideButton code={code} aiId={aiId(AI, "guide", code.toLowerCase())} />
              </p>
            </div>
          </li>
        ))}
      </ul>
    </SxPanel>
  );
}

function CtorsPanel() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const uid = useKitId();
  return (
    <SxPanel id="kit-ctors" title={t("sx.core.lab.ctors")} aiId={aiId(AI, "ctors")}>
      <div className="sx-kit-groups">
        {ALL_GROUPS.map(([group, codes]) => (
          <section key={group} className="sx-kit-group" aria-labelledby={`${uid}-${group}`}>
            <h3 id={`${uid}-${group}`} className="sx-kit-group__name">
              {glyph(GROUP_ICON[group], { size: 18 })}
              <span>{labels.groupName(group)}</span>
            </h3>
            <ul className="sx-kit-ctors">
              {codes.map((code) => {
                const name = labels.ctorName(code);
                return (
                  <li key={code} className="sx-kit-ctor">
                    {ctorGlyph(code, group)}
                    <span className="sx-kit-ctor__name">{name}</span>
                    {name !== code ? <code className="sx-code">{code}</code> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </SxPanel>
  );
}

function IconsPanel() {
  const t = useTranslations("studio");
  return (
    <SxPanel id="kit-icons" title={t("sx.core.lab.icons")} lead={t("sx.core.lab.iconsLead")} aiId={aiId(AI, "icons")}>
      <ul className="sx-kit-icons">
        {ICONS.map(([name, icon]) => (
          <li key={name} className="sx-kit-icon">
            {glyph(icon, { size: 20 })}
            <code>{name.replace(/Icon$/, "")}</code>
          </li>
        ))}
      </ul>
    </SxPanel>
  );
}

function LabelsPanel() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
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
    ["published", labels.status("published")],
    ["published · pill", labels.statusPill("published")],
    ["changes_requested", labels.status("changes_requested")],
    ["399000 UZS", labels.money(399000, "UZS")],
    ["14", labels.days(14)],
    ["@code:minimum:1", labels.error("@code:minimum:1", { type: "number" })],
    ["Advokat, Yurist, Mijoz, Moderator", labels.list(["Advokat", "Yurist", "Mijoz", "Moderator"], 2)],
  ];
  return (
    <SxPanel id="kit-labels" title={t("sx.core.lab.labels")} aiId={aiId(AI, "labels")}>
      <div className="sx-kit-scroll" tabIndex={0} role="region" aria-label={t("sx.core.lab.labels")}>
        <table className="sx-kit-table">
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
    </SxPanel>
  );
}

function PolicyPanel() {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const policy = useSxFormPolicy();
  const uid = useKitId();
  const [title, setTitle] = useState("");
  const [placement, setPlacement] = useState("");
  const [days, setDays] = useState<number | undefined>(7);
  const [daysBad, setDaysBad] = useState(false);
  const [price, setPrice] = useState<number | undefined>(undefined);
  const scope = { ctor: PROMO };
  const rules: Readonly<Record<string, SxRule>> = {
    title: { type: "text", key: "title", ctor: PROMO },
    placement: { type: "select", key: "placement", ctor: PROMO, source: "promotion-placements" },
    days: DAYS_RULE,
    price: { type: "money", key: "price", ctor: PROMO, min: 0 },
  };
  const raw: Record<string, string> = {};
  if (!title.trim()) raw.title = "@required";
  if (!placement) raw.placement = "@required";
  if (daysBad) raw.days = "@number";
  else if (days === undefined) raw.days = "@required";
  else if (days < 1) raw.days = "@min";
  else if (days > 90) raw.days = "@max";
  if (price === undefined) raw.price = "@required";
  const errors: SxErrors = raw;
  const err = (path: string): string => {
    const token = policy.visible(path, errors);
    return token ? labels.error(token, rules[path]) : "";
  };
  const reset = () => {
    policy.reset();
    setTitle("");
    setPlacement("");
    setDays(7);
    setDaysBad(false);
    setPrice(undefined);
  };
  return (
    <SxPanel
      id="kit-policy"
      title={t("sx.form.lab.fields")}
      lead={t("sx.form.lab.note")}
      actions={
        <>
          <SxButton size="sm" variant="ghost" icon={RotateCcwIcon} onClick={reset} aiId={aiId(AI, "policy", "reset")}>
            {t("sx.form.lab.reset")}
          </SxButton>
          <SxButton size="sm" icon={CircleCheckIcon} onClick={policy.markSubmitted} aiId={aiId(AI, "policy", "check")}>
            {t("sx.form.lab.check")}
          </SxButton>
        </>
      }
      aiId={aiId(AI, "policy")}
    >
      <FormGrid>
        <Field id={`${uid}-title`} span={1} label={labels.field("title", scope)} required error={err("title")}>
          {(a) => (
            <TextInput
              {...a}
              value={title}
              onChange={setTitle}
              onBlur={() => policy.touch("title")}
              placeholder={labels.placeholder("title", scope)}
              aiId={aiId(AI, "policy", "title")}
              aiLabel={labels.field("title", scope)}
            />
          )}
        </Field>
        <Field id={`${uid}-placement`} span={1} label={labels.field("placement", scope)} required error={err("placement")}>
          {(a) => (
            <Picker
              {...a}
              label={labels.field("placement", scope)}
              options={placementOptions(labels)}
              value={placement}
              onChange={setPlacement}
              onBlur={() => policy.touch("placement")}
              aiId={aiId(AI, "policy", "placement")}
            />
          )}
        </Field>
        <Field id={`${uid}-days`} span={1} label={labels.field("days", scope)} hint={labels.hint(DAYS_RULE)} required error={err("days")}>
          {(a) => (
            <NumberInput
              {...a}
              value={days}
              onChange={setDays}
              onDraftInvalid={setDaysBad}
              onBlur={() => policy.touch("days")}
              min={1}
              max={90}
              aiId={aiId(AI, "policy", "days")}
              aiLabel={labels.field("days", scope)}
            />
          )}
        </Field>
        <Field id={`${uid}-price`} span={1} label={labels.field("price", scope)} required error={err("price")}>
          {(a) => (
            <MoneyInput
              {...a}
              value={price}
              onChange={setPrice}
              onBlur={() => policy.touch("price")}
              aiId={aiId(AI, "policy", "price")}
              aiLabel={labels.field("price", scope)}
            />
          )}
        </Field>
      </FormGrid>
    </SxPanel>
  );
}

const Pills = memo(PillsPanel);
const Buttons = memo(ButtonsPanel);
const Controls = memo(ControlsPanel);
const Policy = memo(PolicyPanel);
const Pickers = memo(PickersPanel);
const Rows = memo(RowsPanel);
const Cards = memo(CardsPanel);
const Packages = memo(PackagesPanel);
const Empties = memo(EmptiesPanel);
const Notes = memo(NotesPanel);
const Guides = memo(GuidePanel);
const Ctors = memo(CtorsPanel);
const Icons = memo(IconsPanel);
const Labels = memo(LabelsPanel);

export function KitPreview(): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const theme = useSyncExternalStore(watchTheme, themeNow, themeOnServer);
  const phone = useSyncExternalStore(watchPhone, phoneNow, phoneOnServer);
  const [view, setView] = useState<View>("page");
  const [status, setStatus] = useState<string>("draft");
  const [guide, setGuide] = useState(false);
  const openGuide = useCallback(() => setGuide(true), []);
  const saveWhyId = useKitId();
  const record = view === "record";
  const noWrites = t("sx.kit.noWrites");
  const next = nextStatus(status);
  const atEnd = next === status;

  const stats: SxStat[] = [
    { key: "draft", label: labels.status("draft"), value: 12, tone: "draft" },
    { key: "review", label: labels.status("in_review"), value: 3, tone: "review", href: "/admin/studio/approvals", aiId: aiId(AI, "stat", "review") },
    { key: "approved", label: t("sx.kit.waiting"), value: 2, tone: "approved", href: "/admin/studio/approvals", aiId: aiId(AI, "stat", "approved") },
    { key: "published", label: labels.status("published"), value: 41, tone: "published" },
  ];

  const pageActions = (
    <>
      <Seg
        label={t("sx.kit.theme")}
        value={theme}
        options={[
          { value: "light", label: t("sx.kit.light") },
          { value: "dark", label: t("sx.kit.dark") },
        ]}
        onChange={(v) => setThemePref(v)}
        ai={aiId(AI, "theme")}
      />
      <Seg
        label={t("sx.kit.view")}
        value={view}
        options={[
          { value: "page", label: t("sx.kit.page") },
          { value: "record", label: t("sx.kit.record") },
        ]}
        onChange={setView}
        ai={aiId(AI, "view")}
      />
    </>
  );

  const moreItems: MenuEntry[] = [
    ...(phone ? [{ key: "save", label: t("sx.ui.save"), icon: glyph(SaveIcon, { size: 16 }), disabled: noWrites, aiId: aiId(AI, "more", "save") }] : []),
    { key: "guide", label: t("sx.guide.title"), icon: glyph(InfoIcon, { size: 16 }), onSelect: () => setGuide(true), aiId: aiId(AI, "more", "guide") },
    { key: "page", label: t("sx.kit.page"), icon: glyph(LayoutGridIcon, { size: 16 }), onSelect: () => setView("page"), aiId: aiId(AI, "more", "page") },
    { kind: "separator", key: "sep-theme" },
    { kind: "heading", key: "theme", label: t("sx.kit.theme") },
    { key: "light", label: t("sx.kit.light"), checked: theme === "light", onSelect: () => setThemePref("light"), aiId: aiId(AI, "more", "light") },
    { key: "dark", label: t("sx.kit.dark"), checked: theme === "dark", onSelect: () => setThemePref("dark"), aiId: aiId(AI, "more", "dark") },
    { kind: "separator", key: "sep-archive" },
    { key: "archive", label: t("sx.ui.archive"), icon: glyph(ArchiveIcon, { size: 16 }), danger: true, disabled: noWrites, aiId: aiId(AI, "more", "archive") },
  ];

  const recordActions = (
    <>
      {phone ? null : (
        <>
          <SxButton icon={SaveIcon} aria-disabled title={noWrites} aria-describedby={saveWhyId} aiId={aiId(AI, "save")}>
            {t("sx.ui.save")}
          </SxButton>
          <span id={saveWhyId} className="sx-vh">
            {noWrites}
          </span>
        </>
      )}
      <SxButton
        variant="primary"
        iconEnd={ArrowRightIcon}
        aria-disabled={atEnd || undefined}
        onClick={() => {
          if (!atEnd) setStatus(next);
        }}
        aiId={aiId(AI, "next")}
      >
        {t("sx.kit.next")}
      </SxButton>
      <Menu label={t("sx.ui.more")} className="sx-pop sx-menu" triggerClassName="sx-ibtn" icon={moreGlyph()} align="end" aiId={aiId(AI, "more")} items={moreItems} />
    </>
  );

  const outline: SxOutlineItem[] = [
    { id: "kit-rail", label: t("sx.kit.rail"), state: "done" },
    { id: "kit-pills", label: t("sx.kit.pills"), state: "done" },
    { id: "kit-buttons", label: t("sx.kit.buttons"), state: "done" },
    { id: "kit-controls", label: t("sx.kit.controls"), state: "error", errors: 7 },
    { id: "kit-policy", label: t("sx.form.lab.fields") },
    { id: "kit-pickers", label: t("sx.kit.pickers") },
    { id: "kit-rows", label: t("sx.kit.rows"), state: "error", errors: 1 },
    { id: "kit-cards", label: t("sx.kit.cards"), state: "done" },
    { id: "kit-table", label: labels.ctorName(PROMO) },
    { id: "kit-empty", label: t("sx.kit.empties") },
    { id: "kit-notes", label: t("sx.kit.notes") },
    { id: "kit-guide", label: t("sx.kit.guide") },
    { id: "kit-ctors", label: t("sx.core.lab.ctors") },
    { id: "kit-icons", label: t("sx.core.lab.icons") },
    { id: "kit-labels", label: t("sx.core.lab.labels") },
  ];

  return (
    <SxPage
      title={record ? labels.promoPackage("profile-starter-7") : t("sx.kit.title")}
      layout={view}
      section="home"
      need="admin"
      crumbs={
        record
          ? [
              { label: labels.groupName("advertising"), href: "/admin/studio/g/advertising" },
              { label: labels.ctorName(PROMO), href: `/admin/studio/c/${PROMO}` },
            ]
          : undefined
      }
      lead={record ? undefined : t("sx.kit.lead")}
      meta={
        record ? (
          <span className="sx-kit-meta">
            <code className="sx-code">{PROMO}</code>
            <span>{t("sx.layout.version", { n: 3 })}</span>
          </span>
        ) : undefined
      }
      actions={record ? recordActions : pageActions}
      below={record ? <StatusRail status={status} note={labels.statusHint(status)} /> : undefined}
      statusWhenStuck={record ? <StatusRail variant="compact" status={status} /> : undefined}
      aiId={AI}
    >
      <div className="sx-kit-split" data-outline={record ? "" : undefined}>
        {record ? <SxOutline spy label={t("sx.kit.sections")} items={outline} aiId={aiId(AI, "outline")} /> : null}
        <div className="sx-kit-main">
          <SxStatStrip label={t("sx.kit.stats")} items={stats} />
          <RailPanel status={status} onStatus={setStatus} celebrate={!record} />
          <Pills />
          <Buttons />
          <Controls />
          <Policy />
          <Pickers />
          <Rows />
          <Cards />
          <Packages />
          <Empties />
          <Notes />
          <Guides onOpen={openGuide} />
          <Ctors />
          <Icons />
          <Labels />
        </div>
      </div>
      <SxGuide code={PROMO} open={guide} onClose={() => setGuide(false)} />
    </SxPage>
  );
}
