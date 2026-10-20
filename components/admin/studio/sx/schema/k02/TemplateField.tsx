"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "./sx-k02-template.css";
import { useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { aiId as makeAiId } from "@/lib/ai/ids";
import { Switch } from "../../form/Switch";
import { FileXIcon, InfoIcon, glyph } from "../../icons";
import type { SxValues } from "../../contract";
import { RefPicker } from "../RefPicker";
import { TEMPLATE_ID, TEMPLATE_SKIP, templateModeOf, templatePatch, type TemplateMode } from "./model";

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

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function TemplateField({ id, ai, root, source, errorId, invalid, formCode, recordId, owner, categoryId, serviceId, onPatch, onTouch }: TemplateFieldProps): ReactElement {
  const t = useTranslations("studio");
  const mode = templateModeOf(root.template_mode);
  const skip = mode === TEMPLATE_SKIP;
  const [remembered, setRemembered] = useState<TemplateMode | "">(skip ? "" : mode);
  const value = str(root[TEMPLATE_ID]);
  const pickId = `${id}-pick`;
  const skipId = `${id}-skip`;
  const canUpload = !!serviceId && !!owner;

  const toggle = (on: boolean) => {
    if (on && mode && mode !== TEMPLATE_SKIP) setRemembered(mode);
    onPatch(templatePatch(root, { skip: on, remembered }));
    onTouch();
  };

  return (
    <div className="sx-k2tpl" data-skip={skip ? "" : undefined} data-ai-id={ai} data-ai-type="section" data-ai-label={t("sx.field.K02__template_mode")}>
      {skip ? (
        <p className="sx-k2tpl__off" role="status">
          {glyph(FileXIcon, { size: 16 })}
          <span>{t("sx.k02.tpl.skipOn")}</span>
        </p>
      ) : (
        <div className="sx-k2tpl__pick" data-path={TEMPLATE_ID}>
          <span className="sx-k2tpl__sub" id={`${pickId}-label`}>
            {t("sx.k02.tpl.pick")}
          </span>
          <RefPicker
            a11y={{ id: pickId, "aria-labelledby": `${pickId}-label`, "aria-describedby": errorId, "aria-invalid": invalid ? true : undefined, "aria-required": true }}
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
          <p className="sx-k2tpl__note" id={`${pickId}-note`}>
            {glyph(InfoIcon, { size: 14 })}
            <span>{t(canUpload ? "sx.k02.tpl.help" : "sx.k02.tpl.noService")}</span>
          </p>
        </div>
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
