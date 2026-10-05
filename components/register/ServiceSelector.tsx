"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { getServices } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "../portal/DataState";
import { IconSearch, IconCheck, IconGrid } from "../icons";

export default function ServiceSelector({
  value,
  onChange,
  excludeAdvokatRequired = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  // Yurists can't offer advocate-only services (seller rule) — hide them.
  excludeAdvokatRequired?: boolean;
}) {
  const t = useTranslations("register.services");
  const res = useResource(getServices, []);
  const [q, setQ] = useState("");

  const allowed = useMemo(
    () => (excludeAdvokatRequired ? res.data.filter((s) => !s.advokatRequired) : res.data),
    [res.data, excludeAdvokatRequired],
  );
  const hiddenCount = res.data.length - allowed.length;
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return allowed;
    return allowed.filter((s) => s.name.toLowerCase().includes(query));
  }, [q, allowed]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  if (res.status === "loading") return <Skeleton rows={4} />;
  if (res.status === "error" || !res.data.length)
    return <EmptyState title={t("empty")} text={t("emptyText")} />;

  return (
    <div className="svsel" data-ai-target="services:catalog">
      <div className="svsel__bar">
        <span className="svsel__search">
          <IconSearch />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
          />
        </span>
        <span className="svsel__count">{t("selected", { n: value.length })}</span>
      </div>
      {hiddenCount > 0 ? <p className="svsel__note">{t("advocateOnly")}</p> : null}
      <div className="svsel__grid">
        {list.map((s) => {
          const on = value.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              className={`svcard${on ? " on" : ""}`}
              aria-pressed={on}
              onClick={() => toggle(s.id)}
            >
              <span className="svcard__i">
                <IconGrid />
              </span>
              <span className="svcard__t">
                <b>{s.name}</b>
              </span>
              <span className="svcard__c">{on ? <IconCheck /> : null}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
