"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { IconMapPin, IconRefresh, IconUsers } from "@/components/icons";
import type { MarketSeller } from "@/lib/services/marketplace";
import { precisionMeters } from "@/lib/services/marketDiscovery";
import { isAborted, mapErrorKey, type MapErrorKey } from "@/lib/services/mapLocation";
import { bboxParam, filtersKey, getSellersMap, MARKER_ZOOM, UZ_BBOX, type MapBbox, type MapConfig, type MapFilters, type SellersMapResult } from "@/lib/services/sellersMap";
import type { RouteTarget } from "./NavigateDialog";
import SellerRow from "./SellerRow";

const LIST_LIMIT = 100;

type Res = { key: string; result: SellersMapResult | null; fail: MapErrorKey | null };

// The specialists of the map area as a list: the "List" view, and the whole
// page when the map is not available (configured=false or the Yandex script
// failed). Same endpoint and filters as the map, asked at marker zoom so
// every seller comes one by one instead of in clusters.
export default function AreaList({
  config,
  bbox,
  filters,
  refresh,
  base,
  known,
  onNavigate,
  onShowAll,
}: {
  config: MapConfig;
  bbox: MapBbox | null;
  filters: MapFilters;
  refresh: number;
  base: string;
  known: (userId: string) => MarketSeller | null;
  onNavigate?: (t: RouteTarget) => void;
  onShowAll: () => void;
}) {
  const t = useTranslations("marketMap.area");
  const tx = useTranslations("marketMap");
  const tn = useTranslations("marketplace.nearby");
  const area = bbox ?? config.countryBbox ?? UZ_BBOX;
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<Res | null>(null);
  const key = `${bboxParam(area)}|${filtersKey(filters)}|${refresh}|${tick}`;

  useEffect(() => {
    const c = new AbortController();
    getSellersMap({ url: config.sellerMapUrl, bbox: area, zoom: MARKER_ZOOM, filters, limit: LIST_LIMIT, order: config.coordinateOrder }, c.signal).then(
      (result) => {
        if (!c.signal.aborted) setRes({ key, result, fail: null });
      },
      (e) => {
        if (!c.signal.aborted && !isAborted(e)) setRes({ key, result: null, fail: mapErrorKey(e) });
      },
    );
    return () => c.abort();
    // key stands for the area and the filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, config.sellerMapUrl, config.coordinateOrder]);

  const loading = res?.key !== key;
  // Keep the previous rows while a refresh loads (no flashing skeleton).
  const shown = res?.result ?? null;
  const rows = shown ? shown.sellers.filter((s) => s.sellerUserId) : [];
  const precText = tx("approxArea", { m: precisionMeters(config.markerPrecision) });

  if (loading && !shown) {
    return (
      <div className="mmarea" aria-busy="true" data-ai-id="marketplace.map.area.loading">
        <p className="sr-only" role="status">
          {t("loading")}
        </p>
        <ul className="mknb-list" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="mknb-row mknb-row--ghost" />
          ))}
        </ul>
      </div>
    );
  }

  if (!loading && res?.fail) {
    return (
      <div className="mknb-msg" role="alert">
        <p>{res.fail === "generic" || res.fail === "offline" || res.fail === "not_found" ? t("error") : tx(`errors.${res.fail}`)}</p>
        <div className="mknb-msg__acts">
          <button type="button" className="btn btn--grad btn--sm" onClick={() => setTick((n) => n + 1)} data-ai-id="marketplace.map.area.retry">
            <IconRefresh aria-hidden="true" />
            {tn("retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="mk-empty mknb-empty" aria-live="polite" data-ai-id="marketplace.map.area.empty">
        <IconMapPin aria-hidden="true" />
        <b>{t("emptyTitle")}</b>
        <span>{t("emptyText")}</span>
        <div className="mk-empty__acts">
          <button type="button" className="btn btn--line btn--sm" onClick={onShowAll} data-ai-id="marketplace.map.area.show-all">
            <IconUsers aria-hidden="true" />
            {tn("showAll")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mmarea" aria-busy={loading || undefined}>
      <div className="mknb-meta" aria-live="polite">
        <span className="mknb-meta__n">{t(bbox ? "countArea" : "countAll", { n: shown?.total ?? rows.length })}</span>
        <span className="mknb-prec">{precText}</span>
        {shown?.truncated || (shown && shown.total > rows.length) ? <span className="ymk-status__more">{t("more", { n: rows.length })}</span> : null}
      </div>
      <ul className="mknb-list" aria-label={t("label")} data-ai-id="marketplace.map.area.list" data-ai-type="list">
        {rows.map((s) => (
          <SellerRow key={s.sellerUserId} s={s} known={known(s.sellerUserId)} base={base} precText={precText} withDistance={false} onNavigate={onNavigate} ai="marketplace.map.area.seller" />
        ))}
      </ul>
    </div>
  );
}
