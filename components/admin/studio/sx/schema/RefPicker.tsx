"use client";

import "../sx-core.css";
import "../sx-form.css";
import "./sx-schema.css";
import "./sx-schema-hints.css";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { studioReferenceKey, useStudioRegistry } from "@/lib/services/studio";
import { SxLinkButton } from "../Button";
import { isEligibilitySource, producerOf } from "../ctor/sources";
import { InfoIcon, PlusIcon, TriangleAlertIcon, glyph } from "../icons";
import { Picker } from "../form/Picker";
import { firstReferenceInfo, firstReferencePage, pendingReferenceItem, useReferenceOptions } from "../form/useReferenceOptions";
import type { InlineContext } from "../inline/model";
import { useRefInline } from "../inline/RefInline";
import type { SxControlA11y, SxOption } from "../types";
import { useStudioLabels } from "../useStudioLabels";
import { useCategoryOptions } from "./categoryOptions";
import { isCategorySource } from "./model";

type RefPickerBase = {
  a11y: SxControlA11y;
  label: string;
  source: string;
  required: boolean;
  readOnly: boolean;
  invalid: boolean;
  placeholder?: string;
  onBlur?: () => void;
  aiId?: string;
  code: string;
  pattern: string;
  recordId: string;
  emptyId?: string;
  inlineContext?: InlineContext;
  inlineOwner?: string;
  inlineAddKey?: string;
  // Narrows the offered options (a picked value always stays shown).
  keep?: (value: string) => boolean;
  // The same, judged on the reference row itself (its raw fields) against
  // `keepItemKey`.
  keepItem?: (item: Record<string, unknown>, key: string) => boolean;
  keepItemKey?: string;
};

export type RefPickerProps = RefPickerBase &
  ({ multiple?: false; value: string; onChange: (value: string | undefined) => void } | { multiple: true; value: readonly string[]; onChange: (value: string[]) => void });

// The source's rows by value, for keepItem (the first page, cached).
function useRefRows(source: string): ReadonlyMap<string, Record<string, unknown>> | null {
  const [state, setState] = useState<{ source: string; rows: ReadonlyMap<string, Record<string, unknown>> } | null>(null);
  useEffect(() => {
    if (!source) return;
    let live = true;
    firstReferencePage(source).then(
      (items) => {
        if (live) setState({ source, rows: new Map(items.map((it) => [it.value, it.raw])) });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [source]);
  return state && state.source === source ? state.rows : null;
}

export type SourceEmptyState = { kind: "none" } | { kind: "create"; text: string; link: string; href: string } | { kind: "plain"; text: string };

const NO_CONTEXT: InlineContext = { categoryId: "" };

export function useSourceEmpty(source: string, enabled: boolean, nonce = 0): SourceEmptyState {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const [empty, setEmpty] = useState<{ source: string; empty: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || !source) return;
    let live = true;
    firstReferencePage(source).then(
      (rows) => {
        if (live) setEmpty({ source, empty: rows.length === 0 });
      },
      () => {
        if (live) setEmpty(null);
      },
    );
    return () => {
      live = false;
    };
  }, [source, enabled, nonce]);
  if (!enabled || !empty || empty.source !== source || !empty.empty) return { kind: "none" };
  const producer = producerOf(source, reg.items);
  if (!producer) return { kind: "none" };
  const key = `sx.srcname.${studioReferenceKey(source).key}`;
  if (producer.kind === "notReady") return { kind: "plain", text: t.has(key) ? t("sx.form.emptySource", { name: t(key) }) : t("sx.form.emptyRecords") };
  if (!t.has(key)) return { kind: "none" };
  return { kind: "create", text: t("sx.form.emptySource", { name: t(key) }), link: t("sx.form.createFirst", { name: labels.ctorName(producer.code) }), href: producer.href };
}

export function useMissingRefs(source: string, values: readonly string[], enabled: boolean): boolean {
  const key = values.join("");
  const [state, setState] = useState<{ source: string; key: string; missing: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || !source || !key) return;
    const wanted = key.split("");
    let live = true;
    firstReferenceInfo(source).then(
      async (page) => {
        if (!live) return;
        const complete = !page.hasMore;
        const known = new Set(page.items.map((r) => r.value));
        const unknown = complete ? wanted.filter((v) => !known.has(v)) : [];
        // A record still awaiting approval is not gone, only unpublished.
        const drafts = await Promise.all(unknown.map(pendingReferenceItem));
        if (live) setState({ source, key, missing: drafts.some((d) => !d) });
      },
      () => {
        if (live) setState(null);
      },
    );
    return () => {
      live = false;
    };
  }, [source, key, enabled]);
  return Boolean(enabled && key && state && state.source === source && state.key === key && state.missing);
}

export function SourceEmptyLine({ state, id, aiId }: { state: SourceEmptyState; id?: string; aiId?: string }): ReactElement | null {
  if (state.kind === "none") return null;
  return (
    <p className="sx-sf__srcempty" id={id}>
      <span>{state.text}</span>
      {state.kind === "create" ? (
        <SxLinkButton variant="ghost" size="sm" icon={PlusIcon} href={state.href} aiId={aiId}>
          {state.link}
        </SxLinkButton>
      ) : null}
    </p>
  );
}

export function EligibilityHint({ id, aiId }: { id?: string; aiId?: string }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const reg = useStudioRegistry();
  const producer = producerOf("/studio/reference/package-eligibility-rules", reg.items);
  if (producer?.kind === "create") {
    const name = labels.ctorName(producer.code, reg.items.find((c) => c.code === producer.code)?.title);
    return (
      <p className="sx-sf-elig" id={id}>
        {glyph(InfoIcon, { size: 14 })}
        <span>{t("sx.elig.from", { name })}</span>
        <SxLinkButton variant="ghost" size="sm" icon={PlusIcon} href={producer.href} aiId={aiId ? `${aiId}.create` : undefined}>
          {t("sx.elig.create")}
        </SxLinkButton>
      </p>
    );
  }
  return (
    <p className="sx-sf-elig" id={id}>
      {glyph(InfoIcon, { size: 14 })}
      <span>{t("sx.elig.soon")}</span>
    </p>
  );
}

export function RefPicker(props: RefPickerProps): ReactElement {
  const { a11y, label, source, required, readOnly, invalid, placeholder, onBlur, aiId, code, pattern, recordId, emptyId, inlineContext, inlineOwner, inlineAddKey, keep: keepValue, keepItem, keepItemKey = "" } = props;
  const rows = useRefRows(keepItem ? source : "");
  const keep = useMemo(() => {
    if (!keepItem) return keepValue;
    return (v: string) => {
      if (keepValue && !keepValue(v)) return false;
      const row = rows?.get(v);
      return !rows || !row || keepItem(row, keepItemKey);
    };
  }, [keepValue, keepItem, rows, keepItemKey]);
  const plain = useReferenceOptions(source);
  const tree = isCategorySource(source);
  const cat = useCategoryOptions({ source, selfId: recordId, guardCycle: tree && code.toUpperCase() === "K01" && pattern === "parent_id" });
  const t = useTranslations("studio");
  const picked = props.multiple === true ? props.value : props.value ? [props.value] : [];
  const inline = useRefInline({
    source,
    formCode: code,
    owner: inlineOwner ?? "",
    pattern,
    multiple: props.multiple === true,
    values: picked,
    onChange: (next) => {
      if (props.multiple === true) props.onChange(next);
      else (props.onChange as (value: string | undefined) => void)(next[0] || undefined);
    },
    context: inlineContext ?? NO_CONTEXT,
    enabled: !readOnly && !tree,
    aiId: aiId ?? a11y.id,
    addKey: inlineAddKey,
  });
  const eligibility = isEligibilitySource(source);
  const empty = useSourceEmpty(source, !readOnly && !eligibility, inline?.refresh ?? 0);
  const emptyLine: SourceEmptyState = inline && empty.kind === "create" ? { kind: "plain", text: empty.text } : empty;
  const hintId = `${a11y.id}-elig`;
  const missing = useMissingRefs(source, picked, !tree);
  const missingId = `${a11y.id}-gone`;
  const unfiltered = useMemo(() => {
    if (!tree) return { ...plain, indentOf: undefined };
    const fallback = <T,>(primary: () => Promise<T>, second: () => Promise<T>, signal: AbortSignal) =>
      primary().catch((e: unknown) => {
        if (signal.aborted) throw e;
        return second();
      });
    return {
      loadOptions: (q: string, signal: AbortSignal) => fallback<SxOption[]>(() => cat.loadOptions(q, signal), () => plain.loadOptions(q, signal), signal),
      loadPage: (q: string, offset: number, signal: AbortSignal) => fallback(() => cat.loadPage(q, offset, signal), () => plain.loadPage(q, offset, signal), signal),
      resolveOptions: (v: readonly string[], signal: AbortSignal) => fallback<SxOption[]>(() => cat.resolveOptions(v, signal), () => plain.resolveOptions(v, signal), signal),
      indentOf: cat.indentOf,
      leadingIcon: cat.leadingIcon,
    };
  }, [tree, plain, cat]);
  const binding = useMemo(() => {
    if (!keep) return unfiltered;
    return {
      ...unfiltered,
      loadOptions: async (q: string, signal: AbortSignal) => (await unfiltered.loadOptions(q, signal)).filter((o) => keep(o.value)),
      loadPage: async (q: string, offset: number, signal: AbortSignal) => {
        const page = await unfiltered.loadPage(q, offset, signal);
        return { ...page, options: page.options.filter((o) => keep(o.value)) };
      },
    };
  }, [unfiltered, keep]);
  const emptyText = empty.kind === "none" ? undefined : empty.text;
  const describedBy = [a11y["aria-describedby"], empty.kind !== "none" && emptyId ? emptyId : "", missing ? missingId : "", eligibility && !readOnly ? hintId : ""].filter(Boolean).join(" ") || undefined;
  const common = {
    id: a11y.id,
    label,
    placeholder,
    loadOptions: binding.loadOptions,
    loadPage: binding.loadPage,
    indentOf: binding.indentOf,
    resolveOptions: binding.resolveOptions,
    leadingIcon: binding.leadingIcon,
    searchable: true,
    required,
    readOnly,
    invalid,
    emptyText,
    onBlur,
    "aria-labelledby": a11y["aria-labelledby"],
    "aria-describedby": describedBy,
    "aria-required": a11y["aria-required"],
    "aria-invalid": a11y["aria-invalid"],
    aiId,
    manage: inline?.manage,
    tail: inline?.tail,
  };
  const pickerKey = `picker-${inline?.refresh ?? 0}`;
  return (
    <div className="sx-sf__ref">
      {props.multiple === true ? (
        <Picker key={pickerKey} {...common} multiple value={props.value} onChange={props.onChange} />
      ) : (
        <Picker
          key={pickerKey}
          {...common}
          clearable={!required && !readOnly}
          value={props.value}
          onChange={(v) => {
            const fn = props.onChange as (value: string | undefined) => void;
            fn(v ? v : undefined);
          }}
        />
      )}
      {missing ? (
        <p className="sx-sf__warn" id={missingId}>
          {glyph(TriangleAlertIcon, { size: 14 })}
          <span>{t("sx.err.reference")}</span>
        </p>
      ) : null}
      {readOnly ? null : eligibility ? <EligibilityHint id={hintId} aiId={aiId} /> : <SourceEmptyLine state={emptyLine} id={emptyId} aiId={aiId ? `${aiId}.create` : undefined} />}
      {inline?.drawer ?? null}
    </div>
  );
}
