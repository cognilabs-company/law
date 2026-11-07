"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { IconRefresh, IconUsers } from "@/components/icons";
import type { MarketSeller } from "@/lib/services/marketplace";
import { isAborted, mapErrorKey, type MapErrorKey } from "@/lib/services/mapLocation";
import { bboxParam, filtersKey, getSellersMap, MARKER_ZOOM, UZ_BBOX, type MapBbox, type MapConfig, type MapFilters, type MapSeller, type SellersMapResult } from "@/lib/services/sellersMap";
import SellerRow from "./SellerRow";

const LIST_LIMIT = 100;

type Res = { key: string; result: SellersMapResult | null; fail: MapErrorKey | null };

export type AreaState = { rows: MapSeller[]; total: number; more: boolean; loading: boolean; fail: MapErrorKey | null; country: boolean; retry: () => void };

// The specialists of the map area as a list: the "List" view, and the whole
// page when the map is not available (configured=false or the Yandex script
// failed). Same endpoint and filters as the map, asked at marker zoom so
// every seller comes one by one instead of in clusters.
export function useAreaSellers({ config, bbox, filters, refresh, on }: { config: MapConfig | null; bbox: MapBbox | null; filters: MapFilters; refresh: number; on: boolean }): AreaState {
  const area = bbox ?? config?.countryBbox ?? UZ_BBOX;
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<Res | null>(null);
  const key = config && on ? `${bboxParam(area)}|${filtersKey(filters)}|${refresh}|${tick}` : "";

  useEffect(() => {
    if (!key || !config) return;
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
  }, [key, config?.sellerMapUrl, config?.coordinateOrder]);

  const loading = !key || res?.key !== key;
  const shown = res?.result ?? null;
  const rows = shown ? shown.sellers.filter((s) => s.sellerUserId) : [];
  return {
    rows,
    total: shown?.total ?? rows.length,
    more: !!shown && (shown.truncated || shown.total > rows.length),
    loading,
    fail: !loading && res?.fail ? res.fail : null,
    country: !bbox,
    retry: () => setTick((n) => n + 1),
  };
}

export default function AreaList({
  state,
  known,
  precText,
  selectedId,
  onSelect,
  onShowAll,
}: {
  state: AreaState;
  known: (userId: string) => MarketSeller | null;
  precText: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onShowAll: () => void;
}) {
  const t = useTranslations("marketMap.area");
  const tx = useTranslations("marketMap");
  const tn = useTranslations("marketplace.nearby");
  const { rows, loading, fail } = state;

  if (loading && !rows.length) {
    return (
      <div className="mmarea" aria-busy="true" data-ai-id="marketplace.map.area.loading">
        <p className="sr-only" role="status">
          {t("loading")}
        </p>
        <ul className="mmlist" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="mmrow mmrow--ghost" />
          ))}
        </ul>
      </div>
    );
  }

  if (fail) {
    return (
      <div className="mmnote mmnote--warn" role="alert">
        <span>{fail === "generic" || fail === "offline" || fail === "not_found" ? t("error") : tx(`errors.${fail}`)}</span>
        <button type="button" className="mmnote__act" onClick={state.retry} data-ai-id="marketplace.map.area.retry">
          <IconRefresh aria-hidden="true" />
          {tn("retry")}
        </button>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="mmempty" aria-live="polite" data-ai-id="marketplace.map.area.empty">
        <span className="mmempty__art" aria-hidden="true" />
        <b>{t("emptyTitle")}</b>
        <span>{t("emptyText")}</span>
        <button type="button" className="btn btn--line btn--sm" onClick={onShowAll} data-ai-id="marketplace.map.area.show-all">
          <IconUsers aria-hidden="true" />
          {tn("showAll")}
        </button>
      </div>
    );
  }

  return (
    <div className="mmarea" aria-busy={loading || undefined}>
      <ul className="mmlist" aria-label={t("label")} data-ai-id="marketplace.map.area.list" data-ai-type="list">
        {rows.map((s, i) => (
          <SellerRow
            key={s.sellerUserId}
            s={s}
            known={known(s.sellerUserId)}
            precText={precText}
            withDistance={false}
            selected={selectedId === s.sellerUserId}
            onSelect={onSelect}
            index={i}
            ai="marketplace.map.area.seller"
          />
        ))}
      </ul>
      {state.more ? <p className="mmlist__more">{t("more", { n: rows.length })}</p> : null}
    </div>
  );
}
