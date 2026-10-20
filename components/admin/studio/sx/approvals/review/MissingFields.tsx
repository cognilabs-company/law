"use client";

import "../../sx-core.css";
import "../../sx-layout.css";
import "./sx-review-missing.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { SchemaModel } from "../../contract";
import { SxNote } from "../../layout/Note";
import { labelTrail } from "../../schema/model";
import { useStudioLabels } from "../../useStudioLabels";

const MAX_SHOWN = 12;

export type MissingFieldsProps = {
  model: SchemaModel;
  paths: readonly string[];
  aiId: string;
  lead: string;
  hrefOf?: (path: string) => string;
  onPick?: (path: string) => void;
  className?: string;
};

export function MissingFields({ model, paths, aiId, lead, hrefOf, onPick, className }: MissingFieldsProps): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  if (!paths.length) return null;
  const title = t("sx.ap4.miss.title", { n: paths.length });
  const list = paths.slice(0, MAX_SHOWN);
  const more = paths.length - list.length;
  return (
    <div className={className ? `sx-miss ${className}` : "sx-miss"} data-ai-id={aiId} data-ai-type="section" data-ai-label={title}>
      <SxNote tone="error" role="note" title={title}>
        <p className="sx-miss__lead">{lead}</p>
        <ul className="sx-miss__list">
          {list.map((path, i) => {
            const label = labelTrail(model, path, labels, t);
            const ai = `${aiId}.field.${i}`;
            return (
              <li key={path}>
                {hrefOf ? (
                  <Link className="sx-miss__chip" href={hrefOf(path)} data-ai-id={ai} data-ai-type="link" data-ai-label={label}>
                    {label}
                  </Link>
                ) : (
                  <button type="button" className="sx-miss__chip" onClick={() => onPick?.(path)} data-ai-id={ai} data-ai-type="button" data-ai-label={label}>
                    {label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {more > 0 ? <p className="sx-miss__more">{t("sx.ui.andMore", { n: more })}</p> : null}
      </SxNote>
    </div>
  );
}
