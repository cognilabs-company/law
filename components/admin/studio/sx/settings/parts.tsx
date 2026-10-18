"use client";

import "../sx-tones.css";
import "./sx-settings.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { glyph } from "../icons";
import type { SxHue } from "../tones";
import type { SxIcon } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { hueOfName, initialsOf, roleCodeOf } from "./model";

export function Squircle({ icon, hue, size = "md" }: { icon: SxIcon; hue?: SxHue; size?: "sm" | "md" | "lg" }): ReactElement {
  const px = size === "lg" ? 26 : size === "sm" ? 16 : 20;
  return (
    <span className="sx-st-sq" data-size={size} data-hue={hue} aria-hidden="true">
      {glyph(icon, { size: px })}
    </span>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }): ReactElement {
  return (
    <span className="sx-st-ava" data-size={size} data-hue={hueOfName(name)} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

export type SectionHeadProps = { icon: SxIcon; hue: SxHue; title: string; lead?: ReactNode; actions?: ReactNode; children?: ReactNode; titleId: string; aiId?: string };

export function SectionHead({ icon, hue, title, lead, actions, children, titleId, aiId }: SectionHeadProps): ReactElement {
  return (
    <header className="sx-st-hero" data-hue={hue} data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined} data-ai-label={aiId ? title : undefined}>
      <div className="sx-st-hero__row">
        <Squircle icon={icon} hue={hue} size="lg" />
        <div className="sx-st-hero__titles">
          <h2 id={titleId} className="sx-st-hero__title" tabIndex={-1}>
            {title}
          </h2>
          {lead ? <p className="sx-st-hero__lead">{lead}</p> : null}
        </div>
        {actions ? <div className="sx-st-hero__acts">{actions}</div> : null}
      </div>
      {children ? <div className="sx-st-hero__more">{children}</div> : null}
    </header>
  );
}

export function Card({ children, className, labelledBy, aiId, aiLabel }: { children: ReactNode; className?: string; labelledBy?: string; aiId?: string; aiLabel?: string }): ReactElement {
  return (
    <section className={className ? `sx-st-card ${className}` : "sx-st-card"} aria-labelledby={labelledBy} data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined} data-ai-label={aiId ? aiLabel : undefined}>
      {children}
    </section>
  );
}

export function CardHead({ icon, hue, title, lead, id, actions }: { icon: SxIcon; hue: SxHue; title: string; lead?: ReactNode; id: string; actions?: ReactNode }): ReactElement {
  return (
    <div className="sx-st-chead" data-hue={hue}>
      <Squircle icon={icon} hue={hue} size="sm" />
      <div className="sx-st-chead__t">
        <h3 id={id}>{title}</h3>
        {lead ? <p>{lead}</p> : null}
      </div>
      {actions ? <div className="sx-st-chead__acts">{actions}</div> : null}
    </div>
  );
}

export function useRoleName(): (r: string) => string {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  return (r: string) => {
    const c = roleCodeOf(r);
    return c && t.has(`roles.${c}`) ? t(`roles.${c}`) : labels.role(r);
  };
}
