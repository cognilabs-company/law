"use client";

import { useCallback, useId, useState } from "react";
import { IconArrowRight, IconMegaphone, IconStar } from "@/components/icons";
import { loadStudioReference, type StudioFieldErrors } from "@/lib/services/studio";
import type { MarketPromotionSurface } from "@/lib/services/marketplace";
import { PromoBanner } from "@/components/marketplace/PromotionSurfaces";
import { STUDIO_ERR, type StudioEditorProps, type StudioPayload } from "./types";
import { ED_ERR, EdShell, Fld, SelectIn, TextIn, bool, errIn, normErrors, slugify, str, useEd, type Dict } from "./parts/kit";
import RefSelect from "./parts/RefSelect";

const CODE = "K12-PROMO";
const PLACEMENTS = ["banner", "profile_boost", "service_boost"];
const STATUSES = ["active", "inactive", "archived"];
const CODE_RE = /^[a-z0-9][a-z0-9_-]*$/;

// The whole preview object as stored. Packages carry more than the texts
// edited here, and rebuilding the object from those alone wiped the rest on
// the first keystroke.
function previewOf(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Dict) : {};
}

// Where each placement appears, as the packages in /promotions/packages name
// it. The placement list uses longer names for the same surfaces; both count
// as "not set by hand" when the placement changes.
const SURFACE: Record<string, string> = { banner: "marketplace_top_banner", profile_boost: "marketplace_list", service_boost: "category_search" };
const KNOWN_SURFACES = new Set([...Object.values(SURFACE), "marketplace_list_card", "category_search_sponsored_service"]);

// Digits only: Number("7 kun") is NaN, which is saved as null.
const digits = (value: string) => {
  const d = value.replace(/\D/g, "");
  return d === "" ? "" : Number(d);
};
const codeOf = (title: string) => slugify(title).replace(/_/g, "-").slice(0, 48);

export function emptyPayload(): StudioPayload {
  return { package_id: "", code: "", title: "", placement: "service_boost", price: 0, days: 7, boost_score: 1, requires_service: true, requires_banner: false, preview: { surface: SURFACE.service_boost, label: "", title: "", subtitle: "", cta_label: "" }, status: "active" };
}

export function validate(payload: StudioPayload): StudioFieldErrors {
  const out: StudioFieldErrors = {};
  const code = str(payload.code).trim();
  if (!code) out.code = STUDIO_ERR.required;
  else if (!CODE_RE.test(code)) out.code = ED_ERR.code;
  if (!str(payload.title).trim()) out.title = STUDIO_ERR.required;
  if (!PLACEMENTS.includes(str(payload.placement))) out.placement = STUDIO_ERR.required;
  if (str(payload.price) === "" || !(Number(payload.price) >= 0)) out.price = STUDIO_ERR.number;
  if (!(Number(payload.days) > 0)) out.days = STUDIO_ERR.number;
  if (str(payload.boost_score) !== "" && !(Number(payload.boost_score) >= 0)) out.boost_score = STUDIO_ERR.number;
  return out;
}

export default function K12PromoEditor({ payload, onChange, errors, readOnly }: StudioEditorProps) {
  const { e, ctorName, num } = useEd();
  const uid = useId();
  const errs = normErrors(errors);
  const preview = previewOf(payload.preview);
  // The code follows the title until the admin types one of their own.
  const [codeTouched, setCodeTouched] = useState(() => Boolean(str(payload.code).trim()));
  const set = (key: string, value: unknown) => onChange({ ...payload, [key]: value });
  const setPreview = (key: string, value: string) => set("preview", { ...preview, [key]: value });
  const setTitle = (value: string) => onChange({ ...payload, title: value, ...(codeTouched ? {} : { code: codeOf(value) }) });
  // A placement decides what the package needs: only a service promotion is
  // tied to a service, and the surface follows the placement unless the admin
  // already set one by hand.
  const setPlacement = (value: string) => {
    const surface = str(preview.surface);
    onChange({
      ...payload,
      placement: value,
      requires_service: value === "service_boost",
      requires_banner: value === "banner" ? bool(payload.requires_banner) : false,
      preview: { ...preview, surface: !surface || KNOWN_SURFACES.has(surface) ? (SURFACE[value] ?? surface) : surface },
    });
  };
  // Editing an existing package (package_id): its current values fill the
  // form, so a publish updates it instead of starting from a blank one.
  const pickPackage = async (id: string) => {
    if (!id) {
      set("package_id", "");
      return;
    }
    const rows = await loadStudioReference("promotion-packages", "", 100).catch(() => []);
    const r = rows.find((x) => x.value === id)?.raw;
    if (!r) {
      set("package_id", id);
      return;
    }
    const p = previewOf(r.preview);
    setCodeTouched(true);
    onChange({
      ...payload,
      package_id: id,
      code: str(r.code) || str(payload.code),
      title: str(r.title) || str(payload.title),
      placement: PLACEMENTS.includes(str(r.placement)) ? str(r.placement) : str(payload.placement),
      price: Number(r.price ?? payload.price) || 0,
      days: Number(r.days ?? payload.days) || 7,
      boost_score: Number(r.boost_score ?? payload.boost_score) || 0,
      requires_service: bool(r.requires_service),
      requires_banner: bool(r.requires_banner),
      preview: { ...preview, ...p },
      status: STATUSES.includes(str(r.status)) ? str(r.status) : str(payload.status) || "active",
    });
  };
  const labelBanner = e("k12promo.placements.banner");
  const labelProfile = e("k12promo.placements.profile");
  const labelService = e("k12promo.placements.service");
  const placementName = useCallback(
    (value: string, backendLabel: string) => (value === "banner" ? labelBanner : value === "profile_boost" ? labelProfile : value === "service_boost" ? labelService : backendLabel),
    [labelBanner, labelProfile, labelService],
  );
  const statusLabels: Record<string, string> = { active: e("k12promo.status.active"), inactive: e("k12promo.status.inactive"), archived: e("k12promo.status.archived") };
  const placement = str(payload.placement);
  const badge = str(preview.label) || e("k12promo.previewBadge");
  const title = str(preview.title) || str(payload.title) || e("k12promo.previewEmpty");
  const subtitle = str(preview.subtitle) || e("k12promo.previewSubtitleEmpty");
  const banner: MarketPromotionSurface = {
    id: "preview",
    placement: "banner",
    sellerUserId: "",
    sellerName: e("k12promo.previewSeller"),
    serviceId: "",
    serviceTitle: "",
    title,
    subtitle,
    ctaLabel: str(preview.cta_label) || e("k12promo.previewCtaDefault"),
    ctaUrl: "",
    imageUrl: "",
    boostScore: Number(payload.boost_score) || 0,
    isSponsored: true,
    bannerMode: "profile_card",
    daysLeft: -1,
    seller: { rating: 4.9, reviews: 24, verified: true, type: "", specialization: "", region: "", experience: 8, headline: "" },
  };
  return (
    <EdShell code={CODE} icon={IconMegaphone} title={ctorName(CODE)} lead={e("k12promo.lead")} errors={errs} known={["package_id", "code", "title", "placement", "price", "days", "boost_score", "requires_service", "requires_banner", "preview", "status"]}>
      <div className="stu-fe-grid">
        <Fld label={e("k12promo.package")} hint={e("k12promo.packageHint")} wide>
          {/* GET /studio/reference/promotion-packages (10-09 §7). */}
          <RefSelect source="promotion-packages" value={str(payload.package_id)} onChange={(v) => void pickPackage(v)} readOnly={readOnly} label={e("k12promo.package")} />
        </Fld>
        <Fld id={`${uid}-title`} label={e("k12promo.title")} required error={errs.title}>
          <TextIn id={`${uid}-title`} value={str(payload.title)} onChange={setTitle} readOnly={readOnly} invalid={Boolean(errs.title)} placeholder={e("k12promo.titlePh")} label={e("k12promo.title")} ai={`${CODE}.title`} />
        </Fld>
        <Fld id={`${uid}-code`} label={e("k12promo.code")} required error={errs.code} hint={e("k12promo.codeHint")}>
          <TextIn
            id={`${uid}-code`}
            value={str(payload.code)}
            onChange={(value) => {
              setCodeTouched(true);
              set("code", value.toLowerCase().replace(/\s+/g, "-"));
            }}
            readOnly={readOnly}
            invalid={Boolean(errs.code)}
            placeholder="service-top-7"
            label={e("k12promo.code")}
            ai={`${CODE}.code`}
          />
        </Fld>
        <Fld label={e("k12promo.placement")} required error={errs.placement}>
          {/* GET /studio/reference/promotion-placements (10-09 §7), shown
              under the local names the rest of the product uses. */}
          <RefSelect source="promotion-placements" value={placement} onChange={setPlacement} readOnly={readOnly} label={e("k12promo.placement")} labelOf={placementName} />
        </Fld>
        <Fld label={e("k12promo.statusLabel")}>
          <SelectIn value={str(payload.status) || "active"} onChange={(value) => set("status", value)} options={STATUSES.map((value) => ({ value, label: statusLabels[value] }))} readOnly={readOnly} label={e("k12promo.statusLabel")} ai={`${CODE}.status`} />
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
        <div className="stu-promo-preview__head">
          <span>
            <IconMegaphone />
            {e("k12promo.preview")}
          </span>
          <small>{e("k12promo.previewHint")}</small>
        </div>
        <div className="stu-fe-grid">
          <Fld label={e("k12promo.previewLabel")} hint={e("k12promo.previewLabelHint")}>
            <TextIn value={str(preview.label)} onChange={(value) => setPreview("label", value)} readOnly={readOnly} placeholder={e("k12promo.previewBadge")} label={e("k12promo.previewLabel")} ai={`${CODE}.preview.label`} />
          </Fld>
          <Fld label={e("k12promo.previewTitle")}>
            <TextIn value={str(preview.title)} onChange={(value) => setPreview("title", value)} readOnly={readOnly} label={e("k12promo.previewTitle")} ai={`${CODE}.preview.title`} />
          </Fld>
          <Fld label={e("k12promo.previewSubtitle")}>
            <TextIn value={str(preview.subtitle)} onChange={(value) => setPreview("subtitle", value)} readOnly={readOnly} label={e("k12promo.previewSubtitle")} ai={`${CODE}.preview.subtitle`} />
          </Fld>
          <Fld label={e("k12promo.previewCta")}>
            <TextIn value={str(preview.cta_label)} onChange={(value) => setPreview("cta_label", value)} readOnly={readOnly} label={e("k12promo.previewCta")} ai={`${CODE}.preview.cta`} />
          </Fld>
        </div>
        {/* The package as a client meets it (10-09 §11): the page-top
            carousel, the seller card at the head of the list, or the
            sponsored service block — drawn with the marketplace's markup. */}
        <div className="stu-promo-live">
          <div className="stu-promo-live__meta">
            <span>{placementName(placement, placement)}</span>
            <span>{e("k12promo.previewDays", { n: Number(payload.days) || 0 })}</span>
            <b>{num(Number(payload.price) || 0)} {e("k12promo.som")}</b>
          </div>
          {placement === "banner" ? (
            <PromoBanner banner={banner} base="" preview eyebrow={badge} />
          ) : placement === "profile_boost" ? (
            <div className="stu-promo-live__list">
              <div className="stu-promo-live__card is-top">
                <span className="stu-promo-live__av">AK</span>
                <span className="stu-promo-live__t">
                  <b>{title}</b>
                  <small>{subtitle}</small>
                </span>
                <span className="stu-promo-live__badge">
                  <IconStar />
                  {badge}
                </span>
              </div>
              <div className="stu-promo-live__card is-ghost" aria-hidden="true" />
              <div className="stu-promo-live__card is-ghost" aria-hidden="true" />
            </div>
          ) : (
            <div className="stu-promo-live__tiles">
              <div className="mk-promo-tile">
                <span className="mk-promo-tile__tag">
                  <IconMegaphone /> {badge}
                </span>
                <b>{title}</b>
                <small>{subtitle}</small>
                <span className="mk-promo-tile__go">
                  <IconArrowRight />
                </span>
              </div>
              <div className="stu-promo-live__card is-ghost" aria-hidden="true" />
            </div>
          )}
        </div>
      </section>
      {errIn(errs, "preview") ? <p className="stu-ferr" role="alert">{errIn(errs, "preview")}</p> : null}
    </EdShell>
  );
}
