"use client";

import "../sx-core.css";
import "../sx-layout.css";
import "../sx-tones.css";
import "./sx-settings.css";
import { Suspense, useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useStudioPerms } from "@/components/admin/studio/StepMeta";
import { useAiReveal } from "@/lib/guide/targets";
import { useStudioRegistry } from "@/lib/services/studio";
import { useUrlTab } from "@/lib/useUrlTab";
import { enterStyle } from "../hooks";
import { glyph } from "../icons";
import { SxPage } from "../layout/Page";
import { SxSegmented } from "../shared/Segmented";
import { useStudioLabels } from "../useStudioLabels";
import { AccessSection } from "./AccessSection";
import { ExportSection } from "./ExportSection";
import { SET_AI, SET_TABS, TAB_HUE, TAB_ICON, type SetTab } from "./model";
import { RegistrySection } from "./RegistrySection";
import { RoutesSection } from "./RoutesSection";
import { useAccessList } from "./useAccessList";
import { useRoutesProbe } from "./useRoutesProbe";

const WIDE_QUERY = "(min-width: 1400px)";

function subscribeWide(on: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", on);
  return () => mq.removeEventListener("change", on);
}

function readWide(): boolean {
  return typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia(WIDE_QUERY).matches;
}

const serverWide = () => true;

export function SettingsPage(): ReactElement {
  const t = useTranslations("studio");
  return (
    <SxPage title={t("screens.settings.title")} lead={t("sx.set.lead")} section="settings" need="admin" aiId={SET_AI}>
      <Suspense fallback={null}>
        <SettingsBody />
      </Suspense>
    </SxPage>
  );
}

function SettingsBody(): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const perms = useStudioPerms();
  const reg = useStudioRegistry();
  const access = useAccessList();
  const routes = useRoutesProbe(perms.workflow);
  const wide = useSyncExternalStore(subscribeWide, readWide, serverWide);
  const tabs = SET_TABS.filter((k) => k !== "routes" || perms.workflow);
  const [tab, pick] = useUrlTab(tabs, "access");
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = strip.current;
    if (wide || !box) return;
    const cur = box.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
    if (!cur) return;
    const left = cur.offsetLeft - box.clientWidth / 2 + cur.offsetWidth / 2;
    box.scrollTo({ left: Math.max(0, left) });
  }, [tab, wide]);

  useAiReveal(/^admin\.studio\.settings\.access(\.|$)/, () => pick("access"));
  useAiReveal(/^admin\.studio\.settings\.routes(\.|$)/, () => {
    if (perms.workflow) pick("routes");
  });
  useAiReveal(/^admin\.studio\.settings\.registry(\.|$)/, () => pick("registry"));
  useAiReveal(/^admin\.studio\.settings\.export(\.|$)/, () => pick("export"));

  const countOf = (k: SetTab): number | null => {
    if (k === "access") return access.phase === "ready" ? access.items.length : null;
    if (k === "routes") return routes.count;
    if (k === "registry") return reg.constructorCount ?? (reg.items.length || null);
    return null;
  };
  const title = (k: SetTab) => t(`sx.set.nav.${k}.title`);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, k: SetTab) => {
    const keys = ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = tabs.indexOf(k);
    let n = i;
    if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else n = (i - 1 + tabs.length) % tabs.length;
    const next = tabs[n];
    pick(next);
    requestAnimationFrame(() => document.getElementById(`sx-set-tab-${next}`)?.focus());
  };

  const section =
    tab === "access" ? (
      <AccessSection list={access} />
    ) : tab === "routes" && perms.workflow ? (
      <RoutesSection probe={routes} />
    ) : tab === "registry" ? (
      <RegistrySection />
    ) : (
      <ExportSection />
    );

  return (
    <div className="sx-set" data-wide={wide ? "" : undefined}>
      {wide ? (
        <nav className="sx-set__nav" aria-label={t("settings.tabsAria")}>
          <div className="sx-set__navcard" role="tablist" aria-orientation="vertical" aria-label={t("settings.tabsAria")} data-ai-id={`${SET_AI}.tabs`} data-ai-type="section" data-ai-label={t("settings.tabsAria")}>
            {tabs.map((k, i) => {
              const on = tab === k;
              const n = countOf(k);
              return (
                <button
                  key={k}
                  id={`sx-set-tab-${k}`}
                  type="button"
                  role="tab"
                  className="sx-set__tab sx-enter"
                  style={enterStyle(i)}
                  data-hue={TAB_HUE[k]}
                  aria-selected={on}
                  aria-controls="sx-set-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => {
                    if (!on) pick(k);
                  }}
                  onKeyDown={(e) => onKey(e, k)}
                  data-ai-id={`${SET_AI}.tab.${k}`}
                  data-ai-type="tab"
                  data-ai-label={title(k)}
                >
                  <span className="sx-set__tabico" aria-hidden="true">
                    {glyph(TAB_ICON[k], { size: 18 })}
                  </span>
                  <span className="sx-set__tabtext">
                    <span className="sx-set__tabtitle">{title(k)}</span>
                    <span className="sx-set__tabdesc">{t(`sx.set.nav.${k}.text`)}</span>
                  </span>
                  {n !== null ? <span className="sx-set__tabcount sx-num">{labels.num(n)}</span> : null}
                </button>
              );
            })}
          </div>
        </nav>
      ) : (
        <div className="sx-set__mtabs" ref={strip}>
          <SxSegmented
            items={tabs.map((k) => ({ value: k, label: title(k), icon: TAB_ICON[k], count: countOf(k), aiId: `${SET_AI}.tab.${k}` }))}
            value={tab}
            onChange={pick}
            label={t("settings.tabsAria")}
            size="sm"
            aiId={`${SET_AI}.tabs`}
          />
        </div>
      )}
      <div
        className="sx-set__panel"
        id="sx-set-panel"
        role={wide ? "tabpanel" : "region"}
        aria-labelledby={wide ? `sx-set-tab-${tab}` : undefined}
        aria-label={wide ? undefined : title(tab)}
      >
        <div key={tab} className="sx-set__swap">
          {section}
        </div>
      </div>
    </div>
  );
}
