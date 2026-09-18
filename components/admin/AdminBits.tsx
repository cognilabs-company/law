"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import Select from "@/components/Select";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { listLawyers } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";

export function useReload(): [number, () => void] {
  const [k, setK] = useState(0);
  return [k, () => setK((x) => x + 1)];
}

export function Notice({ ok, msg }: { ok: boolean; msg: string }) {
  return <div className={`anote anote--${ok ? "ok" : "err"}`}>{msg}</div>;
}

// Clean list row for admin lists (no raw ids).
export function AdminItem({
  index,
  title,
  meta,
  tags,
  right,
  actions,
}: {
  index?: number;
  title: string;
  meta?: string;
  tags?: { label: string; tone?: "ok" | "muted" }[];
  right?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="aitem">
      {index != null ? <span className="aitem__n">{index}</span> : null}
      <div className="aitem__m">
        <b>{title}</b>
        {meta ? <span className="aitem__meta">{meta}</span> : null}
        {tags && tags.length ? (
          <div className="aitem__tags">
            {tags.map((t, i) => (
              <em key={i} className={`atag${t.tone ? ` atag--${t.tone}` : ""}`}>{t.label}</em>
            ))}
          </div>
        ) : null}
      </div>
      {right != null ? <div className="aitem__r">{right}</div> : null}
      {actions != null ? <div className="aitem__acts">{actions}</div> : null}
    </div>
  );
}

// Pick a professional by name + phone; the value is the user id, never shown.
// Searchable single-user picker. Default source is the public lawyer/advocate
// directory (works for a seller managing their own organization); pass
// `search` to look further — e.g. admin/roles assigns roles to any user, so it
// passes a debounced GET /admin/users?q= search instead.
export function UserSelect({
  value,
  onChange,
  label,
  placeholder,
  search,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  search?: (q: string) => Promise<SearchOption[]>;
}) {
  const t = useTranslations("admin.userSelect");
  const res = useResource(search ? async () => [] : listLawyers, [!!search]);
  const opts = useMemo(
    () =>
      search
        ? []
        : res.data.filter((l) => l.userId).map((l) => ({ value: l.userId, label: l.name || "—", sub: l.phone })),
    [res.data, search],
  );
  return (
    <div>
      <label>{label}</label>
      <SearchSelect
        single
        value={value ? [value] : []}
        onChange={(v) => onChange(v[0] ?? "")}
        options={opts}
        onSearch={search}
        placeholder={placeholder}
        searchPlaceholder={t("searchPh")}
        emptyText={t("empty")}
        ariaLabel={label}
        removeLabel={t("clear")}
      />
    </div>
  );
}

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "checkbox" | "select" | "user";
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
};

type Vals = Record<string, string | boolean>;

function initial(fields: Field[], seed?: Vals): Vals {
  return Object.fromEntries(
    fields.map((f) => [
      f.name,
      seed && f.name in seed ? seed[f.name] : f.type === "checkbox" ? true : "",
    ]),
  );
}

export function AdminForm({
  fields,
  onSubmit,
  submitLabel,
  busyLabel,
  okMsg,
  errMsg,
  onDone,
  initialValues,
  resetOnDone = true,
}: {
  fields: Field[];
  onSubmit: (values: Vals) => Promise<void>;
  submitLabel: string;
  busyLabel: string;
  okMsg: string;
  errMsg: string;
  onDone?: () => void;
  initialValues?: Vals;
  resetOnDone?: boolean;
}) {
  const [vals, setVals] = useState<Vals>(() => initial(fields, initialValues));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  function set(name: string, v: string | boolean) {
    setVals((s) => ({ ...s, [name]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    for (const f of fields) {
      if (f.required && f.type !== "checkbox" && !String(vals[f.name] ?? "").trim()) {
        setNote({ ok: false, msg: errMsg });
        return;
      }
    }
    setBusy(true);
    setNote(null);
    try {
      await onSubmit(vals);
      setNote({ ok: true, msg: okMsg });
      if (resetOnDone) setVals(initial(fields, initialValues));
      onDone?.();
    } catch (e) {
      const detail =
        e && typeof e === "object" && "detail" in e ? String((e as { detail?: string }).detail) : "";
      setNote({ ok: false, msg: detail || errMsg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
      {fields.map((f) =>
        f.type === "user" ? (
          <UserSelect
            key={f.name}
            value={vals[f.name] as string}
            onChange={(v) => set(f.name, v)}
            label={f.label}
            placeholder={f.placeholder ?? ""}
          />
        ) : (
        <div key={f.name} className={f.type === "checkbox" ? "afield--check" : undefined}>
          {f.type === "checkbox" ? (
            <label className="wh__check">
              <input
                type="checkbox"
                checked={vals[f.name] as boolean}
                onChange={(e) => set(f.name, e.target.checked)}
              />
              {f.label}
            </label>
          ) : (
            <>
              <label>{f.label}</label>
              {f.type === "textarea" ? (
                <textarea
                  rows={3}
                  value={vals[f.name] as string}
                  onChange={(e) => set(f.name, e.target.value)}
                  placeholder={f.placeholder}
                />
              ) : f.type === "select" ? (
                <Select
                  value={vals[f.name] as string}
                  onChange={(v) => set(f.name, v)}
                  options={f.options ?? []}
                  ariaLabel={f.label}
                  placeholder={f.placeholder}
                />
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  value={vals[f.name] as string}
                  onChange={(e) => set(f.name, e.target.value)}
                  placeholder={f.placeholder}
                />
              )}
            </>
          )}
        </div>
        ),
      )}
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      <button className="btn btn--pri" type="submit" disabled={busy}>
        {busy ? busyLabel : submitLabel}
      </button>
    </form>
  );
}
