// The HR modules, declared. Each one is a domain of the universal record API
// (/internal/hrm/{domain}/records) given a real shape: what kinds of record it
// holds, the fields of each (kept in the record's payload), how they are
// viewed (list, board, calendar), and which parts of the workflow the
// backend does not serve yet — those are shown, marked "soon", and listed
// for the backend team rather than faked in the browser.

export type FieldKind = "text" | "textarea" | "number" | "money" | "date" | "select" | "employee" | "unit" | "url" | "phone";
export type FieldDef = { key: string; kind: FieldKind; options?: string[]; required?: boolean; list?: boolean; wide?: boolean };
export type ViewKind = "list" | "board" | "calendar";

export type TabDef = {
  key: string;
  // Record types this tab holds; the first is the default for a new record.
  types: string[];
  fields: FieldDef[];
  views: ViewKind[];
  // Who the record is about: a person, a unit, or nothing (a vacancy, a policy).
  subject: "employee" | "unit" | "none";
  // Whether the record covers a period (effective_from / effective_to).
  period?: "range" | "start" | "none";
  // A payload select field whose values are the board's columns; without it
  // the board is laid out by status.
  boardField?: string;
  // A starting checklist (i18n keys under checklists.*), editable per record.
  checklist?: string[];
  // Records of this tab hang under a record of another tab (parent_id).
  parentTab?: string;
  // One click creates a child record about oneself (a policy acknowledgement).
  selfChild?: { type: string; labelKey: string };
};

export type ModuleDef = { key: string; domain: string; route: string; tabs: TabDef[]; soon: string[] };

export const HR_MODULES: ModuleDef[] = [
  {
    key: "leave",
    domain: "leave",
    route: "/internal/leave",
    soon: ["leaveBalance", "leaveCertificate", "leaveStaffing"],
    tabs: [
      {
        key: "requests",
        types: ["annual_leave", "sick_leave", "unpaid_leave", "maternity_leave"],
        subject: "employee",
        period: "range",
        views: ["list", "calendar"],
        fields: [
          { key: "days", kind: "number", list: true },
          { key: "replacement_employee_id", kind: "employee" },
          { key: "reason", kind: "textarea", wide: true },
        ],
      },
    ],
  },
  {
    key: "travel",
    domain: "travel",
    route: "/internal/travel",
    soon: ["travelExpenses", "travelOrder"],
    tabs: [
      {
        key: "trips",
        types: ["business_trip"],
        subject: "employee",
        period: "range",
        views: ["list", "calendar"],
        fields: [
          { key: "destination", kind: "text", required: true, list: true },
          { key: "purpose", kind: "select", options: ["court", "client_meeting", "training", "audit", "other"], list: true },
          { key: "transport", kind: "select", options: ["car", "train", "plane", "other"] },
          { key: "budget", kind: "money" },
          { key: "comment", kind: "textarea", wide: true },
        ],
      },
    ],
  },
  {
    key: "recruiting",
    domain: "recruiting",
    route: "/internal/recruiting",
    soon: ["recruitingCv", "recruitingOffer", "recruitingConvert"],
    tabs: [
      {
        key: "vacancies",
        types: ["vacancy"],
        subject: "unit",
        period: "none",
        views: ["list"],
        fields: [
          { key: "position", kind: "text", required: true, list: true },
          { key: "headcount", kind: "number", list: true },
          { key: "salary_from", kind: "money" },
          { key: "salary_to", kind: "money" },
          { key: "employment_type", kind: "select", options: ["full_time", "part_time", "contract", "intern"] },
          { key: "requirements", kind: "textarea", wide: true },
        ],
      },
      {
        key: "candidates",
        types: ["candidate"],
        subject: "none",
        period: "none",
        views: ["board", "list"],
        parentTab: "vacancies",
        boardField: "stage",
        fields: [
          { key: "stage", kind: "select", options: ["new", "screening", "interview", "offer", "hired", "rejected"], required: true, list: true },
          { key: "phone", kind: "phone", list: true },
          { key: "email", kind: "text" },
          { key: "source", kind: "select", options: ["referral", "job_site", "social", "agency", "other"] },
          { key: "expected_salary", kind: "money" },
          { key: "interview_date", kind: "date" },
          { key: "comment", kind: "textarea", wide: true },
        ],
      },
    ],
  },
  {
    key: "onboarding",
    domain: "onboarding",
    route: "/internal/onboarding",
    soon: ["onboardingProbation", "onboardingProofs"],
    tabs: [
      {
        key: "plans",
        types: ["onboarding_plan"],
        subject: "employee",
        period: "start",
        views: ["list", "board"],
        checklist: ["contract", "accounts", "workplace", "intro", "policies", "training", "firstTasks"],
        fields: [
          { key: "mentor_employee_id", kind: "employee", list: true },
          { key: "probation_until", kind: "date", list: true },
          { key: "comment", kind: "textarea", wide: true },
        ],
      },
    ],
  },
  {
    key: "offboarding",
    domain: "offboarding",
    route: "/internal/offboarding",
    soon: ["offboardingClearance", "offboardingExit"],
    tabs: [
      {
        key: "cases",
        types: ["resignation", "exit_checklist"],
        subject: "employee",
        period: "start",
        views: ["list", "board"],
        checklist: ["handover", "equipment", "accesses", "documents", "settlement", "exitTalk"],
        fields: [
          { key: "termination_reason", kind: "select", options: ["own_wish", "agreement", "contract_end", "discipline", "other"], list: true },
          { key: "last_day", kind: "date", list: true },
          { key: "handover_employee_id", kind: "employee" },
          { key: "comment", kind: "textarea", wide: true },
        ],
      },
    ],
  },
  {
    key: "movements",
    domain: "movements",
    route: "/internal/movements",
    soon: ["movementsOrder", "movementsApply"],
    tabs: [
      {
        key: "orders",
        types: ["transfer", "promotion", "demotion"],
        subject: "employee",
        period: "start",
        views: ["list"],
        fields: [
          { key: "order_number", kind: "text", list: true },
          { key: "to_unit_id", kind: "unit", list: true },
          { key: "new_position", kind: "text", list: true },
          { key: "new_salary", kind: "money" },
          { key: "basis", kind: "textarea", wide: true },
        ],
      },
    ],
  },
  {
    key: "policies",
    domain: "policies",
    route: "/internal/policies",
    soon: ["policiesFile", "policiesQuiz", "policiesCompliance"],
    tabs: [
      {
        key: "documents",
        types: ["policy"],
        subject: "none",
        period: "start",
        views: ["list"],
        selfChild: { type: "policy_ack", labelKey: "ack" },
        fields: [
          { key: "category", kind: "select", options: ["internal_rule", "job_description", "sop", "safety", "regulation"], list: true },
          { key: "version", kind: "text", list: true },
          { key: "body", kind: "textarea", wide: true, required: true },
        ],
      },
    ],
  },
  {
    key: "learning",
    domain: "lms",
    route: "/internal/learning",
    soon: ["learningPlayer", "learningQuiz", "learningCertificate"],
    tabs: [
      {
        key: "courses",
        types: ["course"],
        subject: "none",
        period: "none",
        views: ["list"],
        fields: [
          { key: "category", kind: "select", options: ["legal", "product", "soft_skills", "compliance", "tools"], list: true },
          { key: "duration_hours", kind: "number", list: true },
          { key: "link", kind: "url" },
          { key: "description", kind: "textarea", wide: true },
        ],
      },
      {
        key: "assignments",
        types: ["course_assignment"],
        subject: "employee",
        period: "range",
        views: ["list", "board"],
        parentTab: "courses",
        fields: [
          { key: "progress", kind: "number", list: true },
          { key: "score", kind: "number", list: true },
          { key: "comment", kind: "textarea", wide: true },
        ],
      },
    ],
  },
  {
    key: "documents",
    domain: "documents",
    route: "/internal/documents",
    soon: ["documentsFile", "documentsVerify"],
    tabs: [
      {
        key: "papers",
        types: ["personal_document", "certificate", "agreement"],
        subject: "employee",
        period: "range",
        views: ["list"],
        fields: [
          { key: "doc_number", kind: "text", list: true },
          { key: "issued_by", kind: "text", list: true },
          { key: "comment", kind: "textarea", wide: true },
        ],
      },
    ],
  },
  {
    key: "skills",
    domain: "skills",
    route: "/internal/skills",
    soon: ["skillsGap"],
    tabs: [
      {
        key: "skills",
        types: ["skill", "assessment"],
        subject: "employee",
        period: "none",
        views: ["list", "board"],
        boardField: "level",
        fields: [
          { key: "level", kind: "select", options: ["beginner", "intermediate", "advanced", "expert"], required: true, list: true },
          { key: "category", kind: "select", options: ["legal", "product", "soft_skills", "compliance", "tools"], list: true },
          { key: "comment", kind: "textarea", wide: true },
        ],
      },
    ],
  },
];

export const hrModule = (key: string): ModuleDef => HR_MODULES.find((m) => m.key === key) ?? HR_MODULES[0];
