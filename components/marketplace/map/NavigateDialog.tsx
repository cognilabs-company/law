"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Bike, Bus, Car, Footprints, Navigation } from "lucide-react";
import Modal from "@/components/admin/Modal";
import { IconExternal, IconLock, IconMapPin, IconRefresh } from "@/components/icons";
import { mapErrorKey, requestNavigation, type MapErrorKey, type NavRoute, type Place, type Point } from "@/lib/services/mapLocation";
import { NAV_MODES, type NavMode } from "@/lib/services/sellersMap";
import PlaceSearch from "./PlaceSearch";
import { closeRouteTab, isHandheld, openRoute, prepareRouteTab, webRouteOf, type RouteOpen } from "./route";

export type RouteTarget = { sellerUserId: string; name: string; endpoint: string; modes: NavMode[] };

const MODE_ICON: Record<NavMode, ReactNode> = {
  driving: <Car aria-hidden="true" />,
  walking: <Footprints aria-hidden="true" />,
  transit: <Bus aria-hidden="true" />,
  bicycle: <Bike aria-hidden="true" />,
};

type Phase = { kind: "idle" } | { kind: "busy" } | { kind: "done"; route: NavRoute; opened: RouteOpen } | { kind: "fail"; err: MapErrorKey };

// The route to a specialist: pick how to travel, the backend builds the
// Yandex link from the client's starting point and the destination it
// authorises (a public office, or a paid order's live location). The page
// never builds a route URL and never uses marker coordinates for it.
export default function NavigateDialog({
  target,
  point,
  locating,
  geoFailed,
  template,
  geocoderUrl,
  signedIn,
  onLocate,
  onManual,
  onConsentNeeded,
  onClose,
}: {
  target: RouteTarget;
  point: Point | null;
  locating: boolean;
  geoFailed: boolean;
  template: string;
  // "" when the config says the geocoder is off.
  geocoderUrl: string;
  signedIn: boolean;
  onLocate: () => void;
  onManual: (p: Place) => void;
  onConsentNeeded: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("marketMap.route");
  const tx = useTranslations("marketMap");
  const modes = target.modes.length ? target.modes : [...NAV_MODES];
  const [mode, setMode] = useState<NavMode>(modes[0]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "busy";

  const build = async () => {
    if (!point || busy) return;
    const tab = prepareRouteTab();
    setPhase({ kind: "busy" });
    try {
      const route = await requestNavigation({ sellerUserId: target.sellerUserId, endpoint: target.endpoint, template, point, mode });
      const opened = openRoute(route, tab);
      setPhase({ kind: "done", route, opened });
    } catch (e) {
      closeRouteTab(tab);
      const err = mapErrorKey(e);
      setPhase({ kind: "fail", err });
      if (err === "client_location_consent_required") onConsentNeeded();
    }
  };

  const modesRef = useRef<HTMLDivElement>(null);
  const pickMode = (m: NavMode) => {
    setMode(m);
    if (phase.kind !== "busy") setPhase({ kind: "idle" });
  };
  // A radio group: arrows move and choose, Tab leaves the group.
  const onModeKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = modes[(modes.indexOf(mode) + step + modes.length) % modes.length];
    pickMode(next);
    modesRef.current?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
  };
  const done = phase.kind === "done" ? phase : null;
  const web = done ? webRouteOf(done.route) : "";

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title={t("title", { name: target.name })} icon={<Navigation aria-hidden="true" />} size="sm" aiId="marketplace.route">
      <div className="mmr" data-ai-id="marketplace.route.dialog" data-ai-type="modal">
        <div className="mmr__sec">
          <h3 className="mmr__h">{t("how")}</h3>
          <div ref={modesRef} className="mmr__modes" role="radiogroup" aria-label={t("how")} data-ai-id="marketplace.route.modes">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                tabIndex={mode === m ? 0 : -1}
                data-mode={m}
                onClick={() => pickMode(m)}
                onKeyDown={onModeKey}
                disabled={busy}
                data-ai-id={`marketplace.route.mode.${m}`}
              >
                {MODE_ICON[m]}
                <span>{t(`mode.${m}`)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mmr__sec">
          <h3 className="mmr__h">{t("from")}</h3>
          {!signedIn ? (
            <p className="mmr__note mmr__note--warn">{tx("errors.login_required")}</p>
          ) : point ? (
            <p className="mmr__from" data-ai-id="marketplace.route.from">
              <IconMapPin aria-hidden="true" />
              {t("fromSet")}
            </p>
          ) : (
            <div className="mmr__ask">
              <button type="button" className="btn btn--line btn--sm" onClick={onLocate} disabled={locating} aria-busy={locating || undefined} data-ai-id="marketplace.route.locate">
                <IconMapPin aria-hidden="true" />
                {locating ? tx("locate.asking") : t("useLocation")}
              </button>
              {geoFailed ? (
                <>
                  <p className="mmr__note">{t("manualHint")}</p>
                  <PlaceSearch url={geocoderUrl} off={!geocoderUrl} label={tx("manual.searchLabel")} placeholder={tx("manual.searchPlaceholder")} onSelect={onManual} aiId="marketplace.route.place" />
                </>
              ) : null}
            </div>
          )}
        </div>

        <p className="mmr__note">
          <IconLock aria-hidden="true" />
          {t("privacy")}
        </p>

        {phase.kind === "fail" ? (
          <p className="mmr__err" role="alert">
            {tx(`errors.${phase.err}`)}
          </p>
        ) : null}

        {done ? (
          <div className="mmr__done" role="status" data-ai-id="marketplace.route.done">
            <b>{done.opened === "app" ? t("openingApp") : done.opened === "web" ? t("openedWeb") : done.opened === "blocked" ? t("blocked") : t("noLink")}</b>
            <span className="mmr__dest">{done.route.destinationSource === "paid_order_live_location" ? t("destLive") : t("destOffice")}</span>
            <span className="mmr__links">
              {done.route.appUrl && isHandheld() ? (
                <a className="btn btn--grad btn--sm" href={done.route.appUrl} data-ai-id="marketplace.route.app">
                  <Navigation aria-hidden="true" />
                  {t("app")}
                </a>
              ) : null}
              {web ? (
                <a className="btn btn--line btn--sm" href={web} target="_blank" rel="noopener noreferrer" data-ai-id="marketplace.route.web">
                  <IconExternal aria-hidden="true" />
                  {t("web")}
                </a>
              ) : null}
            </span>
          </div>
        ) : null}

        <div className="mmr__acts">
          <button type="button" className="btn btn--line" onClick={onClose} disabled={busy}>
            {t("close")}
          </button>
          <button type="button" className="btn btn--grad" onClick={build} disabled={!point || busy || !signedIn} aria-busy={busy || undefined} data-ai-id="marketplace.route.build">
            {phase.kind === "fail" ? <IconRefresh aria-hidden="true" /> : <Navigation aria-hidden="true" />}
            {busy ? t("building") : phase.kind === "fail" ? t("retry") : done ? t("again") : t("build")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
