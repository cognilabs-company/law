"use client";

import "./sx-ctorpage.css";
import type { ReactElement } from "react";
import { Link } from "@/i18n/navigation";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { glyph } from "../icons";
import type { SxRowAction } from "../layout/Table";

export type RowToolsProps<T> = { row: T; actions: readonly SxRowAction<T>[]; base: string; label: string };

export function RowTools<T>({ row, actions, base, label }: RowToolsProps<T>): ReactElement | null {
  const shown = actions.filter((a) => !a.hidden?.(row));
  if (!shown.length) return null;
  return (
    <span className="sx-cp-tools" role="group" aria-label={label}>
      {shown.map((a) => {
        const off = a.disabled?.(row) ?? false;
        const reason = typeof off === "string" ? off : "";
        const href = off ? "" : (a.href?.(row) ?? "");
        const icon = a.icon ? glyph(a.icon, { size: 17 }) : null;
        const tip = reason ? `${a.label}: ${reason}` : a.label;
        if (href) {
          return (
            <Link
              key={a.key}
              href={href}
              className="sx-cp-tool"
              aria-label={a.label}
              data-tip={tip}
              data-danger={a.danger ? "" : undefined}
              data-ai-id={aiIdOf(base, "action", a.key)}
              data-ai-type="link"
              data-ai-label={a.label}
            >
              {icon}
            </Link>
          );
        }
        return (
          <button
            key={a.key}
            type="button"
            className="sx-cp-tool"
            aria-label={reason ? tip : a.label}
            aria-disabled={off ? true : undefined}
            data-tip={tip}
            data-danger={a.danger ? "" : undefined}
            data-ai-id={aiIdOf(base, "action", a.key)}
            data-ai-type="button"
            data-ai-label={a.label}
            onClick={() => {
              if (!off) a.onSelect?.(row);
            }}
          >
            {icon}
          </button>
        );
      })}
    </span>
  );
}
