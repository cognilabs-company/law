"use client";

import { useCallback, useId } from "react";
import { IconCheck, IconMegaphone } from "@/components/icons";
import type { StudioFieldErrors } from "@/lib/services/studio";
import { STUDIO_ERR, type StudioEditorProps, type StudioPayload } from "./types";
import { EdShell, Fld, SelectIn, TextIn, bool, errIn, normErrors, str, useEd, type Dict } from "./parts/kit";
import RefSelect from "./parts/RefSelect";

const CODE = "K12-PROMO";
const PLACEMENTS = ["banner", "profile_boost", "service_boost"];
const STATUSES = ["active", "inactive"];

// The whole preview object as stored. Packages carry more than the three
// texts edited here — `surface` and `label` say where the promotion shows —
// and rebuilding the object from those three alone wiped the rest on the
// first keystroke.
function previewOf(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Dict) : {};
}

// Where each placement appears, as /promotions/packages names it.
const SURFACE: Record<string, string> = { banner: "marketplace_top_banner", profile_boost: "marketplace_list_card", service_boost: "category_search_sponsored_service" };

// Digits only: Number("7 kun") is NaN, which is saved as null.
const digits = (value: string) => {
  const d = value.replace(/\D/g, "");
  return d === "" ? "" : Number(d);
};

export function emptyPayload(): StudioPayload {
  return { title: "", placement: "service_boost", price: 0, days: 7, boost_score: 1, requires_service: true, requires_banner: false, preview: { title: "", subtitle: "", cta_label: "" }, status: "active" };
}

export function validate(payload: StudioPayload): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  if (!str(payload.title).trim()) out.title = STUDIO_ERR.required;
  if (!PLACEMENTS.includes(str(payload.placement))) out.placement = STUDIO_ERR.required;
  if (!(Number(payload.price) > 0)) out.price = STUDIO_ERR.number;
  if (!(Number(payload.days) > 0)) out.days = STUDIO_ERR.number;
  if (str(payload.boost_score) !== "" && !(Number(payload.boost_score) >= 0)) out.boost_score = STUDIO_ERR.number;
  return out;
}

export default function K12PromoEditor({ payload, onChange, errors, readOnly }: StudioEditorProps) {
  const { e, ctorName } = useEd();
  const uid = useId();
  const errs = normErrors(errors);
  const preview = previewOf(payload.preview);
  const set = (key: string, value: unknown) => onChange({ ...payload, [key]: value });
  const setPreview = (key: string, value: string) => set("preview", { ...preview, [key]: value });
  // A placement decides what the package needs: only a service promotion is
  // tied to a service, and the surface follows the placement unless the admin
  // already set one by hand.
  const setPlacement = (value: string) => {
    const known = Object.values(SURFACE);
    const surface = str(preview.surface);
    onChange({
      ...payload,
      placement: value,
      requires_service: value === "service_boost",
      requires_banner: value === "banner" ? bool(payload.requires_banner) : false,
      preview: { ...preview, surface: !surface || known.includes(surface) ? SURFACE[value] ?? surface : surface },
    });
  };
  const labelBanner = e("k12promo.placements.banner");
  const labelProfile = e("k12promo.placements.profile");
  const labelService = e("k12promo.placements.service");
  const placementName = useCallback(
    (value: string, backendLabel: string) => (value === "banner" ? labelBanner : value === "profile_boost" ? labelProfile : value === "service_boost" ? labelService : backendLabel),
    [labelBanner, labelProfile, labelService],
  );
  const statusLabels: Record<string, string> = { active: e("k12promo.status.active"), inactive: e("k12promo.status.inactive") };
  return (
    <EdShell code={CODE} icon={IconMegaphone} title={ctorName(CODE)} lead={e("k12promo.lead")} errors={errs} known={["title", "placement", "price", "days", "boost_score", "requires_service", "requires_banner", "preview", "status"]}>
      <div className="stu-fe-grid">
        <Fld id={`${uid}-title`} label={e("k12promo.title")} required error={errs.title} wide>
          <TextIn id={`${uid}-title`} value={str(payload.title)} onChange={(value) => set("title", value)} readOnly={readOnly} invalid={Boolean(errs.title)} placeholder={e("k12promo.titlePh")} label={e("k12promo.title")} ai={`${CODE}.title`} />
        </Fld>
        <Fld label={e("k12promo.placement")} required error={errs.placement}>
          {/* GET /studio/reference/promotion-placements (10-09 §7), shown
              under the local names the rest of the product uses. */}
          <RefSelect source="promotion-placements" value={str(payload.placement)} onChange={setPlacement} readOnly={readOnly} label={e("k12promo.placement")} labelOf={placementName} />
        </Fld>
        <Fld id={`${uid}-price`} label={e("k12promo.price")} required error={errs.price} hint={e("k12promo.priceHint")}>
          <TextIn id={`${uid}-price`} value={str(payload.price)} onChange={(value) => set("price", digits(value))} readOnly={readOnly} invalid={Boolean(errs.price)} label={e("k12promo.price")} ai={`${CODE}.price`} />
        </Fld>
        <Fld id={`${uid}-days`} label={e("k12promo.days")} required error={errs.days}>
          <TextIn id={`${uid}-days`} value={str(payload.days)} onChange={(value) => set("days", digits(value))} readOnly={readOnly} invalid={Boolean(errs.days)} label={e("k12promo.days")} ai={`${CODE}.days`} />
        </Fld>
        <Fld id={`${uid}-boost`} label={e("k12promo.boostScore")} hint={e("k12promo.boostHint")} error={errs.boost_score}>
          <TextIn id={`${uid}-boost`} value={str(payload.boost_score)} onChange={(value) => set("boost_score", digits(value))} readOnly={readOnly} label={e("k12promo.boostScore")} ai={`${CODE}.boost_score`} />
        </Fld>
        <Fld label={e("k12promo.statusLabel")}>
          <SelectIn value={str(payload.status) || "active"} onChange={(value) => set("status", value)} options={STATUSES.map((value) => ({ value, label: statusLabels[value] }))} readOnly={readOnly} label={e("k12promo.statusLabel")} ai={`${CODE}.status`} />
        </Fld>
      </div>
      <div className="stu-checks-row">
        {[{ key: "requires_service", label: e("k12promo.requiresService") }, { key: "requires_banner", label: e("k12promo.requiresBanner") }].map((item) => (
          <label className="stu-check" key={item.key}>
            <input type="checkbox" checked={bool(payload[item.key])} onChange={(event) => set(item.key, event.target.checked)} disabled={readOnly} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      <section className="stu-promo-preview">
        <div className="stu-promo-preview__head"><span><IconMegaphone />{e("k12promo.preview")}</span><small>{e("k12promo.previewHint")}</small></div>
        <div className="stu-fe-grid">
          <Fld label={e("k12promo.previewTitle")}><TextIn value={str(preview.title)} onChange={(value) => setPreview("title", value)} readOnly={readOnly} label={e("k12promo.previewTitle")} ai={`${CODE}.preview.title`} /></Fld>
          <Fld label={e("k12promo.previewSubtitle")}><TextIn value={str(preview.subtitle)} onChange={(value) => setPreview("subtitle", value)} readOnly={readOnly} label={e("k12promo.previewSubtitle")} ai={`${CODE}.preview.subtitle`} /></Fld>
          <Fld label={e("k12promo.previewCta")} wide><TextIn value={str(preview.cta_label)} onChange={(value) => setPreview("cta_label", value)} readOnly={readOnly} label={e("k12promo.previewCta")} ai={`${CODE}.preview.cta`} /></Fld>
        </div>
        <div className="stu-promo-preview__card"><b>{str(preview.title) || e("k12promo.previewEmpty")}</b><span>{str(preview.subtitle) || e("k12promo.previewSubtitleEmpty")}</span>{str(preview.cta_label) ? <em><IconCheck />{str(preview.cta_label)}</em> : null}</div>
      </section>
      {errIn(errs, "preview") ? <p className="stu-ferr" role="alert">{errIn(errs, "preview")}</p> : null}
    </EdShell>
  );
}
