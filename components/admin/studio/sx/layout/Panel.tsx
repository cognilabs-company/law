"use client";

import "../sx-core.css";
import "../sx-layout.css";
import { useId, type ReactElement, type ReactNode } from "react";
import { cx } from "./util";

export type SxPanelProps = {
  title?: string;
  titleAs?: "h2" | "h3";
  titleId?: string;
  lead?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  as?: "section" | "div" | "aside";
  id?: string;
  className?: string;
  aiId?: string;
  children: ReactNode;
};

export function SxPanel({ title, titleAs = "h2", titleId, lead, actions, flush = false, as = "section", id, className, aiId, children }: SxPanelProps): ReactElement {
  const auto = useId();
  const headingId = titleId ?? `${auto}-title`;
  const Tag = as;
  const Heading = titleAs;
  const head =
    title || lead || actions ? (
      <div className="sx-panel__head">
        <div className="sx-panel__titles">
          {title ? (
            <Heading id={headingId} className="sx-panel__title">
              {title}
            </Heading>
          ) : null}
          {lead ? <div className="sx-panel__lead">{lead}</div> : null}
        </div>
        {actions ? <div className="sx-panel__actions">{actions}</div> : null}
      </div>
    ) : null;
  return (
    <Tag
      id={id}
      className={cx("sx-panel", className)}
      data-flush={flush || undefined}
      aria-labelledby={title && as !== "div" ? headingId : undefined}
      data-ai-id={aiId}
      data-ai-type={aiId ? "section" : undefined}
      data-ai-label={aiId ? title : undefined}
    >
      {head}
      {children}
    </Tag>
  );
}

export type SxSectionHeaderProps = { title: string; as?: "h2" | "h3" | "h4"; id?: string; lead?: ReactNode; actions?: ReactNode; className?: string };

export function SxSectionHeader({ title, as = "h2", id, lead, actions, className }: SxSectionHeaderProps): ReactElement {
  const Heading = as;
  return (
    <div className={cx("sx-sechead", className)} data-level={as}>
      <div className="sx-sechead__titles">
        <Heading id={id} className="sx-sechead__title" tabIndex={-1}>
          {title}
        </Heading>
        {lead ? <div className="sx-sechead__lead">{lead}</div> : null}
      </div>
      {actions ? <div className="sx-sechead__actions">{actions}</div> : null}
    </div>
  );
}
