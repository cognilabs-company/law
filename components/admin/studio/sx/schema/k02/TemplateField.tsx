"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "./sx-k02-template.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { Switch } from "../../form/Switch";
import { firstReferenceInfo } from "../../form/useReferenceOptions";
import { FileQuestionMarkIcon, FileTextIcon, FileXIcon, HourglassIcon, InfoIcon, glyph } from "../../icons";
import { useInlineAccess } from "../../inline/useInlineEditing";
import { SxSegmented, type SxSegItem } from "../../shared/Segmented";
import type { SxValues } from "../../contract";
import { RefPicker } from "../RefPicker";
import { TEMPLATE_ID, TEMPLATE_SKIP, templateModeOf, templateModePatch, templatePatch, type TemplateMode } from "./model";

export type TemplateFieldProps = {
  id: string;
  ai: string;
  root: SxValues;
  source: string;
  errorId?: string;
  invalid: boolean;
  formCode: string;
  recordId: string;
  owner: string;
  categoryId: string;
  serviceId: string;
  onPatch: (patch: Record<string, unknown>) => void;
  onTouch: () => void;
};

type NeedMode = Exclude<TemplateMode, typeof TEMPLATE_SKIP>;
type Pending = { key: string; pending: boolean };

const INLINE_CODE = "K06";
const PENDING = "pending";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function usePendingPick(source: string, value: string): boolean {
  const [state, setState] = useState<Pending | null>(null);
  const key = `${source}|${value}`;
  useEffect(() => {
    if (!source || !value) return;
    let live = true;
    firstReferenceInfo(source).then(
      (page) => {
        const hit = page.items.find((it) => it.value === value);
        if (live) setState({ key, pending: !!hit && str(hit.raw.status).toLowerCase() === PENDING });
      },
      () => {
        if (live) setState({ key, pending: false });
      },
    );
    return () => {
      live = false;
    };
  }, [source, value, key]);
  return !!value && state?.key === key && state.pending;
}

export function TemplateField({ id, ai, root, source, errorId, invalid, formCode, recordId, owner, categoryId, serviceId, onPatch, onTouch }: TemplateFieldProps): ReactElement {
  const t = useTranslations("studio");
  const mode = templateModeOf(root.template_mode);
  const skip = mode === TEMPLATE_SKIP;
  const [remembered, setRemembered] = useState<TemplateMode | "">(skip ? "" : mode);
  const value = str(root[TEMPLATE_ID]);
  const pickId = `${id}-pick`;
  const skipId = `${id}-skip`;
  const modeId = `${id}-mode`;
  const access = useInlineAccess(INLINE_CODE);
  const canUpload = !!owner && access;
  const pending = usePendingPick(skip ? "" : source, value);
  const need: NeedMode | "" = skip ? "" : mode;

  const toggle = (on: boolean) => {
    if (on && mode && mode !== TEMPLATE_SKIP) setRemembered(mode);
    onPatch(templatePatch(root, { skip: on, remembered }));
    onTouch();
  };

  const setNeed = (next: NeedMode) => {
    setRemembered(next);
    onPatch(templateModePatch(next));
    onTouch();
  };

  const needItems: SxSegItem<NeedMode>[] = [
    { value: "required", label: t("sx.opt.template_mode.required"), icon: FileTextIcon, aiId: makeAiId(ai, "mode", "required") },
    { value: "optional", label: t("sx.opt.template_mode.optional"), icon: FileQuestionMarkIcon, aiId: makeAiId(ai, "mode", "optional") },
  ];

  return (
    <div className="sx-k2tpl" data-skip={skip ? "" : undefined} data-ai-id={ai} data-ai-type="section" data-ai-label={t("sx.field.K02__template_mode")}>
      {skip ? (
        <p className="sx-k2tpl__off" role="status">
          {glyph(FileXIcon, { size: 16 })}
          <span>{t("sx.k02.tpl.skipOn")}</span>
        </p>
      ) : (
        <>
          <div className="sx-k2tpl__pick" data-path={TEMPLATE_ID} data-pending={pending ? "" : undefined}>
            <span className="sx-k2tpl__sub" id={`${pickId}-label`}>
              {t("sx.k02.tpl.pick")}
            </span>
            <RefPicker
              a11y={{ id: pickId, "aria-labelledby": `${pickId}-label`, "aria-describedby": [errorId, pending ? `${pickId}-pending` : ""].filter(Boolean).join(" ") || undefined, "aria-invalid": invalid ? true : undefined, "aria-required": true }}
              label={t("sx.k02.tpl.pick")}
              source={source}
              value={value}
              onChange={(v) => {
                onPatch(templatePatch(root, { pick: v ?? "" }));
                onTouch();
              }}
              required
              readOnly={false}
              invalid={invalid}
              placeholder={t("sx.k02.tpl.pickPh")}
              onBlur={onTouch}
              aiId={makeAiId(ai, "pick")}
              code={formCode}
              pattern={TEMPLATE_ID}
              recordId={recordId}
              emptyId={`${pickId}-src`}
              inlineContext={{ categoryId, serviceId }}
              inlineOwner={canUpload ? owner : ""}
              inlineAddKey="sx.k02.tpl.upload"
            />
            {pending ? (
              <p className="sx-k2tpl__pending" id={`${pickId}-pending`} role="status">
                {glyph(HourglassIcon, { size: 14 })}
                <span>{t("sx.k02.tpl.pendingNote")}</span>
              </p>
            ) : (
              <p className="sx-k2tpl__note" id={`${pickId}-note`}>
                {glyph(InfoIcon, { size: 14 })}
                <span>{t(canUpload ? "sx.k02.tpl.help" : "sx.k02.tpl.helpPick")}</span>
              </p>
            )}
          </div>
          <div className="sx-k2tpl__need" role="group" aria-labelledby={`${modeId}-label`} data-ai-id={makeAiId(ai, "mode")} data-ai-type="section" data-ai-label={t("sx.k02.tpl.needLabel")}>
            <span className="sx-k2tpl__sub" id={`${modeId}-label`}>
              {t("sx.k02.tpl.needLabel")}
            </span>
            <SxSegmented<NeedMode> items={needItems} value={need as NeedMode} onChange={setNeed} label={t("sx.k02.tpl.needLabel")} size="sm" aiId={makeAiId(ai, "mode", "seg")} />
            {need ? <p className="sx-k2tpl__help">{t(`sx.optd.template_mode.${need}`)}</p> : null}
          </div>
        </>
      )}
      <div className="sx-k2tpl__skip">
        <Switch id={skipId} checked={skip} onChange={toggle} label={t("sx.k02.tpl.skip")} aria-describedby={`${skipId}-help`} aiId={makeAiId(ai, "skip")} />
        <p className="sx-k2tpl__help" id={`${skipId}-help`}>
          {t("sx.k02.tpl.skipHelp")}
        </p>
      </div>
    </div>
  );
}
