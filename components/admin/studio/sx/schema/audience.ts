import type { SxValues } from "../contract";
import { fieldPath } from "../labels";

// Who reads each Studio text field, and what it is for. Every text,
// description and list-of-text field in the constructors has an entry, keyed
// like the other field strings (CODE__path, list indexes dropped). The note
// under the field shows the audience as a coloured badge and the purpose as
// one line (studio.sx.aud.use.*).
//
//   client     customers, in the marketplace, orders and the client app
//   performer  advocates and lawyers who do the work
//   both       customers and performers alike
//   public     anyone on the open site, signed in or not
//   staff      LexGo staff only (Studio, admin, CRM)
//   system     a key or setting the system reads; shown to nobody
//
// Rules and guarantees carry their own audience, so "dyn:*" entries follow
// the value picked in the form.

export type SxAudience = "client" | "performer" | "both" | "public" | "staff" | "system";
export type SxFieldAudience = { who: SxAudience | "unset"; use: string };

type Entry = readonly [who: SxAudience | "dyn:rule" | "dyn:guarantee", use: string];

const MAP: Readonly<Record<string, Entry>> = {
  "CORE__title": ["staff", "staffName"],
  "K01__title": ["client", "catTitle"],
  "K01__slug": ["public", "slug"],
  "K01__description": ["client", "catDesc"],
  "K01__discovery_terms": ["system", "aiTerms"],
  "K02__title": ["client", "svcTitle"],
  "K02__slug": ["public", "slug"],
  "K02__description": ["client", "svcDesc"],
  "K02__client_value": ["client", "svcValue"],
  "K02__usage_steps": ["client", "usageSteps"],
  "K02__intake_questions__id": ["system", "sysKey"],
  "K02__intake_questions__label": ["client", "intakeQ"],
  "K02__intake_questions__placeholder": ["client", "intakeHint"],
  "K02__intake_questions__options": ["client", "intakeOpt"],
  "K02__service_terms_text": ["client", "svcTerms"],
  "K02__review_client_note": ["client", "reviewClient"],
  "K02__review_seller_note": ["performer", "reviewSeller"],
  "K02__completion_checklist__id": ["system", "sysKey"],
  "K02__completion_checklist__executor_title": ["performer", "checkExec"],
  "K02__completion_checklist__client_title": ["client", "checkClient"],
  "K02__completion_checklist__description": ["performer", "checkExecDesc"],
  "K02__completion_checklist__client_description": ["client", "checkClientDesc"],
  "K02__inline_rules__id": ["system", "sysKey"],
  "K02__inline_rules__title": ["dyn:rule", "ruleTitle"],
  "K02__inline_rules__body": ["dyn:rule", "ruleBody"],
  "K02__inline_guarantees__id": ["system", "sysKey"],
  "K02__inline_guarantees__title": ["dyn:guarantee", "guarantee"],
  "K02__inline_guarantees__description": ["dyn:guarantee", "guarantee"],
  "K02__inline_guarantees__trigger": ["dyn:guarantee", "guaranteeTrigger"],
  "K02__inline_guarantees__resolution": ["dyn:guarantee", "guaranteeAction"],
  "K02__discovery_terms": ["system", "aiTerms"],
  "K03-M__title": ["client", "pkgTitle"],
  "K03-M__description": ["client", "pkgDesc"],
  "K03-M__custom_items__title": ["client", "pkgItem"],
  "K03-M__custom_items__description": ["client", "pkgItem"],
  "K03-M__tiers__title": ["client", "tierText"],
  "K03-M__tiers__description": ["client", "tierText"],
  "K03-M__tiers__duration": ["client", "duration"],
  "K03-M__tiers__included": ["client", "tierText"],
  "K03-M__duration": ["client", "duration"],
  "K04__region_modifiers__region": ["system", "sysValue"],
  "K04__seller_requirements__allowed_roles": ["system", "sysValue"],
  "K04__extra_rules__field": ["system", "sysValue"],
  "K04__extra_rules__operator": ["system", "sysValue"],
  "K04__extra_rules__value": ["system", "sysValue"],
  "K06__title": ["staff", "tplStaff"],
  "K06__description": ["staff", "tplStaff"],
  "K06__fields__name": ["system", "sysKey"],
  "K06__fields__label": ["both", "tplField"],
  "K06__fields__placeholder": ["both", "tplField"],
  "K06__fields__help_text": ["both", "tplField"],
  "K06__fields__options": ["both", "tplField"],
  "K06__fields__section_key": ["system", "sysKey"],
  "K06__template_text": ["both", "tplText"],
  "K06__clauses__key": ["system", "sysKey"],
  "K06__clauses__title": ["both", "tplText"],
  "K06__clauses__content": ["both", "tplText"],
  "K07__title_i18n__uz_latn": ["both", "legalTitle"],
  "K07__title_i18n__uz_cyrl": ["both", "legalTitle"],
  "K07__title_i18n__ru": ["both", "legalTitle"],
  "K07__body_i18n__uz_latn": ["both", "legalBody"],
  "K07__body_i18n__uz_cyrl": ["both", "legalBody"],
  "K07__body_i18n__ru": ["both", "legalBody"],
  "K11__terms": ["client", "termsClient"],
  "K11__refund_policy__conditions": ["client", "termsClient"],
  "K11__client_notice": ["client", "clientNotice"],
  "K12-PROMO__title": ["performer", "promoTitle"],
  "K12-PROMO__preview__title": ["client", "promoPreview"],
  "K12-PROMO__preview__description": ["client", "promoPreview"],
  "K12-PROMO__preview__image_url": ["system", "imageUrl"],
  "K12-PROMO__preview__cta": ["client", "buttonText"],
  "K16__directory_key": ["system", "sysKey"],
  "K16__items__value": ["system", "sysKey"],
  "K16__items__label": ["both", "dirLabel"],
  "K17__slug": ["public", "slug"],
  "K17__title": ["both", "planTitle"],
  "K17__description": ["both", "planDesc"],
  "K17__audience": ["system", "sysValue"],
  "K18__policy_key": ["system", "sysKey"],
  "K18__providers__provider": ["system", "sysValue"],
  "K18__primary_provider": ["system", "sysValue"],
  "K18__fallback_provider": ["system", "sysValue"],
  "K18__currency": ["system", "sysValue"],
  "K18__refund_policy__conditions": ["staff", "staffText"],
  "K18__reconciliation__schedule": ["system", "sysValue"],
  "K19__hero__title": ["public", "landing"],
  "K19__hero__subtitle": ["public", "landing"],
  "K19__hero__image_url": ["system", "imageUrl"],
  "K19__hero__cta_label": ["public", "buttonText"],
  "K19__hero__cta_url": ["system", "linkUrl"],
  "K19__faq__question": ["public", "faq"],
  "K19__faq__answer": ["public", "faq"],
  "K19__seo__title": ["public", "seoTitle"],
  "K19__seo__description": ["public", "seoDesc"],
  "K19__seo__keywords": ["system", "seoKeys"],
  "K19__seo__canonical_url": ["system", "linkUrl"],
  "K19__blocks__title": ["public", "landing"],
  "K19__blocks__content": ["public", "landing"],
  "K19__cta__label": ["public", "buttonText"],
  "K19__cta__url": ["system", "linkUrl"],
  "K23__ticket_type": ["system", "sysKey"],
  "K23__priorities__code": ["system", "sysKey"],
  "K23__priorities__title": ["staff", "staffText"],
  "K23__queue_key": ["system", "sysKey"],
  "K23__sla__business_calendar_key": ["system", "sysKey"],
  "K23__routing_rules__target_type": ["system", "sysValue"],
  "K23__routing_rules__target_id": ["system", "sysKey"],
  "K23__transfer_rules__allowed_queues": ["system", "sysKey"],
  "K23__escalation_rules__target_id": ["system", "sysKey"],
  "K23__escalation_rules__notification_event": ["system", "sysKey"],
  "K23__closing_checklist__key": ["system", "sysKey"],
  "K23__closing_checklist__title": ["staff", "staffText"],
  "K24__pipeline_key": ["system", "sysKey"],
  "K24__title": ["staff", "staffName"],
  "K24__columns__key": ["system", "sysKey"],
  "K24__columns__title": ["staff", "staffText"],
  "K24__columns__color": ["system", "sysValue"],
  "K24__transitions__from": ["system", "sysKey"],
  "K24__transitions__to": ["system", "sysKey"],
  "K24__transitions__roles": ["system", "sysValue"],
  "K24__transitions__action": ["system", "sysKey"],
  "K24__assignment_rules__target_id": ["system", "sysKey"],
  "K24__lead_scoring__rules": ["system", "sysValue"],
  "K24__duplicate_rules__fields": ["system", "sysValue"],
  "K24__reminders__template_key": ["system", "sysKey"],
  "K24__lost_reasons__code": ["system", "sysKey"],
  "K24__lost_reasons__title": ["staff", "staffText"],
  "K26__policy_key": ["system", "sysKey"],
  "K26__allowed_formats": ["system", "sysValue"],
  "K26__plan_requirements__plan_ids": ["system", "sysKey"],
  "K26__plan_requirements__entitlement": ["system", "sysKey"],
  "K26__download_policy__formats": ["system", "sysValue"],
  "K28__profile_key": ["system", "sysKey"],
  "K28__tie_breakers": ["system", "sysValue"],
  "K29__title": ["staff", "staffName"],
  "K29__sections__id": ["system", "sysKey"],
  "K29__sections__title": ["client", "priceOpt"],
  "K29__sections__description": ["client", "priceOptDesc"],
  "K29__sections__options__id": ["system", "sysKey"],
  "K29__sections__options__label": ["client", "priceOpt"],
  "K29__sections__options__description": ["client", "priceOptDesc"],
  "K30__title": ["client", "situation"],
  "K30__description": ["staff", "situationDesc"],
  "K30__client_phrases": ["system", "clientPhrases"],
  "K30__discovery_terms": ["system", "aiTerms"],
  "K31__rule_key": ["system", "sysKey"],
  "K31__title": ["dyn:rule", "ruleTitle"],
  "K31__version": ["system", "sysValue"],
  "K31__body": ["dyn:rule", "ruleBody"],
  "K32__title": ["client", "guarantee"],
  "K32__description": ["client", "guarantee"],
  "K32__trigger": ["client", "guaranteeTrigger"],
  "K32__resolution": ["client", "guaranteeAction"],
  "K33__title": ["staff", "staffName"],
  "K34__title": ["client", "factor"],
  "K34__description": ["client", "factor"],
  "K34__discovery_terms": ["system", "aiTerms"],
  "K35__title": ["staff", "staffName"],
  "M1__title": ["staff", "staffName"],
  "M1__tasks__title": ["staff", "staffText"],
  "M2__acceptance_criteria__title": ["staff", "staffText"],
  "M2__evidence__value": ["staff", "staffText"],
  "M3__title": ["staff", "staffName"],
  "M3__widgets__key": ["system", "sysKey"],
  "M3__widgets__title": ["staff", "staffText"],
  "M3__widgets__type": ["system", "sysValue"],
  "M3__widgets__metric": ["system", "sysKey"],
  "M3__exports__key": ["system", "sysKey"],
  "M3__exports__title": ["staff", "staffText"],
  "M3__exports__permission": ["system", "sysKey"],
  "M3__alerts__metric": ["system", "sysKey"],
  "M3__alerts__operator": ["system", "sysValue"],
  "M3__alerts__channels": ["system", "sysValue"],
  "MP01__verification": ["system", "sysValue"],
  "MP01__license": ["system", "sysValue"],
  "MP01__profile_completion": ["system", "sysValue"],
  "MP01__account_status": ["system", "sysValue"],
  "MP01__selling_permissions": ["system", "sysValue"],
  "MP09__title": ["performer", "promoCampaign"],
  "MP10__schedule": ["system", "sysValue"],
  "MP10__regions": ["system", "sysValue"],
  "MP10__capacity": ["system", "sysValue"],
  "MP10__blackout_dates__reason": ["staff", "staffText"],
  "MP10__queue_rules__fallback_queue": ["system", "sysKey"],
  "OPS01__flag_key": ["system", "sysKey"],
  "OPS01__roles": ["system", "sysValue"],
  "OPS01__regions": ["system", "sysValue"],
  "OPS01__plans": ["system", "sysKey"],
  "OPS01__starts_at": ["system", "sysValue"],
  "OPS01__ends_at": ["system", "sysValue"],
  "OPS02__job_key": ["system", "sysKey"],
  "OPS02__schedule__expression": ["system", "sysValue"],
  "OPS02__schedule__timezone": ["system", "sysValue"],
  "OPS02__handler": ["system", "sysKey"],
  "OPS02__timeout": ["system", "sysValue"],
  "OPS04__data_type": ["system", "sysKey"],
  "OPS04__delete_mode": ["system", "sysValue"],
  "OPS05__export_key": ["system", "sysKey"],
  "OPS05__source": ["system", "sysKey"],
  "OPS05__columns__key": ["system", "sysKey"],
  "OPS05__columns__title": ["staff", "staffText"],
  "OPS05__columns__color": ["system", "sysValue"],
  "OPS05__joins__source": ["system", "sysKey"],
  "OPS05__joins__local_field": ["system", "sysKey"],
  "OPS05__joins__foreign_field": ["system", "sysKey"],
  "OPS05__roles": ["system", "sysValue"],
  "OPS05__formatting__date_format": ["system", "sysValue"],
  "OPS05__formatting__currency_format": ["system", "sysValue"],
  "OPS06__dashboard_key": ["system", "sysKey"],
  "OPS06__roles": ["system", "sysValue"],
  "OPS06__widgets__key": ["system", "sysKey"],
  "OPS06__widgets__title": ["staff", "staffText"],
  "OPS06__widgets__type": ["system", "sysValue"],
  "OPS06__widgets__metric": ["system", "sysKey"],
  "OPS06__metrics__key": ["system", "sysKey"],
  "OPS06__metrics__title": ["staff", "staffText"],
  "OPS06__metrics__field": ["system", "sysKey"],
  "OPS06__drilldowns__widget_key": ["system", "sysKey"],
  "OPS06__drilldowns__target": ["system", "linkUrl"],
  "OPS07__object_type": ["system", "sysKey"],
  "OPS07__prefix": ["system", "sysValue"],
  "OPS07__sequence_scope": ["system", "sysValue"],
  "OPS07__checksum": ["system", "sysValue"],
  "OPS07__example": ["system", "sysValue"],
  "OPS08__entity_type": ["system", "sysKey"],
  "OPS08__statuses__key": ["system", "sysKey"],
  "OPS08__statuses__title": ["staff", "staffText"],
  "OPS08__statuses__color": ["system", "sysValue"],
  "OPS08__transitions__from": ["system", "sysKey"],
  "OPS08__transitions__to": ["system", "sysKey"],
  "OPS08__transitions__roles": ["system", "sysValue"],
  "OPS08__transitions__action": ["system", "sysKey"],
  "OPS08__terminal_statuses": ["system", "sysKey"],
  "OPS08__actions__key": ["system", "sysKey"],
  "OPS08__actions__title": ["staff", "staffText"],
  "OPS08__actions__from_statuses": ["system", "sysKey"],
  "OPS08__actions__to_status": ["system", "sysKey"],
  "OPS08__actions__permission": ["system", "sysKey"],
  "ORG01__queue_key": ["system", "sysKey"],
  "ORG01__organization_unit_id": ["system", "sysKey"],
  "ORG01__skills": ["system", "sysValue"],
  "ORG01__schedule__expression": ["system", "sysValue"],
  "ORG01__schedule__timezone": ["system", "sysValue"],
  "ORG01__fallback__provider": ["system", "sysKey"],
  "ORG01__escalation__target_queue": ["system", "sysKey"],
  "ORG01__escalation__notify_roles": ["system", "sysValue"],
  "SEARCH01__index_key": ["system", "sysKey"],
  "SEARCH01__sorts__field": ["system", "sysKey"],
  "SEARCH01__synonyms": ["system", "aiTerms"],
};

// The service form's non-text fields, so a section can be grouped and the
// audience preview can show them; they get no note of their own.
const K02_FIELDS: Readonly<Record<string, Entry>> = {
  K02__service_id: ["system", "sysKey"],
  K02__category_id: ["client", "catTitle"],
  K02__intake_questions: ["client", "intakeQ"],
  K02__base_price: ["client", "svcTitle"],
  K02__max_price: ["performer", "staffText"],
  K02__seller_requirements: ["performer", "staffText"],
  K02__review_duration_value: ["both", "duration"],
  K02__review_duration_unit: ["both", "duration"],
  K02__duration_value: ["both", "duration"],
  K02__duration_unit: ["both", "duration"],
  K02__duration_calendar: ["both", "duration"],
  K02__template_mode: ["performer", "tplField"],
  K02__template_source: ["system", "sysValue"],
  K02__document_template_id: ["performer", "tplField"],
  K02__price_factor_ids: ["client", "factor"],
  K02__price_factor_overrides: ["client", "factor"],
  K02__pricing_coefficient_ids: ["performer", "factor"],
  K02__seller_rules_allowed: ["performer", "staffText"],
  K02__checklist_template_id: ["staff", "staffText"],
  K02__completion_checklist: ["both", "checkClient"],
  K02__rule_ids: ["both", "ruleTitle"],
  K02__guarantee_ids: ["client", "guarantee"],
  K02__inline_guarantees: ["client", "guarantee"],
  K02__inline_rules: ["both", "ruleTitle"],
  K02__negotiation_allowed: ["both", "staffText"],
  K02__executor_types: ["both", "staffText"],
  K02__is_active: ["staff", "staffText"],
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// Who a whole field is for, text or not: the note map first, then the
// service form's other fields.
export function audienceOfField(code: string, path: string, scope: SxValues, root: SxValues): SxFieldAudience | null {
  const extra = K02_FIELDS[`${code.toUpperCase()}__${fieldPath(path)}`];
  if (extra) return { who: extra[0] as SxAudience, use: extra[1] };
  return fieldAudienceOf(code, path, scope, root);
}

// Fields grouped by reader, in the order a form shows them.
export type AudienceBucket = "public" | "client" | "shared" | "performer" | "internal";
export const BUCKET_ORDER: readonly AudienceBucket[] = ["public", "client", "shared", "performer", "internal"];

export function bucketOf(who: SxFieldAudience["who"] | undefined): AudienceBucket | null {
  if (who === "public" || who === "client" || who === "performer") return who;
  if (who === "both") return "shared";
  if (who === "staff" || who === "system") return "internal";
  return null;
}

// Whether a field reaches a reader: the client sees what is public, theirs
// or shared; the performer sees their own and the shared fields.
export function seenBy(view: "client" | "performer", who: SxFieldAudience["who"] | undefined): boolean {
  if (view === "client") return who === "client" || who === "public" || who === "both";
  return who === "performer" || who === "both";
}

// A service rule is read by the side picked in its "audience" select.
function ruleAudience(v: unknown): SxAudience | "unset" {
  const s = str(v);
  return s === "client" ? "client" : s === "executor" ? "performer" : "unset";
}

// A guarantee speaks to the client unless it is set for advocates or lawyers.
function guaranteeAudience(v: unknown): SxAudience {
  const s = str(v);
  return s === "advokat" || s === "yurist" || s === "advokat_yurist" ? "performer" : "client";
}

// Fields the backend adds later fall back to their shape: a code-like key is
// a system value; anything else gets no note rather than a guess.
const SYSTEM_KEY = /(^|_)(key|id|ids|code|slug|url|provider|timezone|expression|operator|metric|permission|role|roles|type|status|format|formats|field|fields|source|prefix|handler|timeout|event|region|regions)$/;

export function fieldAudienceOf(code: string, path: string, scope: SxValues, root: SxValues): SxFieldAudience | null {
  const fp = fieldPath(path);
  const hit = MAP[`${code.toUpperCase()}__${fp}`];
  if (hit) {
    const [who, use] = hit;
    if (who === "dyn:rule") return { who: ruleAudience(scope.audience ?? root.audience), use };
    if (who === "dyn:guarantee") return { who: guaranteeAudience(scope.audience), use };
    return { who, use };
  }
  const last = fp.split("__").pop() ?? "";
  return SYSTEM_KEY.test(last) ? { who: "system", use: "sysKey" } : null;
}
