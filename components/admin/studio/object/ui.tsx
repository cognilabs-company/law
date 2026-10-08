"use client";

import type { ComponentType, ReactNode, SVGProps } from "react";
import { humanize } from "@/lib/labels";
import type { StudioFieldErrors } from "@/lib/services/studio";
import { useStudioText } from "../bits";
import { fieldRoot } from "./model";
import { IconAlert, IconChevronRight } from "@/components/icons";

type P = SVGProps<SVGSVGElement>;
type Icon = ComponentType<P>;

const base: P = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const IconSave = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 3h11l4 4v12a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
    <path d="M8 3v5h7V3" />
    <path d="M8 21v-6h8v6" />
  </svg>
);

export const IconArchiveBox = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v9a2 2 0 002 2h10a2 2 0 002-2V9" />
    <path d="M10 13h4" />
  </svg>
);

export const IconCaretDown = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export function Banner({
  tone,
  icon: Glyph,
  title,
  children,
  action,
}: {
  tone: "info" | "warn" | "err" | "ok";
  icon: Icon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`stu-oban stu-oban--${tone}`} role={tone === "err" ? "alert" : "status"}>
      <span className="stu-oban__ico">
        <Glyph aria-hidden />
      </span>
      <div className="stu-oban__m">
        <b>{title}</b>
        {children}
      </div>
      {action ? <div className="stu-oban__act">{action}</div> : null}
    </div>
  );
}

export function VersionBadge({ version }: { version: string }) {
  if (!version) return null;
  return <span className="stu-ovbadge">v{version.replace(/^v/i, "")}</span>;
}

export function useFieldLabel() {
  const { t } = useStudioText();
  return (key: string) => {
    if (key === "_") return t("editor.errors.general");
    const root = fieldRoot(key);
    const label = root && t.has(`field.${root}`) ? t(`field.${root}`) : humanize(root);
    return key === root ? label : `${label} · ${key.slice(root.length).replace(/^\./, "")}`;
  };
}

export function ErrorSummary({ errors, title, onPick }: { errors: StudioFieldErrors; title: string; onPick: (key: string) => void }) {
  const { t, fieldErr } = useStudioText();
  const label = useFieldLabel();
  const list = Object.entries(errors).filter(([, v]) => v);
  if (!list.length) return null;
  return (
    <div className="stu-oesum" role="alert" data-ai-id="admin.studio.editor.errors" data-ai-type="section" data-ai-label={title}>
      <div className="stu-oesum__h">
        <span className="stu-oesum__ico">
          <IconAlert aria-hidden />
        </span>
        <div>
          <b>{title}</b>
          <small>{t("editor.errors.count", { n: list.length })}</small>
        </div>
      </div>
      <ul>
        {list.slice(0, 12).map(([k, v]) => (
          <li key={k}>
            <button type="button" onClick={() => onPick(k)}>
              <span className="stu-oesum__f">{label(k)}</span>
              <span className="stu-oesum__m">{fieldErr(v)}</span>
              <IconChevronRight aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
