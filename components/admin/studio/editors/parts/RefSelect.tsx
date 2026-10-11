"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { loadStudioReference, type StudioReferenceItem } from "@/lib/services/studio";
import { useStudioText } from "../../bits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keyOf = (source: string) => source.replace(/^\/?studio\/reference\//, "").replace(/^\//, "");
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

// A Studio field that holds an id (or a list of ids), picked from
// GET /studio/reference/{key} (10-09 §7) — services, categories, templates,
// promotion packages and placements, constructors, users, roles, plans,
// permissions, organisation units — or from one of the local lists
// (loadStudioReference). Never a text box for the id itself (§11): the first
// page of the list on open, a server search as the admin types.
type Props = {
  source: string;
  readOnly?: boolean;
  label: string;
  // Local names for values the backend labels in one language only.
  labelOf?: (value: string, backendLabel: string) => string;
} & (
  | { multiple?: false; value: string; onChange: (v: string) => void }
  // A list field (multiselect / list): the value is an array of ids.
  | { multiple: true; value: string[]; onChange: (v: string[]) => void }
);

export default function RefSelect(props: Props) {
  const { source, value, readOnly, label, labelOf, multiple } = props;
  const pick = (v: string[]) => (props.multiple ? props.onChange(v) : props.onChange(v[v.length - 1] ?? ""));
  const { t, role, ctorName, option, num } = useStudioText();
  const key = keyOf(source);
  // Raw rows: they are named at render time, so the list is fetched once per
  // source and never again because a translation helper changed identity.
  const [base, setBase] = useState<{ phase: "loading" | "ready" | "error"; rows: StudioReferenceItem[] }>({ phase: "loading", rows: [] });

  // The backend names roles, placements and constructors in Uzbek only; those
  // have names of our own. The second line says which record this is.
  const nameOf = useCallback(
    (v: string, backend: string) => {
      if (labelOf) return labelOf(v, backend);
      if (key === "roles") return role(v);
      if (key === "studio-constructors") return `${v} · ${ctorName(v)}`;
      if (key === "promotion-placements" && t.has(`option.${v}`)) return option(v);
      return backend;
    },
    [labelOf, key, role, ctorName, option, t],
  );
  const toOption = useCallback(
    (i: StudioReferenceItem): SearchOption => {
      const r = i.raw;
      const sub =
        key === "users"
          ? [str(r.role) ? role(str(r.role)) : "", str(r.lexgo_id)].filter(Boolean).join(" · ")
          : key === "document-templates"
            ? [str(r.category), str(r.language).toUpperCase()].filter(Boolean).join(" · ")
            : key === "promotion-packages"
              ? [str(r.placement) && t.has(`option.${str(r.placement)}`) ? option(str(r.placement)) : "", r.price != null ? `${num(Number(r.price))} ${str(r.currency) || "UZS"}` : "", r.days ? t("generic.refDays", { n: Number(r.days) }) : ""].filter(Boolean).join(" · ")
              : key === "subscription-plans"
                ? r.monthly_price != null ? t("generic.refMonthly", { price: num(Number(r.monthly_price)) }) : ""
                : [str(r.code), str(r.category_title)].filter(Boolean).join(" · ") || (key === "roles" ? str(r.value) : "");
      return { value: i.value, label: nameOf(i.value, i.label), sub: sub || undefined };
    },
    [key, role, option, num, t, nameOf],
  );

  useEffect(() => {
    const c = new AbortController();
    loadStudioReference(source, "", 50, c.signal)
      .then((rows) => {
        if (!c.signal.aborted) setBase({ phase: "ready", rows });
      })
      .catch(() => {
        if (!c.signal.aborted) setBase({ phase: "error", rows: [] });
      });
    return () => c.abort();
  }, [source]);
  const items = useMemo(() => base.rows.map(toOption), [base.rows, toOption]);

  const search = useCallback(async (q: string) => (await loadStudioReference(source, q, 50)).map(toOption), [source, toOption]);

  const values = useMemo(() => (Array.isArray(value) ? value.map(String).filter(Boolean) : value ? [value] : []), [value]);
  // A saved value outside the first page still needs a name, not its id: a
  // code ("admin", "K02") is its own name, an id gets a neutral label.
  const options = useMemo(() => {
    const known = new Set(items.map((o) => o.value));
    const extra = values.filter((v) => !known.has(v)).map((v) => ({ value: v, label: nameOf(v, UUID.test(v) ? t("generic.referenceSelected") : v) }));
    return [...extra, ...items];
  }, [items, values, nameOf, t]);

  if (readOnly) {
    const names = values.map((v) => options.find((o) => o.value === v)?.label || v);
    return (
      <div className="stu-refsel stu-refsel--ro" aria-label={label}>
        {names.length ? names.join(", ") : "—"}
      </div>
    );
  }
  return (
    <div className="stu-refsel">
      <SearchSelect
        single={!multiple}
        value={values}
        onChange={pick}
        options={options}
        onSearch={search}
        placeholder={base.phase === "loading" ? t("generic.referenceLoading") : base.phase === "error" ? t("generic.referenceError") : multiple ? t("generic.referencePickMany") : t("generic.referencePick")}
        searchPlaceholder={t("generic.referenceSearch")}
        emptyText={t("generic.referenceEmpty")}
        ariaLabel={label}
        removeLabel={t("common.clear")}
      />
    </div>
  );
}
