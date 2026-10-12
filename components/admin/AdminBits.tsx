"use client";

import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import Select from "@/components/Select";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import FieldError from "@/components/ui/FieldError";
import { listLawyers } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";

export function useReload(): [number, () => void] {
  const [k, setK] = useState(0);
  return [k, () => setK((x) => x + 1)];
}

export function Notice({ ok, msg }: { ok: boolean; msg: string }) {
  return (
    <div className={`anote anote--${ok ? "ok" : "err"}`} role={ok ? "status" : "alert"}>
      {msg}
    </div>
  );
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
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  search?: (q: string) => Promise<SearchOption[]>;
  invalid?: boolean;
  describedBy?: string;
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
        invalid={invalid}
        describedBy={describedBy}
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
  const tc = useTranslations("common");
  const uid = useId();
  const nid = `admin-form-${uid}`;
  const form = useRef<HTMLFormElement>(null);
  const [vals, setVals] = useState<Vals>(() => initial(fields, initialValues));
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<Record<string, string>>({});

  function set(name: string, v: string | boolean) {
    setVals((s) => ({ ...s, [name]: v }));
    setBad((b) => {
      if (!(name in b)) return b;
      const next = { ...b };
      delete next[name];
      return next;
    });
  }

  function focusField(name: string) {
    const boxes = form.current ? [...form.current.querySelectorAll<HTMLElement>("[data-field]")] : [];
    const box = boxes.find((el) => el.dataset.field === name);
    box?.querySelector<HTMLElement>("input,textarea,button")?.focus();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const missing: Record<string, string> = {};
    for (const f of fields) {
      if (f.required && f.type !== "checkbox" && !String(vals[f.name] ?? "").trim()) missing[f.name] = tc("required");
    }
    setBad(missing);
    const first = fields.find((f) => f.name in missing);
    if (first) {
      focusField(first.name);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(vals);
      notify.success(okMsg, { id: nid });
      if (resetOnDone) setVals(initial(fields, initialValues));
      onDone?.();
    } catch (err) {
      notify.error(errMsg, { id: nid, error: err });
      if (err instanceof ApiError && err.status === 422) {
        const server: Record<string, string> = {};
        for (const f of fields) if (err.fieldErrors[f.name]) server[f.name] = err.fieldErrors[f.name];
        const hit = fields.find((f) => f.name in server);
        if (hit) {
          setBad(server);
          focusField(hit.name);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
      {fields.map((f) => {
        const err = bad[f.name] ?? "";
        const errId = `${uid}-${f.name}-err`;
        const ctlId = `${uid}-${f.name}`;
        if (f.type === "user")
          return (
            <div key={f.name} data-field={f.name} data-invalid={err ? "true" : undefined}>
              <UserSelect
                value={vals[f.name] as string}
                onChange={(v) => set(f.name, v)}
                label={f.label}
                placeholder={f.placeholder ?? ""}
                invalid={!!err}
                describedBy={err ? errId : undefined}
              />
              <FieldError id={errId} msg={err} />
            </div>
          );
        if (f.type === "checkbox")
          return (
            <div key={f.name} className="afield--check" data-field={f.name}>
              <label className="wh__check">
                <input
                  type="checkbox"
                  checked={vals[f.name] as boolean}
                  onChange={(e) => set(f.name, e.target.checked)}
                />
                {f.label}
              </label>
            </div>
          );
        return (
          <div key={f.name} data-field={f.name} data-invalid={err && f.type === "select" ? "true" : undefined}>
            <label htmlFor={f.type === "select" ? undefined : ctlId}>{f.label}</label>
            {f.type === "textarea" ? (
              <textarea
                id={ctlId}
                rows={3}
                value={vals[f.name] as string}
                onChange={(e) => set(f.name, e.target.value)}
                placeholder={f.placeholder}
                aria-required={f.required || undefined}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? errId : undefined}
              />
            ) : f.type === "select" ? (
              <Select
                value={vals[f.name] as string}
                onChange={(v) => set(f.name, v)}
                options={f.options ?? []}
                ariaLabel={f.label}
                placeholder={f.placeholder}
                invalid={!!err}
                describedBy={err ? errId : undefined}
              />
            ) : (
              <input
                id={ctlId}
                type={f.type === "number" ? "number" : "text"}
                value={vals[f.name] as string}
                onChange={(e) => set(f.name, e.target.value)}
                placeholder={f.placeholder}
                aria-required={f.required || undefined}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? errId : undefined}
              />
            )}
            <FieldError id={errId} msg={err} />
          </div>
        );
      })}
      <button className="btn btn--pri" type="submit" disabled={busy}>
        {busy ? busyLabel : submitLabel}
      </button>
    </form>
  );
}
