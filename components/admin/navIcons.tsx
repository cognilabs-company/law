import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base: P = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const NavOverview = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="3.5" width="7" height="9" rx="1.8" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.8" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.8" />
    <rect x="3.5" y="15.5" width="7" height="5" rx="1.8" />
  </svg>
);

export const NavCeo = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="3.5" width="18" height="12.5" rx="2" />
    <path d="M7 12.5l3-3 2.5 2 4.5-4.5" />
    <path d="M12 16v3.5M8.5 20.5h7" />
  </svg>
);

export const NavLiveOffice = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8.5 20h7M12 16v4" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M12.5 8.5a3 3 0 010 3M15 7a5.2 5.2 0 010 6" />
  </svg>
);

export const NavPipeline = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 4.5h17l-6.5 8v6.2l-4 1.8v-8L3.5 4.5z" />
  </svg>
);

export const NavCallCenter = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 14v-2a8 8 0 0116 0v2" />
    <rect x="3" y="13" width="4" height="6" rx="1.5" />
    <rect x="17" y="13" width="4" height="6" rx="1.5" />
    <path d="M19 19c0 1.4-1.6 2-4 2h-2" />
  </svg>
);

export const NavMeetings = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
    <path d="M15.5 10.5l5-3v9l-5-3" />
  </svg>
);

export const NavCallAnalytics = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 4h3l1.5 4-2 1.3a10 10 0 004.2 4.2L13 11.5l4 1.5v3a1.6 1.6 0 01-1.7 1.6A13 13 0 013.4 5.7 1.6 1.6 0 015 4z" />
    <path d="M16 3v5M19 5v3M22 2v6" />
  </svg>
);

export const NavRetention = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 12a8 8 0 11-2.3-5.7" />
    <path d="M20 4v4h-4" />
    <circle cx="12" cy="11" r="2.2" />
    <path d="M8.5 16.5a4 4 0 017 0" />
  </svg>
);

export const NavB2b = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20.5V5a1.5 1.5 0 011.5-1.5h7A1.5 1.5 0 0114 5v15.5" />
    <path d="M14 9.5h4.5A1.5 1.5 0 0120 11v9.5" />
    <path d="M2.5 20.5h19M7.5 7.5h3M7.5 11h3M7.5 14.5h3M16.5 13.5v.01M16.5 17v.01" />
  </svg>
);

export const NavMarketplace = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 9.5V19a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0020 19V9.5" />
    <path d="M3 9.5l1.6-5A1.5 1.5 0 016 3.5h12a1.5 1.5 0 011.4 1l1.6 5" />
    <path d="M3 9.5a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0" />
    <path d="M9.5 20.5v-5h5v5" />
  </svg>
);

export const NavServices = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8.5 7V5.5A1.5 1.5 0 0110 4h4a1.5 1.5 0 011.5 1.5V7" />
    <path d="M3 12.5h18M10.5 12.5v1.5h3v-1.5" />
  </svg>
);

export const NavPlans = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 8l4.2 3.2L12 5l4.3 6.2L20.5 8l-1.8 10H5.3L3.5 8z" />
    <path d="M6 20.5h12" />
  </svg>
);

export const NavTemplates = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 3.5h7l4 4V17a1.5 1.5 0 01-1.5 1.5H8A1.5 1.5 0 016.5 17V5A1.5 1.5 0 018 3.5z" />
    <path d="M15 3.5V7.5h4" />
    <path d="M6.5 6.5H5A1.5 1.5 0 003.5 8v11A1.5 1.5 0 005 20.5h9" />
    <path d="M10 11h5M10 14h3" />
  </svg>
);

export const NavAds = (p: P) => (
  <svg {...base} {...p}>
    <path d="M7 9.5H5A1.5 1.5 0 003.5 11v2A1.5 1.5 0 005 14.5h2l7 4.5V5L7 9.5z" />
    <path d="M7 14.5l1.4 5h2.6l-1.2-4.2" />
    <path d="M17.5 9a4 4 0 010 6M19.8 6.8a7 7 0 010 10.4" />
  </svg>
);

export const NavStudio = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
    <circle cx="17" cy="7" r="3.5" />
    <path d="M7 13.5l3.8 7H3.2L7 13.5z" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
  </svg>
);

export const NavRegisterRequests = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="10" cy="8" r="3.8" />
    <path d="M3.5 20a6.5 6.5 0 0110.3-5.3" />
    <path d="M15.5 18l2 2 4-4.5" />
  </svg>
);

export const NavReviews = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.5 4h15A1.5 1.5 0 0121 5.5v10a1.5 1.5 0 01-1.5 1.5H10l-4.5 3.5V17h-1A1.5 1.5 0 013 15.5v-10A1.5 1.5 0 014.5 4z" />
    <path d="M12 7.3l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3 1-2.1z" />
  </svg>
);

export const NavPayouts = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 7.5A2.5 2.5 0 016 5h11a1 1 0 011 1v3" />
    <path d="M3.5 7.5v10A2.5 2.5 0 006 20h13a1.5 1.5 0 001.5-1.5v-8A1.5 1.5 0 0019 9H6a2.5 2.5 0 01-2.5-1.5" />
    <path d="M16.5 14.5h.01" />
  </svg>
);

export const NavApprovals = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 13.5V10a3 3 0 116 0v3.5" />
    <path d="M4.5 16.5a1.5 1.5 0 011.5-1.5h12a1.5 1.5 0 011.5 1.5v2h-15v-2z" />
    <path d="M5 21h14" />
  </svg>
);

export const NavSupport = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M6 6l3.5 3.5M14.5 14.5L18 18M18 6l-3.5 3.5M9.5 14.5L6 18" />
  </svg>
);

export const NavLegalAid = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3.5v17M7.5 20.5h9M5 6.5h14" />
    <path d="M5 6.5l-2.5 6a3 3 0 005 0L5 6.5zM19 6.5l-2.5 6a3 3 0 005 0L19 6.5z" />
  </svg>
);

export const NavNotifications = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15l1.5-2z" />
    <path d="M10 20.5a2.2 2.2 0 004 0" />
  </svg>
);

export const NavInternal = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="11" r="2.3" />
    <path d="M5.8 16a3.4 3.4 0 016.4 0M14.5 10h4M14.5 13.5h3" />
  </svg>
);

export const NavIntegrations = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 3.5v4M15 3.5v4" />
    <path d="M6.5 7.5h11V11a5.5 5.5 0 01-11 0V7.5z" />
    <path d="M12 16.5v4" />
  </svg>
);

export const NavTestOtps = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="15" r="4.5" />
    <path d="M11.3 11.7L20 3M16.5 6.5l2.5 2.5M14.5 8.5l1.5 1.5" />
  </svg>
);

export const NavRoles = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6L12 3z" />
    <circle cx="12" cy="10" r="2.3" />
    <path d="M8.3 15.6a4.2 4.2 0 017.4 0" />
  </svg>
);

export const NavAudit = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 12a8.5 8.5 0 101.8-5.3" />
    <path d="M3.5 4v3.5H7" />
    <path d="M12 8v4.3l3 1.8" />
  </svg>
);

export const NavLegal = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14 3.5H7A1.5 1.5 0 005.5 5v14A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5V8L14 3.5z" />
    <path d="M14 3.5V8h4.5M8.5 12h7" />
    <path d="M8.5 17c1-1.3 1.8-1.3 2.4 0 .6 1.2 1.3 1.2 2.1 0 .5-.7 1-.8 2.5-.5" />
  </svg>
);

export const NavPolicies = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.5 5A1.5 1.5 0 016 3.5h12.5v14H6A1.5 1.5 0 004.5 19V5z" />
    <path d="M4.5 19A1.5 1.5 0 006 20.5h12.5v-3" />
    <path d="M9 8h6M9 11.5h4" />
  </svg>
);

export const NavAiReglaments = (p: P) => (
  <svg {...base} {...p}>
    <path d="M13 3.5H7A1.5 1.5 0 005.5 5v14A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5v-8" />
    <path d="M9 13h5M9 16.5h3" />
    <path d="M18 2.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
  </svg>
);

export const NavChevron = (p: P) => (
  <svg {...base} {...p}>
    <path d="M7 10l5 5 5-5" />
  </svg>
);
