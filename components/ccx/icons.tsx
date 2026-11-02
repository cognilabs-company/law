import type { ComponentType, ReactNode, SVGProps } from "react";

export type CcxIconProps = SVGProps<SVGSVGElement> & { size?: number };
export type CcxIcon = ComponentType<CcxIconProps>;

function Glyph({ size = 22, className, children, style, ...rest }: CcxIconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ? `opx-i ${className}` : "opx-i"}
      style={{ width: size, height: size, ...style }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IcNow = (p: CcxIconProps) => (
  <Glyph {...p} className={`opx-i--now ${p.className ?? ""}`}>
    <circle className="opx-i__t" cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" opacity=".55" />
    <path className="opx-i__a opx-i__sweep" d="M12 12 18.4 5.6" />
    <circle className="opx-i__a opx-i__dot" cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </Glyph>
);

export const IcConsole = (p: CcxIconProps) => (
  <Glyph {...p} className={`opx-i--console ${p.className ?? ""}`}>
    <path className="opx-i__t" d="M4 13.5a2 2 0 0 1 2-2h1.5v6H6a2 2 0 0 1-2-2v-2ZM20 13.5a2 2 0 0 0-2-2h-1.5v6H18a2 2 0 0 0 2-2v-2Z" />
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <path d="M4 13.5a2 2 0 0 1 2-2h1.5v6H6a2 2 0 0 1-2-2v-2ZM20 13.5a2 2 0 0 0-2-2h-1.5v6H18a2 2 0 0 0 2-2v-2Z" />
    <path className="opx-i__a" d="M18 17.5c0 1.9-1.6 3-4 3h-1.5" />
    <circle className="opx-i__a opx-i__dot" cx="11.6" cy="20.5" r="1.2" fill="currentColor" stroke="none" />
  </Glyph>
);

export const IcPipeline = (p: CcxIconProps) => (
  <Glyph {...p} className={`opx-i--pipe ${p.className ?? ""}`}>
    <path className="opx-i__t" d="M3.5 5h17l-6.5 7.2v5.3l-4 2v-7.3L3.5 5Z" />
    <path d="M3.5 5h17l-6.5 7.2v5.3l-4 2v-7.3L3.5 5Z" />
    <path className="opx-i__a opx-i__drop" d="M7.5 8.5h9" />
  </Glyph>
);

export const IcMeeting = (p: CcxIconProps) => (
  <Glyph {...p} className={`opx-i--meet ${p.className ?? ""}`}>
    <rect className="opx-i__t" x="2.5" y="6.5" width="13" height="11" rx="3" />
    <rect x="2.5" y="6.5" width="13" height="11" rx="3" />
    <path d="m15.5 10.5 5-3v9l-5-3" />
    <circle className="opx-i__a opx-i__dot" cx="7" cy="10.5" r="1.4" fill="currentColor" stroke="none" />
  </Glyph>
);

export const IcSupport = (p: CcxIconProps) => (
  <Glyph {...p} className={`opx-i--support ${p.className ?? ""}`}>
    <path className="opx-i__t" d="M5.5 4.5h13a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H11l-4.5 3.5v-3.5h-1a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
    <path d="M5.5 4.5h13a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H11l-4.5 3.5v-3.5h-1a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
    <path className="opx-i__a" d="M10 9.2a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.3" />
    <circle className="opx-i__a" cx="12" cy="14.6" r=".5" fill="currentColor" />
  </Glyph>
);

export const IcTasks = (p: CcxIconProps) => (
  <Glyph {...p} className={`opx-i--tasks ${p.className ?? ""}`}>
    <rect className="opx-i__t" x="4.5" y="4.5" width="15" height="16" rx="3" />
    <rect x="4.5" y="4.5" width="15" height="16" rx="3" />
    <path d="M9 3.5h6v2.5H9z" />
    <path className="opx-i__a opx-i__tick" d="m8.5 13 2.5 2.5 4.5-5" pathLength={1} />
  </Glyph>
);

export const IcChart = (p: CcxIconProps) => (
  <Glyph {...p} className={`opx-i--chart ${p.className ?? ""}`}>
    <rect className="opx-i__t" x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    <path className="opx-i__a opx-i__pulse" d="M6.5 13.5h2.5l1.8-4 2.6 7 1.8-3h2.3" pathLength={1} />
  </Glyph>
);

export const IcLayers = (p: CcxIconProps) => (
  <Glyph {...p} className={`opx-i--layers ${p.className ?? ""}`}>
    <path className="opx-i__t" d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z" />
    <path d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z" />
    <path className="opx-i__a" d="m3.5 12 8.5 4.5 8.5-4.5" />
    <path d="m3.5 16 8.5 4.5 8.5-4.5" />
  </Glyph>
);

export const IcGrid = (p: CcxIconProps) => (
  <Glyph {...p}>
    <rect className="opx-i__t" x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect className="opx-i__a" x="13.5" y="13.5" width="7" height="7" rx="2" />
  </Glyph>
);

export const IcUser = (p: CcxIconProps) => (
  <Glyph {...p}>
    <circle className="opx-i__t" cx="12" cy="8.5" r="4" />
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Glyph>
);

export const IcAppearance = (p: CcxIconProps) => (
  <Glyph {...p} className={`opx-i--look ${p.className ?? ""}`}>
    <circle className="opx-i__t" cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" opacity=".35" stroke="none" />
    <path className="opx-i__a opx-i__spark" d="M17.5 4v3M16 5.5h3" />
  </Glyph>
);

export const IcSun = (p: CcxIconProps) => (
  <Glyph {...p}>
    <circle className="opx-i__t" cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="4" />
    <path className="opx-i__a" d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Glyph>
);

export const IcMoon = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z" />
    <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z" />
    <path className="opx-i__a" d="M16.5 4v2.4M15.3 5.2h2.4" />
  </Glyph>
);

export const IcSearch = (p: CcxIconProps) => (
  <Glyph {...p}>
    <circle className="opx-i__t" cx="10.8" cy="10.8" r="6.3" />
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path className="opx-i__a" d="m15.6 15.6 4.4 4.4" />
  </Glyph>
);

export const IcClock = (p: CcxIconProps) => (
  <Glyph {...p} className={`opx-i--clock ${p.className ?? ""}`}>
    <circle className="opx-i__t" cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="8.5" />
    <path className="opx-i__a opx-i__hand" d="M12 7.5V12l3 2" />
  </Glyph>
);

export const IcInbox = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4.5Z" />
    <path d="M3.5 13.5 6 5.6A2 2 0 0 1 7.9 4.2h8.2a2 2 0 0 1 1.9 1.4l2.5 7.9V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4.5Z" />
    <path className="opx-i__a" d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5" />
  </Glyph>
);

export const IcLogout = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
    <path d="M11 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H11" />
    <path className="opx-i__a" d="M15 8l4 4-4 4M19 12H9" />
  </Glyph>
);

export const IcBuilding = (p: CcxIconProps) => (
  <Glyph {...p}>
    <rect className="opx-i__t" x="4.5" y="3.5" width="10" height="17" rx="1.5" />
    <rect x="4.5" y="3.5" width="10" height="17" rx="1.5" />
    <path d="M14.5 9.5h4a1 1 0 0 1 1 1v10h-5M8 7.5h3M8 11h3M8 14.5h3" />
    <path className="opx-i__a" d="M8.5 20.5v-2.5h2v2.5" />
  </Glyph>
);

export const IcFeedback = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z" />
    <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z" />
    <path className="opx-i__a" d="M12 7.8v5M9.5 10.3h5" />
  </Glyph>
);

export const IcClose = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Glyph>
);

export const IcChevron = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="m7 10 5 5 5-5" />
  </Glyph>
);

export const IcCheck = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Glyph>
);

export const IcWave = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__a" d="M3 12h2.5l2-5 3 10 3-12 3 9 1.5-2H21" />
  </Glyph>
);

export const IcMenu = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Glyph>
);

export const IcStore = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M4.5 9.5h15v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9Z" />
    <path d="M4.5 9.5h15v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9ZM3.5 9.5 5 4.5h14l1.5 5" />
    <path className="opx-i__a" d="M9.5 20.5v-5h5v5" />
  </Glyph>
);

export function CcxEmblem({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} style={{ width: size, height: size }} aria-hidden="true" focusable="false" className={className ? `opx-emblem ${className}` : "opx-emblem"}>
      <defs>
        <linearGradient id="opx-em-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--opx-blue-hi)" />
          <stop offset="1" stopColor="var(--opx-teal-hi)" />
        </linearGradient>
      </defs>
      <rect className="opx-emblem__plate" x="1" y="1" width="46" height="46" rx="14" />
      <path className="opx-emblem__ring" d="M33.5 15.5a13 13 0 1 0 0 17" fill="none" stroke="url(#opx-em-g)" strokeWidth="3" strokeLinecap="round" />
      <path className="opx-emblem__wave" d="M17 24h3l2-5 3.5 10 2.5-7 1.5 2H35" fill="none" stroke="url(#opx-em-g)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const NAV_ICON: Record<string, CcxIcon> = {
  callCenter: IcNow,
  crm: IcPipeline,
  meetings: IcMeeting,
  supportTickets: IcSupport,
  teamTasks: IcTasks,
  callAnalytics: IcChart,
  studio: IcLayers,
  overview: IcGrid,
  marketplace: IcStore,
  profile: IcUser,
};

export const navIcon = (key: string): CcxIcon => NAV_ICON[key] ?? IcGrid;

export const IcBolt = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z" />
    <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z" />
  </Glyph>
);

export const IcScale = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M12 3.5v17M7 20.5h10M5 7h14M8.5 4.5 12 3.5l3.5 1" />
    <path className="opx-i__t" d="M2.5 14 5 8l2.5 6a2.5 2.5 0 0 1-5 0ZM16.5 14 19 8l2.5 6a2.5 2.5 0 0 1-5 0Z" />
    <path className="opx-i__a" d="M2.5 14 5 8l2.5 6a2.5 2.5 0 0 1-5 0ZM16.5 14 19 8l2.5 6a2.5 2.5 0 0 1-5 0Z" />
  </Glyph>
);

export const IcCoins = (p: CcxIconProps) => (
  <Glyph {...p}>
    <ellipse className="opx-i__t" cx="9.5" cy="7" rx="6" ry="2.5" />
    <ellipse cx="9.5" cy="7" rx="6" ry="2.5" />
    <path d="M3.5 7v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V7M3.5 11v4c0 1.4 2.7 2.5 6 2.5 1 0 2-.1 2.8-.3" />
    <circle className="opx-i__a" cx="17" cy="16.5" r="4" />
  </Glyph>
);

export const IcShield = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M12 3 19.5 6v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6L12 3Z" />
    <path d="M12 3 19.5 6v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6L12 3Z" />
    <path className="opx-i__a" d="m8.8 12 2.2 2.2 4.3-4.6" />
  </Glyph>
);

export const IcDoc = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5" />
    <path className="opx-i__a" d="M9 13h6M9 16.5h4" />
  </Glyph>
);

export const IcPhone = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M5 4h3.5l1.8 4.4-2.2 1.4a11 11 0 0 0 6.1 6.1l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z" />
  </Glyph>
);

export const IcCopy = (p: CcxIconProps) => (
  <Glyph {...p}>
    <rect className="opx-i__t" x="8.5" y="8.5" width="12" height="12" rx="2.5" />
    <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
    <path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
  </Glyph>
);

export const IcArrowRight = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Glyph>
);

export const IcArrowLeft = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Glyph>
);

export const IcSnooze = (p: CcxIconProps) => (
  <Glyph {...p}>
    <circle className="opx-i__t" cx="11" cy="13" r="7.5" />
    <circle cx="11" cy="13" r="7.5" />
    <path d="M11 9.5V13l2.2 1.6" />
    <path className="opx-i__a" d="M16.5 3.5h4l-4 4h4" />
  </Glyph>
);

export const IcNext = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M5 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.8l-10-6.5A1 1 0 0 0 5 5.5Z" />
    <path d="M5 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.8l-10-6.5A1 1 0 0 0 5 5.5Z" />
    <path className="opx-i__a" d="M19.5 5v14" />
  </Glyph>
);

export const IcTimeline = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M6 4v16" />
    <circle className="opx-i__a" cx="6" cy="7" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="6" cy="12" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="6" cy="17" r="1.8" fill="currentColor" stroke="none" />
    <path d="M10.5 7H19M10.5 12h6.5M10.5 17H18" />
  </Glyph>
);

export const IcQueues = (p: CcxIconProps) => (
  <Glyph {...p}>
    <rect className="opx-i__t" x="3.5" y="4" width="17" height="5" rx="2" />
    <rect x="3.5" y="4" width="17" height="5" rx="2" />
    <rect x="3.5" y="11" width="17" height="4" rx="2" opacity=".7" />
    <rect className="opx-i__a" x="3.5" y="17" width="11" height="3.5" rx="1.75" />
  </Glyph>
);

export const IcKeys = (p: CcxIconProps) => (
  <Glyph {...p}>
    <rect className="opx-i__t" x="2.5" y="6" width="19" height="12" rx="3" />
    <rect x="2.5" y="6" width="19" height="12" rx="3" />
    <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17.5 10h.01" strokeWidth="2.4" />
    <path className="opx-i__a" d="M8 14.2h8" />
  </Glyph>
);

export const IcRefresh = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M20 11.5A8 8 0 0 0 6.2 6.3L4 8.5" />
    <path d="M4 4v4.5h4.5" />
    <path className="opx-i__a" d="M4 12.5a8 8 0 0 0 13.8 5.2l2.2-2.2" />
    <path className="opx-i__a" d="M20 20v-4.5h-4.5" />
  </Glyph>
);

export const IcFlag = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M5 4.5h11l-2 4 2 4H5" />
    <path d="M5 21V4.5h11l-2 4 2 4H5" />
  </Glyph>
);

export const IcAward = (p: CcxIconProps) => (
  <Glyph {...p}>
    <circle className="opx-i__t" cx="12" cy="9" r="5.5" />
    <circle cx="12" cy="9" r="5.5" />
    <path d="m8.5 13.3-1.5 7.2 5-2.6 5 2.6-1.5-7.2" />
    <path className="opx-i__a" d="m10 9 1.4 1.4L14.2 7.6" />
  </Glyph>
);

export function JobIcon({ kind, size }: { kind: string; size?: number }) {
  switch (kind) {
    case "lead":
      return <IcInbox size={size} />;
    case "order":
      return <IcDoc size={size} />;
    case "urgent":
      return <IcBolt size={size} />;
    case "assignments":
      return <IcUser size={size} />;
    case "complaints":
      return <IcFlag size={size} />;
    case "refunds":
    case "payouts":
    case "payout_recoveries":
      return <IcCoins size={size} />;
    case "experience":
      return <IcScale size={size} />;
    case "achievements":
      return <IcAward size={size} />;
    default:
      return <IcLayers size={size} />;
  }
}
