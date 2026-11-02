"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";
import { useTranslations } from "next-intl";
import Select, { type Option } from "@/components/Select";
import { IconList, IconMap, IconSearch, IconSliders } from "@/components/icons";
import { Segmented } from "./MapPanel";
import "./mapTopBar.css";

export type PanelView = "map" | "list";

export default function MapTopBar({
  floating,
  serviceId,
  services,
  onService,
  active,
  filtersOpen,
  onFilters,
  filterRef,
  view,
  onView,
  mapOn,
  children,
}: {
  floating: boolean;
  serviceId: string;
  services: Option[];
  onService: (v: string) => void;
  active: number;
  filtersOpen: boolean;
  onFilters: () => void;
  filterRef: RefObject<HTMLButtonElement | null>;
  view: PanelView;
  onView: (v: PanelView) => void;
  mapOn: boolean;
  children?: ReactNode;
}) {
  const tx = useTranslations("marketMap");
  const tn = useTranslations("marketplace.nearby");
  return (
    <div
      className={`mtb${floating ? " mtb--float mmx-in" : ""}`}
      style={{ "--d": "0ms" } as CSSProperties}
      role="group"
      aria-label={tx("bar.label")}
      data-ai-target="marketplace:filters"
      data-ai-id="marketplace.map.topbar"
    >
      <div className="mtb__svc" data-ai-id="marketplace.map.filter.service" data-ai-type="select">
        <IconSearch className="mtb__svc-ic" aria-hidden="true" />
        <Select value={serviceId} onChange={onService} options={services} ariaLabel={tx("filters.service")} search />
      </div>
      <button
        ref={filterRef}
        type="button"
        className={`mtb__btn${active ? " is-on" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={filtersOpen}
        onClick={onFilters}
        data-ai-id="marketplace.map.filters.open"
      >
        <IconSliders aria-hidden="true" />
        <span className="mtb__lbl">{tx("bar.filters")}</span>
        {active ? (
          <span key={active} className="mtb__badge" aria-hidden="true">
            {active}
          </span>
        ) : null}
        <span className="sr-only">{tx("bar.filtersCount", { n: active })}</span>
      </button>
      {mapOn ? (
        <Segmented
          className="mtb__view"
          value={view}
          onChange={onView}
          label={tn("map.view")}
          options={[
            { value: "map", label: tn("map.map"), icon: <IconMap aria-hidden="true" />, ai: "marketplace.nearby.view.map" },
            { value: "list", label: tn("map.list"), icon: <IconList aria-hidden="true" />, ai: "marketplace.nearby.view.list" },
          ]}
        />
      ) : null}
      {children}
    </div>
  );
}
