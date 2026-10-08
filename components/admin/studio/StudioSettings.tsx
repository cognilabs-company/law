"use client";

import { useState, type ComponentType, type KeyboardEvent, type SVGProps } from "react";
import { useAiReveal } from "@/lib/guide/targets";
import StudioShell from "./StudioShell";
import { useStudioText } from "./bits";
import AccessPanel from "./settings/AccessPanel";
import RoutesPanel from "./settings/RoutesPanel";
import RegistryPanel from "./settings/RegistryPanel";
import ExportPanel from "./settings/ExportPanel";
import { IconDownload, IconLayers, IconLock, IconShieldCheck, IconSliders } from "@/components/icons";

type Tab = "access" | "routes" | "registry" | "export";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const TABS: { key: Tab; Icon: Icon }[] = [
  { key: "access", Icon: IconLock },
  { key: "routes", Icon: IconShieldCheck },
  { key: "registry", Icon: IconLayers },
  { key: "export", Icon: IconDownload },
];

const AI = "admin.studio.settings";

export default function StudioSettings() {
  const { t } = useStudioText();
  return (
    <StudioShell title={t("screens.settings.title")} lead={t("screens.settings.lead")} icon={<IconSliders aria-hidden />} need="admin">
      <SettingsBody />
    </StudioShell>
  );
}

function SettingsBody() {
  const { t } = useStudioText();
  const [tab, setTab] = useState<Tab>("access");

  useAiReveal(/^admin\.studio\.settings\.access(\.|$)/, () => setTab("access"));
  useAiReveal(/^admin\.studio\.settings\.routes(\.|$)/, () => setTab("routes"));
  useAiReveal(/^admin\.studio\.settings\.registry(\.|$)/, () => setTab("registry"));
  useAiReveal(/^admin\.studio\.settings\.export(\.|$)/, () => setTab("export"));

  function onKey(e: KeyboardEvent<HTMLButtonElement>, k: Tab) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex((x) => x.key === k);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].key;
    setTab(next);
    document.getElementById(`stu-set-tab-${next}`)?.focus();
  }

  return (
    <div className="stu-set">
      <div className="stu-seg stu-set__tabs" role="tablist" aria-label={t("settings.tabsAria")} data-ai-id={`${AI}.tabs`} data-ai-type="section" data-ai-label={t("settings.tabsAria")}>
        {TABS.map(({ key, Icon: Glyph }) => (
          <button
            key={key}
            id={`stu-set-tab-${key}`}
            type="button"
            role="tab"
            className="stu-seg__b"
            aria-selected={tab === key}
            aria-controls="stu-set-panel"
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(e) => onKey(e, key)}
            data-ai-id={`${AI}.tab.${key}`}
            data-ai-type="tab"
            data-ai-label={t(`settings.tabs.${key}`)}
          >
            <Glyph aria-hidden />
            {t(`settings.tabs.${key}`)}
          </button>
        ))}
      </div>
      <div className="stu-set__panel" role="tabpanel" id="stu-set-panel" aria-labelledby={`stu-set-tab-${tab}`}>
        {tab === "access" ? <AccessPanel /> : tab === "routes" ? <RoutesPanel /> : tab === "registry" ? <RegistryPanel /> : <ExportPanel />}
      </div>
    </div>
  );
}
