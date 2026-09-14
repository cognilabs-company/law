// Shared domain types for LexGo. Mock services return these shapes so the UI
// can later swap to a real backend without changing components.

export type AccountType = "client" | "lawyer" | "advocate";

// A legal service a professional can offer / a client can request. `key`
// resolves to `catalog.*` in the messages; `icon` is an icons.tsx export name.
export type ServiceKey =
  | "consultation"
  | "contract"
  | "business"
  | "document"
  | "family"
  | "realEstate"
  | "tax"
  | "employment"
  | "corporate"
  | "litigation"
  | "ip"
  | "migration"
  | "other";

export type ServiceCategory = {
  key: ServiceKey;
  icon: string;
};

// ── Professional profile (lawyer + advocate share a base) ──
export type WorkEntry = {
  id: string;
  org: string;
  position: string;
  start: string; // YYYY-MM
  end: string | null; // null = current
  current: boolean;
  achievements?: string;
};

export type AdvocateStats = {
  totalCases: number;
  fullyWonCases: number; // sud qarori to'liq foydaga chiqqan
  partiallyWonCases: number; // ayb yengillashtirilgan / qisman qanoatlantirilgan
  successRate: number; // 0..100, computed
};

export type ProfessionalProfile = {
  name: string; // kept in sync = `${lastName} ${firstName} ${middleName}` for backend + display
  firstName?: string;
  lastName?: string;
  middleName?: string;
  photo?: string; // data URL (mock upload)
  region?: string; // enums.regions
  languages: string[]; // language keys
  education?: string;
  experienceYears?: number;
  bio?: string;
  services: string[]; // lawyer service offering (backend service ids)
  hourlyPrice?: number; // base_hourly_price, whole so'm (legacy UZS)
  // advocate-only
  email?: string;
  advocateStructure?: string; // byuro | firma | hayat
  orgName?: string; // structure / firm name (or address)
  advocateYears?: number; // years practised as an advocate
  lawyerYears?: number; // years practised as a lawyer (yurist)
  licenseNumber?: string;
  licenseDoc?: string; // file name
  barAssociation?: string;
  specialization?: string;
  practiceAreas: string[]; // enums.areas
  workHistory: WorkEntry[];
  stats?: AdvocateStats;
};

// Draft carried through the multi-step registration wizard.
export type RegistrationDraft = {
  accountType: AccountType | null;
  phone: string;
  phoneVerified: boolean;
  password: string;
  profile: ProfessionalProfile;
};

export function emptyProfile(): ProfessionalProfile {
  return {
    name: "",
    firstName: "",
    lastName: "",
    languages: [],
    services: [],
    practiceAreas: [],
    workHistory: [],
  };
}

export function emptyDraft(): RegistrationDraft {
  return {
    accountType: null,
    phone: "",
    phoneVerified: false,
    password: "",
    profile: emptyProfile(),
  };
}

// ── Subscription plans (shared by lawyer + advocate) ──
export type PlanTier = "free" | "pro" | "premium";
export type Plan = {
  tier: PlanTier;
  monthly: number; // som / month
  featured?: boolean;
  badge?: boolean; // grants a profile badge
  featureCount: number; // number of `plans.<tier>.features` entries
};

export type Invoice = {
  id: string;
  planTier: PlanTier;
  date: string;
  amount: number;
  state: "paid" | "pending" | "failed";
};

// ── Paid promotion ──
export type PromoPackage = {
  days: 7 | 14 | 30;
  price: number;
  reachMultiplier: number; // e.g. 2.4x
  featured?: boolean;
};

export type PromoStats = {
  searchPosition: number;
  visibilityPct: number; // 0..100 profile visibility score
  impressions: number;
  searchAppearances: number;
  profileClicks: number;
  contactRequests: number;
  estReachIncreasePct: number;
};

// ── Client side ──
export type RequestStatus =
  | "analyzing"
  | "matching"
  | "consultation"
  | "inProgress"
  | "resolved";

export type ClientRequest = {
  id: string;
  title: string;
  categoryKey: ServiceKey;
  status: RequestStatus;
  specialist?: string;
  nextActionKey: string; // catalog of next-action i18n keys
  deadline?: string;
  updatedAt: string;
  unread: number;
};

export type MatchedSpecialist = {
  id: string;
  name: string;
  accountType: Exclude<AccountType, "client">;
  areaKey: string; // enums.areas
  region: string;
  rating: number;
  reviews: number;
  matchPct: number; // 0..100 fit for the client's request
  verified: boolean;
  responseMin: number;
};

// ── Advocate business dashboard ──
export type AdvocateMetrics = {
  profileViews: number;
  profileViewsDeltaPct: number;
  contactRequests: number;
  searchRank: number;
  searchRankDelta: number;
  rating: number;
  reviews: number;
  completeness: number; // 0..100
  responseRatePct: number;
};

export type Opportunity = {
  id: string;
  title: string;
  areaKey: string;
  region: string;
  budget: string;
  postedAgoMin: number;
  matchPct: number;
};

// ── Generic async result state for mock services ──
export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };
