// JSON examples from docs/LEXGO_ACHIEVEMENTS_PRACTICE_FRONTEND_CONTRACT_2026_10_29.md
// (backend 69c11a6), as the canonical shapes the readers are tested on.

// §2 AchievementConfigOut (the contract shows one stage and one result).
export const CONFIG = {
  process_stages: [
    { value: "pre_investigation", label: "Tergovga qadar tekshiruv", title: "Tergovga qadar tekshiruv", label_i18n: { uz_latn: "Tergovga qadar tekshiruv", uz_cyrl: "Терговга қадар текширув", ru: "Доследственная проверка", en: "Pre-investigation review" } },
  ],
  result_scopes: [{ value: "full", label: "To‘liq ijobiy natija", title: "To‘liq ijobiy natija", label_i18n: { uz_latn: "To‘liq ijobiy natija", uz_cyrl: "Тўлиқ ижобий натижа", ru: "Полный положительный результат", en: "Full positive result" } }],
  evidence: {
    required: true,
    min_files: 1,
    max_files: 20,
    max_file_size_bytes: 20971520,
    allowed_mime_types: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png"],
    allowed_extensions: [".docx", ".jpg", ".pdf", ".png"],
  },
  description: { min_length: 5, max_length: 5000 },
  warning: "Uzbek Latin warning text",
  warning_i18n: { uz_latn: "...", uz_cyrl: "...", ru: "...", en: "..." },
  public_fields: ["process_stage", "result_scope", "category", "year", "public_description", "lexgo_verified"],
  workflow: ["evidence_upload", "submission", "ai_advisory_analysis", "operator_review", "public_profile"],
};

// §4 private item fields, inside the §4 groups page.
export const item = (o: Record<string, unknown> = {}) => ({
  id: "a2",
  root_id: "r1",
  source_id: "a1",
  version: 2,
  status: "ai_analysis_pending",
  process_stage: "court",
  result_scope: "full",
  category_id: "c1",
  category_title: "Jinoyat ishlari",
  achieved_at: "2026-10-20",
  description: "What was achieved and how it is supported by the decision.",
  public_description: "",
  evidence: [{ id: "e1", file_name: "decision.pdf", mime_type: "application/pdf", size: 12345, download_url: "/marketplace/achievements/evidence/e1" }],
  ai_analysis_status: "pending",
  ai_analysis: {},
  rejection_reason: "",
  ...o,
});
export const GROUPS = {
  items: [],
  groups: [{ root_id: "r1", current: item({ id: "a1", version: 1, status: "approved", source_id: null }), pending_revision: item(), latest: item(), revision_count: 2 }],
  total: 1,
  total_records: 2,
  count: 1,
  limit: 50,
  offset: 0,
  has_more: false,
};

// §7 normalized AI analysis.
export const AI = {
  status: "completed",
  analysis_type: "achievement",
  document_readable: true,
  claim_supported: true,
  stage_matches: true,
  result_scope_matches: true,
  authenticity_confidence: 0.92,
  manipulation_risk: 0.04,
  ai_generated_risk: 0.03,
  risk_level: "low",
  risk_codes: [],
  risk_items: [],
  signature_detection: { signature: true, seal: true, electronic_signature: false },
  pii_detected: [],
  operator_notes: [],
  public_safe_summary: "...",
  extracted_fields: {},
  final_decision: "operator_required",
  reason: "",
};

// §8 checklist item.
export const CHECK = { key: "evidence_supports_claim", label: "Dalillar ma’lumotni tasdiqlaydi", hint: "Dalillar ma’lumotni tasdiqlaydi", label_i18n: { uz_latn: "...", uz_cyrl: "...", ru: "..." } };

// §9 evidence state.
export const LICENSE_EVIDENCE = { id: "v1", status: "analyzed", file_name: "license.pdf", mime_type: "application/pdf", size: 12345, extracted_fields: {}, ai_analysis: {}, final_decision: "operator_required" };

// §10 AdvocatePracticeOut.
export const PRACTICE = {
  seller_user_id: "u-adv",
  status_started_at: "2020-01-10",
  verification_status: "approved",
  verified_at: "2026-10-29T12:00:00Z",
  active_experience_days: 2300,
  active_experience_years: 6.3,
  suspended_days: 15,
  suspensions: [{ id: "s1", started_at: "2024-01-01", ended_at: "2024-01-15", reason: "...", days: 15, evidence_ids: [] }],
  certificate_number: "...",
  issuing_authority: "...",
  latest_verification: { id: "lv2", status: "approved", reason: "", reviewed_at: "...", version: 2 },
  legal_basis: { code: "advocate_status_begins_on_certificate_issue", text: "...", suspension_excluded: true },
};

// §11 communication.
export const ROOM = { idempotent: false, room_id: "room-1", messages_url: "/secure-chats/room-1/messages", calls_url: "/secure-chats/room-1/calls", call_types: ["audio", "video"], close_by_operator_only: true };
