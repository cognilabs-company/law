"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import Select, { type Option } from "@/components/Select";
import CheckBox from "@/components/CheckBox";
import { IconClose } from "@/components/icons";
import { usePopover } from "@/lib/usePopover";
import { MIN_RATING_STEPS, type MapFilters, type SellerTypeFilter } from "@/lib/services/sellersMap";
import { Segmented } from "./MapPanel";
import "./mapTopBar.css";

export default function FilterSheet({
  open,
  onClose,
  trigger,
  filters,
  onFilter,
  onClear,
  active,
  categories,
  subcategories,
  types,
}: {
  open: boolean;
  onClose: () => void;
  trigger: RefObject<HTMLButtonElement | null>;
  filters: MapFilters;
  onFilter: <K extends keyof MapFilters>(k: K, v: MapFilters[K]) => void;
  onClear: () => void;
  active: number;
  categories: Option[] | null;
  subcategories: Option[];
  types: Option[];
}) {
  const tx = useTranslations("marketMap");
  const locale = useLocale();
  const uid = useId();
  const titleId = `${uid}t`;
  const pane = useRef<HTMLDivElement | null>(null);
  const pop = usePopover({ open, onClose: () => onClose(), trigger, popup: pane, fit: "content", minWidth: 300, maxWidth: 380, gap: 10 });

  useEffect(() => {
    if (open) pane.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const ratings = MIN_RATING_STEPS.map((n) => ({ value: String(n), label: n > 0 ? tx("filters.ratingMin", { n: num.format(n) }) : tx("filters.ratingAny"), ai: `marketplace.map.filter.rating.${n}` }));

  return createPortal(
    <>
      {pop.isSheet ? <div className="dsel__scrim" style={{ zIndex: pop.z - 1 }} aria-hidden="true" /> : null}
      <div
        ref={pane}
        className={`mfs${pop.isSheet ? " mfs--sheet" : ""}`}
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={pop.style}
        data-placement={pop.placement}
        data-ai-id="marketplace.map.filters"
        data-ai-type="modal"
      >
        <div className="mfs__head">
          {pop.isSheet ? <span className="mfs__grip" aria-hidden="true" /> : null}
          <b id={titleId}>{tx("filters.title")}</b>
          <button type="button" className="mfs__x" onClick={() => pop.close("select")} aria-label={tx("filters.close")} data-ai-id="marketplace.map.filters.close">
            <IconClose aria-hidden="true" />
          </button>
        </div>
        <div className="mfs__body">
          {categories ? (
            <>
              <div className="mfs__f" data-ai-id="marketplace.map.filter.category" data-ai-type="select">
                <span className="mfs__l">{tx("filters.category")}</span>
                <Select value={filters.categoryId} onChange={(v) => onFilter("categoryId", v)} options={categories} ariaLabel={tx("filters.category")} search />
              </div>
              <div className="mfs__f" data-ai-id="marketplace.map.filter.subcategory" data-ai-type="select">
                <span className="mfs__l">{tx("filters.subcategory")}</span>
                <Select
                  value={filters.subcategoryId}
                  onChange={(v) => onFilter("subcategoryId", v)}
                  options={subcategories}
                  ariaLabel={tx("filters.subcategory")}
                  disabled={!filters.categoryId || subcategories.length < 2}
                  search
                />
              </div>
            </>
          ) : null}
          <div className="mfs__f" data-ai-id="marketplace.map.filter.type" data-ai-type="select">
            <span className="mfs__l">{tx("filters.type")}</span>
            <Select value={filters.sellerType} onChange={(v) => onFilter("sellerType", v as SellerTypeFilter)} options={types} ariaLabel={tx("filters.type")} />
          </div>
          <div className="mfs__f" data-ai-id="marketplace.map.filter.rating">
            <span className="mfs__l">{tx("filters.rating")}</span>
            <Segmented value={String(filters.minRating)} options={ratings} onChange={(v) => onFilter("minRating", Number(v) || 0)} label={tx("filters.rating")} />
          </div>
          <div className="mfs__chk" data-ai-id="marketplace.map.filter.verified">
            <CheckBox checked={filters.verifiedOnly} onChange={(on) => onFilter("verifiedOnly", on)}>
              {tx("filters.verified")}
            </CheckBox>
          </div>
        </div>
        <div className="mfs__foot">
          <button type="button" className="btn btn--line btn--sm" onClick={onClear} disabled={!active} data-ai-id="marketplace.map.filters.reset">
            {tx("filters.clearShort")}
          </button>
          <button type="button" className="btn btn--grad btn--sm" onClick={() => pop.close("select")} data-ai-id="marketplace.map.filters.done">
            {tx("filters.done")}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
