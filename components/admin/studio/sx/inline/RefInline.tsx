"use client";

import "../sx-core.css";
import "./sx-inline.css";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/toast";
import { SxButton } from "../Button";
import { inlineCodeOf } from "../ctor/sources";
import type { PickerManage } from "../form/Picker";
import { dropReferenceCache } from "../form/useReferenceOptions";
import { PlusIcon } from "../icons";
import { useInlineDepth } from "./context";
import { inlineKeys, inlineKindOf, mergeValue, pendingPick, picksPending, publishedPick, type InlineContext, type InlinePending } from "./model";
import { PendingChips } from "./PendingChips";
import { useInlineEditing } from "./useInlineEditing";

export type RefInline = { manage: PickerManage; tail: ReactNode; drawer: ReactElement | null; refresh: number; noun: string };

type Args = {
  source: string;
  formCode: string;
  owner: string;
  pattern: string;
  multiple: boolean;
  values: readonly string[];
  onChange: (next: string[]) => void;
  context: InlineContext;
  enabled: boolean;
  aiId: string;
  addKey?: string;
};

export function useRefInline({ source, formCode, owner, pattern, multiple, values, onChange, context, enabled, aiId, addKey }: Args): RefInline | null {
  const t = useTranslations("studio");
  const depth = useInlineDepth();
  const code = inlineCodeOf(source, pattern);
  const on = enabled && depth === 0 && !!code && !!owner;
  const [refresh, setRefresh] = useState(0);
  const valuesRef = useRef(values);
  const changeRef = useRef(onChange);
  useEffect(() => {
    valuesRef.current = values;
    changeRef.current = onChange;
  });

  const kind = inlineKindOf(code);
  const keepsPending = picksPending(kind);

  const onPublished = (item: InlinePending, runtimeId: string) => {
    dropReferenceCache(source);
    setRefresh((n) => n + 1);
    const name = item.title || t("sx.ui.untitled");
    if (!runtimeId) {
      notify.info(t("sx.inline.toast.published", { name }));
      return;
    }
    const cur = valuesRef.current;
    if (item.isNew) {
      const next = keepsPending ? publishedPick(multiple, cur, item, runtimeId) : mergeValue(multiple, cur, runtimeId);
      if (next) changeRef.current(next);
      notify.success(t(next ? "sx.inline.toast.selected" : "sx.inline.toast.published", { name }));
      return;
    }
    if (item.value && runtimeId !== item.value && cur.includes(item.value)) changeRef.current(cur.map((v) => (v === item.value ? runtimeId : v)));
    notify.success(t("sx.inline.toast.updated", { name }));
  };

  const onSettled = (item: InlinePending) => {
    if (!keepsPending) return;
    const next = pendingPick(multiple, valuesRef.current, item);
    if (!next) return;
    dropReferenceCache(source);
    setRefresh((n) => n + 1);
    changeRef.current(next);
    notify.success(t("sx.inline.toast.pendingSelected", { name: item.title || t("sx.ui.untitled") }));
  };

  // A new record whose name is taken: the existing one is picked instead.
  const onPickExisting = (value: string, title: string) => {
    const next = mergeValue(multiple, valuesRef.current, value);
    changeRef.current(next);
    notify.success(t("sx.rtw.picked", { name: title || t("sx.ui.untitled") }));
  };

  const ed = useInlineEditing({ code, formCode, owner, pattern, context, enabled: on, onPublished, onSettled, onPickExisting });
  if (!on || !kind || !ed.canManage) return null;
  const k = inlineKeys(kind);
  const add = addKey && t.has(addKey) ? t(addKey) : t(k.add);
  const manage: PickerManage = {
    editLabel: (name) => t("sx.inline.editOf", { name }),
    onEdit: (value, label) => ed.openEdit(value, label),
    createLabel: (q) => (q.trim() ? t("sx.inline.addQuery", { add, q: q.trim() }) : add),
    onCreate: (q) => ed.openNew(q),
  };
  const tail = (
    <div className="sx-inl-tail" data-ai-id={`${aiId}.inline`} data-ai-type="section" data-ai-label={add}>
      <PendingChips items={ed.pending} label={t("sx.inline.pendingList")} canEdit onOpen={ed.openPending} ai={aiId} />
      <SxButton variant="ghost" size="sm" icon={PlusIcon} className="sx-inl-add" onClick={() => ed.openNew("")} aiId={`${aiId}.inline.add`}>
        {add}
      </SxButton>
    </div>
  );
  return { manage, tail, drawer: ed.drawer, refresh, noun: add };
}
