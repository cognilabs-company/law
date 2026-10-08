import type { ReactElement, SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const soft = { fill: "currentColor", fillOpacity: 0.16, stroke: "none" };

export type DocKind = "petition" | "contract" | "claim" | "order" | "poa" | "review" | "doc";

const KIND_RULES: [DocKind, RegExp][] = [
  ["review", /tekshir|провер|review|экспертиз/i],
  ["poa", /ishonchnoma|ишончнома|доверенн/i],
  ["contract", /shartnoma|шартнома|договор|kelishuv|келишув|соглашен|контракт|oferta|оферт/i],
  ["claim", /da['ʼ’`]?vo|даъво|иск|shikoyat|шикоят|жалоб|apellyats|апелляц/i],
  ["order", /buyruq|буйруқ|буйрук|приказ|farmoyish|фармойиш|распоряж/i],
  ["petition", /ariza|ариза|заявлен|iltimosnoma|илтимоснома|ходатай|murojaat|мурожаат|обращен/i],
];

export function docKindOf(...texts: string[]): DocKind {
  const s = texts.filter(Boolean).join(" ");
  for (const [k, re] of KIND_RULES) if (re.test(s)) return k;
  return "doc";
}

const Sheet = () => (
  <>
    <path {...soft} d="M6 3.5h8.5L19 8v12.5H6z" />
    <path d="M14.5 3.5H7a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8z" />
    <path d="M14.5 3.5V8H19" />
  </>
);

export const KindPetition = (p: P) => (
  <svg {...base} {...p}>
    <Sheet />
    <path d="M9 11.5h6M9 14.5h6M9 17.5h3.5" />
  </svg>
);

export const KindContract = (p: P) => (
  <svg {...base} {...p}>
    <Sheet />
    <path d="M9 11h6M9 13.8h4" />
    <path d="M8.6 18.2c.9-1.2 1.6-1.2 2 0 .4 1.1 1 1.1 1.8-.1.5-.7 1.1-.8 1.7-.1h1.4" />
  </svg>
);

export const KindClaim = (p: P) => (
  <svg {...base} {...p}>
    <path {...soft} d="M4 20.5h10v-2.2H4z" />
    <path d="M4 20.5h10M5.5 18.3h7" />
    <path d="m9.6 9.9 4.2-4.2M12 12.3l4.2-4.2" />
    <path d="m11.2 5.1 3.6 3.6M8.4 7.9l3.6 3.6M14.1 10.2l6.2 6.2" />
  </svg>
);

export const KindOrder = (p: P) => (
  <svg {...base} {...p}>
    <Sheet />
    <path d="M9 11h6M9 13.8h3" />
    <circle {...soft} cx="14.6" cy="17.2" r="2.3" />
    <circle cx="14.6" cy="17.2" r="2.3" />
  </svg>
);

export const KindPoa = (p: P) => (
  <svg {...base} {...p}>
    <Sheet />
    <circle cx="10.5" cy="12.2" r="1.7" />
    <path d="M7.9 17.4c.5-1.6 1.5-2.4 2.6-2.4s2.1.8 2.6 2.4M14.2 11.6h1.8M14.2 14.4h1.8" />
  </svg>
);

export const KindReview = (p: P) => (
  <svg {...base} {...p}>
    <Sheet />
    <circle {...soft} cx="11.6" cy="13.6" r="3" />
    <circle cx="11.6" cy="13.6" r="3" />
    <path d="m13.8 15.8 2.4 2.4" />
  </svg>
);

export const KindDoc = (p: P) => (
  <svg {...base} {...p}>
    <Sheet />
    <path d="M9 12h6M9 15h6" />
  </svg>
);

export const KIND_ICON: Record<DocKind, (p: P) => ReactElement> = {
  petition: KindPetition,
  contract: KindContract,
  claim: KindClaim,
  order: KindOrder,
  poa: KindPoa,
  review: KindReview,
  doc: KindDoc,
};

export const ModeSelf = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M14.5 5.5l4 4L9 19H5v-4z" />
  </svg>
);

export const ModeAi = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" />
  </svg>
);

export const ModeLawyer = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.5 20c.8-3.6 3.3-5.6 6.5-5.6s5.7 2 6.5 5.6" />
  </svg>
);

export const StepFill = (p: P) => (
  <svg {...base} {...p}>
    <path {...soft} d="M6 5h12v15.5H6z" />
    <path d="M9 4.5h6v2.5H9z" />
    <path d="M15 5.5h2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1h2" />
    <path d="M9 12h3.5M9 15.5h2" />
    <path d="m13.4 17.6 3.8-3.8 1.4 1.4-3.8 3.8h-1.4z" />
  </svg>
);

export const StepPay = (p: P) => (
  <svg {...base} {...p}>
    <path {...soft} d="M4 7.5h15.5a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    <path d="M17 7.5V5.2a1 1 0 0 0-1.3-.9L5 7.4" />
    <path d="M4 7.5h15.5a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    <path d="M20.5 11.5h-3.6a1.6 1.6 0 0 0 0 3.2h3.6" />
  </svg>
);

export const StepReview = (p: P) => (
  <svg {...base} {...p}>
    <path {...soft} d="M12 3.5l7 2.6v5.2c0 4.4-3 7.7-7 9.2-4-1.5-7-4.8-7-9.2V6.1z" />
    <path d="M12 3.5l7 2.6v5.2c0 4.4-3 7.7-7 9.2-4-1.5-7-4.8-7-9.2V6.1z" />
    <circle cx="12" cy="10" r="2.2" />
    <path d="M8.6 16c.6-1.7 1.9-2.7 3.4-2.7s2.8 1 3.4 2.7" />
  </svg>
);

export const StepReady = (p: P) => (
  <svg {...base} {...p}>
    <Sheet />
    <path d="m9 14.2 2.1 2.1 4-4.2" />
  </svg>
);

export const IcoCheck = (p: P) => (
  <svg {...base} strokeWidth={2.6} {...p}>
    <path d="m5.5 12.5 4.2 4.2 8.8-9" />
  </svg>
);

export const IcoCross = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M7 7l10 10M17 7 7 17" />
  </svg>
);

export const IcoMinus = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M7 12h10" />
  </svg>
);

export const PriceWait = (p: P) => (
  <svg {...base} {...p}>
    <circle {...soft} cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const PricePaid = (p: P) => (
  <svg {...base} {...p}>
    <path {...soft} d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
    <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
    <path d="m9 11.6 2.1 2.1 4-4.2" />
  </svg>
);

export const PriceCancelled = (p: P) => (
  <svg {...base} {...p}>
    <circle {...soft} cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="8.5" />
    <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
  </svg>
);

export const PriceTag = (p: P) => (
  <svg {...base} {...p}>
    <path {...soft} d="M3.5 12.4V4.5a1 1 0 0 1 1-1h7.9l8.1 8.1a1.4 1.4 0 0 1 0 2l-6.9 6.9a1.4 1.4 0 0 1-2 0z" />
    <path d="M3.5 12.4V4.5a1 1 0 0 1 1-1h7.9l8.1 8.1a1.4 1.4 0 0 1 0 2l-6.9 6.9a1.4 1.4 0 0 1-2 0z" />
    <circle cx="8" cy="8" r="1.4" />
  </svg>
);

export const PriceIncluded = (p: P) => (
  <svg {...base} {...p}>
    <path {...soft} d="M12 3.5l7 2.6v5.2c0 4.4-3 7.7-7 9.2-4-1.5-7-4.8-7-9.2V6.1z" />
    <path d="M12 3.5l7 2.6v5.2c0 4.4-3 7.7-7 9.2-4-1.5-7-4.8-7-9.2V6.1z" />
    <path d="m9 12.2 2.1 2.1 4-4.2" />
  </svg>
);

export const IcoInfo = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const IcoStack = (p: P) => (
  <svg {...base} {...p}>
    <path {...soft} d="M8 6.5h11v14H8z" />
    <path d="M16 3.5H6a1 1 0 0 0-1 1v12" />
    <path d="M8 6.5h11v14H8z" />
    <path d="M11 11h5M11 14h5M11 17h3" />
  </svg>
);
