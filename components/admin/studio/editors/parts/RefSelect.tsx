"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { getStudioReference } from "@/lib/services/studio";
import { useStudioText } from "../../bits";

// A Studio field that holds an id, picked from GET /studio/reference/{key}
// (10-09 §7) — services, categories, templates, promotion packages and
// placements, constructors, users. Never a text box for the id itself (§11):
// the first page of the list on open, a server search as the admin types.
export default function RefSelect({
  source,
  value,
  onChange,
  readOnly,
  label,
  labelOf,
}: {
  source: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  label: string;
  // Local names for values the backend labels in one language only.
  labelOf?: (value: string, backendLabel: string) => string;
}) {
  const { t } = useStudioText();
  const [base, setBase] = useState<{ phase: "loading" | "ready" | "error"; items: SearchOption[] }>({ phase: "loading", items: [] });
  const toOption = useCallback(
    (i: { value: string; label: string; raw: Record<string, unknown> }): SearchOption => ({
      value: i.value,
      label: labelOf ? labelOf(i.value, i.label) : i.label,
      sub: typeof i.raw.category_title === "string" ? i.raw.category_title : typeof i.raw.code === "string" ? i.raw.code : undefined,
    }),
    [labelOf],
  );

  useEffect(() => {
    const c = new AbortController();
    getStudioReference(source, "", 50, c.signal)
      .then((items) => setBase({ phase: "ready", items: items.map(toOption) }))
      .catch(() => { if (!c.signal.aborted) setBase({ phase: "error", items: [] }); });
    return () => c.abort();
  }, [source, toOption]);

  const search = useCallback(async (q: string) => (await getStudioReference(source, q, 50)).map(toOption), [source, toOption]);

  // A saved value outside the first page still needs a name, not its id.
  const options = useMemo(
    () => (value && !base.items.some((o) => o.value === value) ? [{ value, label: labelOf ? labelOf(value, t("generic.referenceSelected")) : t("generic.referenceSelected") }, ...base.items] : base.items),
    [base.items, value, labelOf, t],
  );
  const current = options.find((o) => o.value === value);

  if (readOnly) return <div className="stu-refsel stu-refsel--ro" aria-label={label}>{current?.label || "—"}</div>;
  return (
    <div className="stu-refsel">
      <SearchSelect
        single
        value={value ? [value] : []}
        onChange={(v) => onChange(v[v.length - 1] ?? "")}
        options={options}
        onSearch={search}
        placeholder={base.phase === "loading" ? t("generic.referenceLoading") : base.phase === "error" ? t("generic.referenceError") : t("generic.referencePick")}
        searchPlaceholder={t("generic.referenceSearch")}
        emptyText={t("generic.referenceEmpty")}
        ariaLabel={label}
        removeLabel={t("common.clear")}
      />
    </div>
  );
}
