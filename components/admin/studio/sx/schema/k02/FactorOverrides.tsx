"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "./sx-k02.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { notify } from "@/lib/toast";
import { SxButton } from "../../Button";
import type { SxFormPolicy } from "../../form/formPolicy";
import { MoneyInput } from "../../form/MoneyInput";
import { NumberInput } from "../../form/NumberInput";
import { dropReferenceCache, firstReferenceInfo, pendingReferenceItem } from "../../form/useReferenceOptions";
import { CircleAlertIcon, ClockIcon, CoinsIcon, PencilIcon, PercentIcon, glyph } from "../../icons";
import { useInlineDepth } from "../../inline/context";
import { PendingChips } from "../../inline/PendingChips";
import { useInlineEditing } from "../../inline/useInlineEditing";
import { SxSegmented, type SxSegItem } from "../../shared/Segmented";
import type { SxErrors } from "../../types";
import { useStudioLabels } from "../../useStudioLabels";
import { FACTOR_OVERRIDES, PERCENT_MAX, errorsUnder, modeOf, overrideValueOf, sharedFactorOf, switchMode, withOverride, type OverrideMode, type SharedFactor } from "./model";

// A selected factor as the form shows it: its name and shared setting from
// the published list, or from its draft while it awaits approval.
type Info = { label: string; shared: SharedFactor; pending: boolean };
type Loaded = { key: string; map: Readonly<Record<string, Info>> };

export type FactorOverridesProps = {
  id: string;
  label: string;
  ai: string;
  readOnly: boolean;
  source: string;
  ids: readonly string[];
  value: unknown;
  path?: string;
  pattern?: string;
  errors: SxErrors;
  policy: SxFormPolicy;
  onChange: (next: Record<string, unknown>) => void;
  onDraftError?: (path: string, invalid: boolean) => void;
  formCode: string;
  owner: string;
  categoryId: string;
  forPackage?: boolean;
};

const NO_SHARED: SharedFactor = { type: "", value: null };

export function FactorOverrides({ id, label, ai, readOnly, source, ids, value, path = FACTOR_OVERRIDES, pattern = FACTOR_OVERRIDES, errors, policy, onChange, onDraftError, formCode, owner, categoryId, forPackage = false }: FactorOverridesProps): ReactElement | null {
  const t = useTranslations("studio");
  const own = !forPackage ? "sx.k02.fo" : path.includes(".") ? "sx.k02.fo.t" : "sx.k02.fo.p";
  const labels = useStudioLabels();
  const depth = useInlineDepth();
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const idsKey = ids.join(",");
  const loadKey = `${source}#${nonce}#${idsKey}`;

  useEffect(() => {
    if (!source) return;
    let live = true;
    const key = `${source}#${nonce}#${idsKey}`;
    const want = idsKey ? idsKey.split(",") : [];
    const load = async (): Promise<Record<string, Info>> => {
      const map: Record<string, Info> = {};
      const page = await firstReferenceInfo(source).catch(() => null);
      for (const it of page?.items ?? []) map[it.value] = { label: labels.refOption(source, it).label, shared: sharedFactorOf(it.raw), pending: false };
      const missing = want.filter((fid) => !map[fid]);
      const drafts = await Promise.all(missing.map(pendingReferenceItem));
      drafts.forEach((it, i) => {
        if (it) map[missing[i]] = { label: it.label, shared: sharedFactorOf(it.raw), pending: true };
      });
      return map;
    };
    void load().then((map) => {
      if (live) setLoaded({ key, map });
    });
    return () => {
      live = false;
    };
  }, [source, nonce, idsKey, labels]);

  const ed = useInlineEditing({
    code: "K34",
    formCode,
    owner,
    pattern,
    context: { categoryId },
    enabled: !readOnly && depth === 0 && !!owner,
    onPublished: (item) => {
      dropReferenceCache(source);
      setNonce((n) => n + 1);
      notify.success(t("sx.inline.toast.updated", { name: item.title || t("sx.ui.untitled") }));
    },
  });

  if (!ids.length) return null;
  const map = loaded && loaded.key === loadKey ? loaded.map : loaded?.map ?? {};

  const amount = (type: string, v: number): string => (type === "percent" ? `+${labels.num(v)}%` : `+${labels.money(v)}`);
  const sharedText = (s: SharedFactor): string => {
    if (s.value === null || !s.type) return t("sx.k02.fo.sharedUnknown");
    return t("sx.k02.fo.sharedIs", { value: amount(s.type, s.value) });
  };
  const typeText = (type: string): string => (type ? labels.option(type, { field: "adjustment_type" }) : t("sx.k02.fo.typeUnknown"));
  // What the factor adds in this service: the shared setting, or the value
  // set here.
  const effectiveOf = (mode: OverrideMode, mine: number | undefined, s: SharedFactor): { text: string; type: string } => {
    if (mode !== "shared") return mine === undefined ? { text: "—", type: mode } : { text: amount(mode, mine), type: mode };
    return s.value === null || !s.type ? { text: "—", type: "" } : { text: amount(s.type, s.value), type: s.type };
  };
  const ownText = (mode: OverrideMode, v: number | undefined): string => {
    if (mode === "shared" || v === undefined) return "";
    return t(`${own}.own`, { value: mode === "percent" ? `+${labels.num(v)}%` : `+${labels.money(v)}` });
  };
  const errText = (tok: string, path: string): string => labels.error(tok, { type: "number", key: "value", ctor: formCode, path, min: 0, max: null });

  return (
    <div className="sx-k2fo" id={id} data-ai-id={ai} data-ai-type="section" data-ai-label={label}>
      <ul className="sx-k2fo__list" aria-label={t("sx.k02.fo.listLabel")}>
        {ids.map((fid, n) => {
          const info = map[fid];
          const ready = !!loaded;
          const name = info?.label || (ready ? t("sx.k02.fo.missing") : t("sx.ui.loading"));
          const shared = info?.shared ?? NO_SHARED;
          const mode = modeOf(value, fid);
          const mine = overrideValueOf(value, fid);
          const effective = effectiveOf(mode, mine, shared);
          const rowPath = `${path}.${fid}`;
          const valuePath = `${rowPath}.value`;
          const base = `${id}-${fid}`;
          const nameId = `${base}-name`;
          const errId = `${base}-err`;
          const rowAi = makeAiId(ai, fid);
          const shown = errorsUnder(errors, rowPath)
            .map(([k, tok]) => [k, policy.visible(k, errors) ? tok : ""] as const)
            .filter(([, tok]) => !!tok);
          const valueBad = shown.some(([k]) => k === valuePath);
          const items: SxSegItem<OverrideMode>[] = [
            { value: "shared", label: t("sx.k02.fo.shared"), aiId: makeAiId(rowAi, "shared") },
            { value: "fixed", label: t("sx.k02.fo.fixed"), icon: CoinsIcon, aiId: makeAiId(rowAi, "fixed") },
            { value: "percent", label: t("sx.k02.fo.percent"), icon: PercentIcon, aiId: makeAiId(rowAi, "percent") },
          ];
          const setValue = (v: number | undefined) => {
            onChange(withOverride(value, fid, mode, v ?? null));
            policy.touch(valuePath);
          };
          const pick = (m: OverrideMode) => {
            onChange(switchMode(value, fid, m));
            if (m === "shared") return;
            requestAnimationFrame(() => {
              const el = document.getElementById(`${base}-value`);
              if (el instanceof HTMLInputElement) el.focus();
            });
          };
          return (
            <li
              key={fid}
              className="sx-k2fo__row"
              data-path={rowPath}
              data-mode={mode}
              data-type={shared.type || undefined}
              data-missing={ready && !info ? "" : undefined}
              aria-labelledby={nameId}
              data-ai-id={rowAi}
              data-ai-type="item"
              data-ai-label={name}
            >
              <div className="sx-k2fo__head">
                <span className="sx-k2fo__num" aria-hidden="true">
                  {n + 1}
                </span>
                <div className="sx-k2fo__id">
                  <span className="sx-k2fo__name" id={nameId}>
                    <span className="sx-vh">{t("sx.k02.fo.nth", { n: n + 1 })} </span>
                    {name}
                  </span>
                  <span className="sx-k2fo__chips">
                    <span className="sx-k2fo__chip sx-k2fo__type" data-type={shared.type || undefined}>
                      {glyph(shared.type === "percent" ? PercentIcon : CoinsIcon, { size: 13 })}
                      {typeText(shared.type)}
                    </span>
                    <span className="sx-k2fo__chip sx-k2fo__shared" data-off={mode !== "shared" ? "" : undefined}>
                      {sharedText(shared)}
                    </span>
                    {info?.pending ? (
                      <span className="sx-k2fo__chip sx-k2fo__pending">
                        {glyph(ClockIcon, { size: 13 })}
                        {t("sx.k02.fo.pending")}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="sx-k2fo__eff" data-own={mode !== "shared" ? "" : undefined}>
                  <span className="sx-k2fo__eff-k">{t(`${own}.effective`)}</span>
                  <strong className="sx-k2fo__eff-v">{effective.text}</strong>
                </div>
              </div>
              {readOnly ? (
                <p className="sx-k2fo__ro">{mode === "shared" ? t("sx.k02.fo.usesShared") : ownText(mode, mine) || t("sx.ui.notSet")}</p>
              ) : (
                <div className="sx-k2fo__ctl">
                  <SxSegmented<OverrideMode> items={items} value={mode} onChange={pick} label={t(`${own}.modeLabel`, { name })} size="sm" aiId={makeAiId(rowAi, "mode")} />
                  {mode !== "shared" ? (
                    <div className="sx-k2fo__val" data-path={valuePath}>
                      {mode === "fixed" ? (
                        <MoneyInput
                          id={`${base}-value`}
                          value={mine}
                          onChange={setValue}
                          onDraftInvalid={(bad) => onDraftError?.(valuePath, bad)}
                          onBlur={() => policy.touch(valuePath)}
                          aria-label={t(`${own}.valueLabel`, { name })}
                          aria-describedby={valueBad ? errId : undefined}
                          aria-invalid={valueBad ? true : undefined}
                          aria-required
                          aiId={makeAiId(rowAi, "value")}
                        />
                      ) : (
                        <NumberInput
                          id={`${base}-value`}
                          value={mine}
                          onChange={setValue}
                          onDraftInvalid={(bad) => onDraftError?.(valuePath, bad)}
                          onBlur={() => policy.touch(valuePath)}
                          min={0}
                          max={PERCENT_MAX}
                          suffix="%"
                          placeholder={t("sx.k02.fo.percentHint")}
                          aria-label={t(`${own}.valueLabel`, { name })}
                          aria-describedby={valueBad ? errId : undefined}
                          aria-invalid={valueBad ? true : undefined}
                          aria-required
                          aiId={makeAiId(rowAi, "value")}
                        />
                      )}
                    </div>
                  ) : null}
                  {ed.canManage ? (
                    <SxButton
                      variant="ghost"
                      size="sm"
                      icon={PencilIcon}
                      className="sx-k2fo__edit"
                      onClick={() => ed.openEdit(fid, name)}
                      aria-label={t("sx.k02.fo.editSharedOf", { name })}
                      aiId={makeAiId(rowAi, "edit-shared")}
                    >
                      {t("sx.k02.fo.editShared")}
                    </SxButton>
                  ) : null}
                </div>
              )}
              {shown.length ? (
                <div className="sx-k2fo__errs" id={errId}>
                  {shown.map(([k, tok]) => (
                    <p key={k} className="sx-field__err" data-path={k === valuePath ? undefined : k}>
                      {glyph(CircleAlertIcon, { size: 14 })}
                      <span>{errText(tok === "@code:maximum" && mode === "percent" ? `@code:maximum:${PERCENT_MAX}` : tok, k)}</span>
                    </p>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {ed.canManage ? <PendingChips items={ed.pending} label={t("sx.inline.pendingList")} canEdit onOpen={ed.openPending} ai={ai} /> : null}
      {ed.drawer}
    </div>
  );
}
