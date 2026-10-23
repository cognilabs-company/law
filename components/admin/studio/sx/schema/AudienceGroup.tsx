"use client";

import "./sx-audience.css";
import type { ReactElement, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BriefcaseBusiness, Globe, LockKeyhole, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import type { SchemaFieldModel, SchemaModel, SxEditMode, SxValues } from "../contract";
import { fieldVisible } from "@/lib/studioSchema";
import { layoutCtx } from "./model";
import { FormGrid } from "../form/Field";
import { BUCKET_ORDER, audienceOfField, bucketOf, type AudienceBucket } from "./audience";

// A form section that mixes readers is split into one block per reader —
// what the client sees, what both sides see, what only the performer sees,
// what stays internal — so nobody writes performer guidance where the client
// will read it. A section for one reader stays as it is.

export const BUCKET_ICON: Readonly<Record<AudienceBucket, LucideIcon>> = {
  public: Globe,
  client: UserRound,
  shared: UsersRound,
  performer: BriefcaseBusiness,
  internal: LockKeyhole,
};

type Group = { bucket: AudienceBucket; fields: SchemaFieldModel[] };

// Whether the form shows a field at all (hidden by layout, a condition, or
// an old field left empty), so a group never ends up as an empty box.
export function fieldShown(model: SchemaModel, fm: SchemaFieldModel, payload: SxValues, mode: SxEditMode = "edit", recordId = ""): boolean {
  const lf = fm.layout;
  if (lf?.hidden) return false;
  if (fm.field && !fieldVisible(fm.field, payload as Record<string, unknown>)) return false;
  if (lf?.visible && !lf.visible(layoutCtx(model, payload, payload, mode, recordId))) return false;
  if (lf?.legacyOf && model.ctor.typed.some((x) => x.key === lf.legacyOf)) {
    const v = payload[fm.key];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return false;
  }
  return true;
}

export function audienceGroups(model: SchemaModel, fields: readonly SchemaFieldModel[], payload: SxValues): Group[] | null {
  const code = model.code;
  // The service's rules section is already split by side (RuleAudienceBoard).
  if (code.toUpperCase() === "K02" && fields.some((f) => f.pattern === "rule_ids")) return null;
  const by = new Map<AudienceBucket, SchemaFieldModel[]>();
  const loose: SchemaFieldModel[] = [];
  let last: AudienceBucket | null = null;
  for (const fm of fields) {
    if (!fieldShown(model, fm, payload)) {
      loose.push(fm);
      continue;
    }
    const b = bucketOf(audienceOfField(code, fm.pattern, payload, payload)?.who);
    // A field nobody has claimed stays with the field before it.
    const home: AudienceBucket | null = b ?? last;
    if (!home) {
      loose.push(fm);
      continue;
    }
    last = home;
    by.set(home, [...(by.get(home) ?? []), fm]);
  }
  if (by.size < 2) return null;
  const out = BUCKET_ORDER.filter((b) => by.has(b)).map((b) => ({ bucket: b, fields: by.get(b) ?? [] }));
  if (loose.length) out[0] = { ...out[0], fields: [...loose, ...out[0].fields] };
  return out;
}

export function AudienceGroup({ bucket, id, children }: { bucket: AudienceBucket; id: string; children: ReactNode }): ReactElement {
  const t = useTranslations("studio");
  const Icon = BUCKET_ICON[bucket];
  return (
    <div className="sx-agrp" data-who={bucket} role="group" aria-labelledby={`${id}-h`} aria-describedby={`${id}-d`}>
      <div className="sx-agrp__head">
        <span className="sx-agrp__badge" aria-hidden="true">
          <Icon size={16} strokeWidth={2.1} />
        </span>
        <span className="sx-agrp__text">
          <strong id={`${id}-h`}>{t(`sx.agrp.${bucket}.title`)}</strong>
          <span id={`${id}-d`}>{t(`sx.agrp.${bucket}.lead`)}</span>
        </span>
      </div>
      <div className="sx-agrp__body">
        <FormGrid>{children}</FormGrid>
      </div>
    </div>
  );
}
