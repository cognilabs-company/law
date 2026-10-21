"use client";

import "../sx-ap3.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import type { SchemaModel } from "../../contract";
import { useStudioLabels } from "../../useStudioLabels";
import { editedFieldNames } from "./diff";

export type EditedFieldsProps = { fields: readonly string[]; model: SchemaModel | null; code: string; aiId: string };

export function EditedFields({ fields, model, code, aiId }: EditedFieldsProps): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const names = editedFieldNames(fields, { model, code, labels, t });
  if (!names.length) return null;
  const lead = t("sx.ap3.tl.changed");
  return (
    <p className="sx-ap3-tl__fields" data-ai-id={aiId} data-ai-type="list" data-ai-label={`${lead}: ${names.join(", ")}`}>
      <span className="sx-ap3-tl__fieldsl">{lead}</span>
      {names.map((n) => (
        <span key={n} className="sx-ap3-tl__field">
          {n}
        </span>
      ))}
    </p>
  );
}
