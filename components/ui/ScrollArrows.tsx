"use client";

import type { MouseEvent, ReactNode, RefObject } from "react";
import { useTranslations } from "next-intl";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { scrollStep, type ScrollEdges } from "@/lib/useScrollEdges";

export type ScrollArrowsProps = {
  target: RefObject<HTMLElement | null>;
  edges: ScrollEdges;
  children?: ReactNode;
  className?: string;
  prevLabel?: string;
  nextLabel?: string;
  share?: number;
};

const keepFocus = (e: MouseEvent) => e.preventDefault();

export default function ScrollArrows({ target, edges, children, className, prevLabel, nextLabel, share = 0.8 }: ScrollArrowsProps) {
  const t = useTranslations("common.scroll");
  const go = (dir: 1 | -1) => {
    const el = target.current;
    if (el) scrollStep(el, dir, share);
  };

  const arrows = edges.overflowX ? (
    <div className="sarr">
      <div className="sarr__rail">
        <span
          role="button"
          className="sarr__b sarr__b--prev"
          aria-label={prevLabel ?? t("prev")}
          data-on={edges.atStart ? undefined : ""}
          onMouseDown={keepFocus}
          onClick={() => go(-1)}
        >
          <IconChevronLeft aria-hidden="true" />
        </span>
        <span
          role="button"
          className="sarr__b sarr__b--next"
          aria-label={nextLabel ?? t("next")}
          data-on={edges.atEnd ? undefined : ""}
          onMouseDown={keepFocus}
          onClick={() => go(1)}
        >
          <IconChevronRight aria-hidden="true" />
        </span>
      </div>
    </div>
  ) : null;

  if (children === undefined) return arrows;
  return (
    <div className={className ? `sarr-host ${className}` : "sarr-host"}>
      {children}
      {arrows}
    </div>
  );
}
