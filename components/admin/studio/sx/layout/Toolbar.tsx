"use client";

import "../sx-core.css";
import "../sx-layout.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { aiId as aiIdOf } from "@/lib/ai/ids";
import { SxButton } from "../Button";
import { TextInput } from "../form/TextInput";
import { RotateCcwIcon, SearchIcon } from "../icons";

export type SxToolbarProps = {
  search?: { value: string; onChange: (v: string) => void; placeholder: string; label: string; aiId?: string };
  children?: ReactNode;
  count?: ReactNode;
  end?: ReactNode;
  active?: boolean;
  onReset?: () => void;
  aiId?: string;
};

export function SxToolbar({ search, children, count, end, active = false, onReset, aiId }: SxToolbarProps): ReactElement {
  const t = useTranslations("studio");
  const base = aiId ?? "admin.studio.toolbar";
  return (
    <div className="sx-toolbar" data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined}>
      {search ? (
        <div className="sx-toolbar__search">
          <TextInput
            type="search"
            size="sm"
            value={search.value}
            onChange={search.onChange}
            placeholder={search.placeholder}
            aria-label={search.label}
            leading={SearchIcon}
            enterKeyHint="search"
            aiId={search.aiId ?? aiIdOf(base, "search")}
            aiLabel={search.label}
          />
        </div>
      ) : null}
      {children ? <div className="sx-toolbar__filters">{children}</div> : null}
      <div className="sx-toolbar__count" role="status">
        {count === undefined || count === null || count === false || count === "" ? null : count}
      </div>
      {active && onReset ? (
        <SxButton variant="ghost" size="sm" icon={RotateCcwIcon} onClick={onReset} aiId={aiIdOf(base, "reset")}>
          {t("sx.table.reset")}
        </SxButton>
      ) : null}
      {end ? <div className="sx-toolbar__end">{end}</div> : null}
    </div>
  );
}
