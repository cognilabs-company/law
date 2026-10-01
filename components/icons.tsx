import type { ComponentType, SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base: P = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const IconLogo = () => <img src="/logo.png" alt="" />;

export const IconUser = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 21a8 8 0 10-16 0" />
    <circle cx="12" cy="8" r="4" />
  </svg>
);

export const IconFileText = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14 3v5h5M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
    <path d="M9 13h6M9 17h4" />
  </svg>
);

export const IconSparkle = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
    <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
  </svg>
);

export const IconStar = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

export const IconArrowRight = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const IconBolt = (p: P) => (
  <svg {...base} {...p}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);

export const IconVideo = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15 10l5-3v10l-5-3v-4z" />
    <rect x="2" y="6" width="13" height="12" rx="3" />
  </svg>
);

export const IconShield = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l8 4v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V7l8-4z" />
  </svg>
);

export const IconShieldCheck = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l8 4v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V7l8-4z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const IconBuilding = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="8" width="18" height="12" rx="3" />
    <path d="M9 8V6a2 2 0 012-2h2a2 2 0 012 2v2" />
  </svg>
);

export const IconGift = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="10" width="18" height="11" rx="2" />
    <path d="M12 10V7a4 4 0 00-4-3c-2 0-3 1.4-3 3s2 3 4 3h6c2 0 4-1.4 4-3s-1-3-3-3a4 4 0 00-4 3z" />
  </svg>
);

export const IconDocLines = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 6h16M4 12h16M4 18h9" />
    <circle cx="18" cy="18" r="3" />
  </svg>
);

export const IconInfo = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const IconSend = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}>
    <path d="M4 12l16-8-6 16-2-6-8-2z" />
  </svg>
);

export const IconChevronLeft = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const IconChat = (p: P) => (
  <svg {...base} {...p}>
    <path d="M21 12a8 8 0 01-8 8H4l2.3-2.3A8 8 0 1121 12z" />
  </svg>
);

export const IconChatDots = (p: P) => (
  <svg {...base} {...p}>
    <path d="M21 12a8 8 0 01-8 8H4l2.3-2.3A8 8 0 1121 12z" />
    <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconClock = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconAlert = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9L2.4 17a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
  </svg>
);

export const IconRefresh = (p: P) => (
  <svg {...base} {...p}>
    <path d="M21 12a9 9 0 11-3-6.7" />
    <path d="M21 4v5h-5" />
  </svg>
);

export const IconClipboardCheck = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
  </svg>
);

export const IconScale = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 4v16M6 8h12M8 8l-3 6h6L8 8zm8 0l-3 6h6l-3-6z" />
  </svg>
);

// Judge's gavel — used for the advocate account type.
export const IconGavel = (p: P) => (
  <svg {...base} {...p}>
    <path d="m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8" />
    <path d="m16 16 6-6" />
    <path d="m8 8 6-6" />
    <path d="m9 7 8 8" />
    <path d="m21 11-8-8" />
    <path d="M4 22h10" />
  </svg>
);

export const IconEdit = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const IconGraduation = (p: P) => (
  <svg {...base} {...p}>
    <path d="M22 10L12 5 2 10l10 5 10-5z" />
    <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
  </svg>
);

export const IconHome = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 11l9-7 9 7v8a2 2 0 01-2 2h-4v-6H9v6H5a2 2 0 01-2-2v-8z" />
  </svg>
);

export const IconGrid = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </svg>
);

// Minimise (a floating meeting panel collapses to its title bar).
export const IconMinus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 12h14" />
  </svg>
);

export const IconCard = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2" y="5" width="20" height="14" rx="3" />
    <path d="M2 10h20M6 15h4" />
  </svg>
);

export const IconGlobe = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
  </svg>
);

export const IconApple = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.6} {...p}>
    <path d="M12 6c.6-2 2.2-3.4 4-3.5.2 1.9-.6 3.5-1.8 4.4M17 12c0-2.3 1.8-3.4 1.9-3.5-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.6-.9 1-1.8 1.2-2.4-2.6-1-2.6-4.6-2.6-4.7z" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconMenu = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const IconCalendar = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="4.5" width="18" height="17" rx="3" />
    <path d="M3 9h18M8 2.5v4M16 2.5v4" />
  </svg>
);

export const IconUsers = (p: P) => (
  <svg {...base} {...p}>
    <path d="M16 20a5 5 0 00-10 0" />
    <circle cx="11" cy="8" r="3.4" />
    <path d="M18.5 19a4 4 0 00-3-3.7M17 9a3 3 0 000-4.5" />
  </svg>
);

export const IconLogout = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15 5H6a2 2 0 00-2 2v10a2 2 0 002 2h9" />
    <path d="M14 12h7M18 8l4 4-4 4" />
  </svg>
);

export const IconBriefcase = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <path d="M8 7V5.5A1.5 1.5 0 019.5 4h5A1.5 1.5 0 0116 5.5V7M3 12h18" />
  </svg>
);

export const IconDownload = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3v12M7 11l5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

export const IconExternal = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
  </svg>
);

export const IconGooglePlay = (p: P) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fff"
    strokeWidth={1.6}
    strokeLinejoin="round"
    {...p}
  >
    <path d="M4 3l11 9L4 21V3z" />
    <path d="M15 12l4-2.3M15 12l4 2.3" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const IconMapPin = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const IconPhone = (p: P) => (
  <svg {...base} {...p}>
    <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.2-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z" />
  </svg>
);

export const IconMail = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M2 7l10 6 10-6" />
  </svg>
);

export const IconUpload = (p: P) => (
  <svg {...base} {...p}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v13" />
  </svg>
);

export const IconAward = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8" r="6" />
    <path d="M8.2 13.3L7 22l5-3 5 3-1.2-8.7" />
  </svg>
);

export const IconTrendingUp = (p: P) => (
  <svg {...base} {...p}>
    <path d="M22 7l-8.5 8.5-5-5L2 17" />
    <path d="M16 7h6v6" />
  </svg>
);

export const IconEye = (p: P) => (
  <svg {...base} {...p}>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <path d="M6.61 6.61A18.5 18.5 0 0 0 1 12s4 8 11 8a9.12 9.12 0 0 0 5.39-1.61" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export const IconRocket = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.9.7-2.2-.1-3-.8-.8-2.1-.8-2.9 0z" />
    <path d="M9 12a12 12 0 018-9c1 3.5.3 6.6-2 9-1.3 1.4-3 2.4-4.6 3L9 12z" />
    <path d="M9 12l-3-1M12 15l1 3" />
    <circle cx="15" cy="9" r="1" />
  </svg>
);

export const IconTarget = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" />
  </svg>
);

export const IconLanguage = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 5h9M9 4c0 6-3 11-6 13" />
    <path d="M6 9c0 3 3 5 7 6" />
    <path d="M13 20l4-9 4 9M14.5 17h5" />
  </svg>
);

export const IconMic = (p: P) => (
  <svg {...base} {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0014 0M12 18v3" />
  </svg>
);

export const IconMicOff = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 9v2a3 3 0 004.5 2.6M15 11V6a3 3 0 00-5.9-.7" />
    <path d="M5 11a7 7 0 0011 5.3M12 18v3M3 3l18 18" />
  </svg>
);

export const IconUserPlus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M16 21a6 6 0 00-12 0" />
    <circle cx="10" cy="8" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </svg>
);

export const IconFolder = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  </svg>
);

export const IconSun = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

export const IconMoon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
  </svg>
);

export const IconMonitor = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
);

export const IconBell = (p: P) => (
  <svg {...base} {...p}>
    <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 01-3.4 0" />
  </svg>
);

export const IconLock = (p: P) => (
  <svg {...base} {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2.5" />
    <path d="M8 11V8a4 4 0 018 0v3" />
    <circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

export const IconFolderPlus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    <path d="M12 11v4M10 13h4" />
  </svg>
);

export const IconList = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

export const IconMoreHorizontal = (p: P) => (
  <svg {...base} strokeWidth={2.6} {...p}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" />
  </svg>
);

export const IconBgPerson = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="12" cy="10.5" r="2.8" />
    <path d="M6.8 20a5.2 5.2 0 0110.4 0" />
    <path d="M17.5 7.5h.01M6.5 7.5h.01" />
  </svg>
);

export const IconImage = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="8.5" cy="8.5" r="1.7" />
    <path d="M21 15l-5.5-5.5L4 21" />
  </svg>
);

export const IconCheckDouble = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M2 13l4 4 8-9" />
    <path d="M12 15.5l1.5 1.5 8-9" />
  </svg>
);

export const IconCrown = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" />
    <path d="M5 21h14" />
  </svg>
);

export const IconGem = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 3h12l3 5-9 13L3 8l3-5z" />
    <path d="M3 8h18M9 3l3 5-3 13M15 3l-3 5 3 13" />
  </svg>
);

export const IconLeaf = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 4C10 4 4 10 4 18v2h2c8 0 14-6 14-16z" />
    <path d="M8 20c2-6 5-9 12-14" />
  </svg>
);

export const IconHeadset = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 14v-2a8 8 0 0116 0v2" />
    <rect x="2.5" y="13" width="5" height="7" rx="2" />
    <rect x="16.5" y="13" width="5" height="7" rx="2" />
    <path d="M20 20v1a3 3 0 01-3 3h-3" />
  </svg>
);

export const IconChartBar = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20V10M12 20V4M20 20v-7" />
    <path d="M2 20h20" />
  </svg>
);

// "Stop" — the filled square a recording turns into, sized to read as solid
// at 17px rather than as an outlined box.
export const IconSquare = (p: P) => (
  <svg {...base} fill="currentColor" strokeWidth={1.5} {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="3" />
  </svg>
);

// Telegram's attach control: a paperclip leaning right, not the upright
// office-clip most icon sets draw. The arc is one open loop whose tail stops
// short of the head, which is what makes it read as a clip at 16px.
export const IconPaperclip = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20.4 11.1l-8.2 8.2a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" />
  </svg>
);

// iOS's record control (SF Symbol `record.circle`): a thin ring with a solid
// disc inside it. Drawn as two elements rather than one stroked circle so the
// disc stays solid at every size — that fill is the whole signal.
export const IconRecord = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" strokeWidth={1.7} />
    <circle cx="12" cy="12" r="4.6" fill="currentColor" stroke="none" />
  </svg>
);

// Play and pause, filled rather than outlined: at 15px a stroked triangle
// reads as an arrow, and a stroked pause as two stray lines.
export const IconPlay = (p: P) => (
  <svg {...base} fill="currentColor" strokeWidth={1.2} {...p}>
    <path d="M8 5.6a1 1 0 011.5-.87l9 6.4a1 1 0 010 1.74l-9 6.4A1 1 0 018 18.4V5.6z" />
  </svg>
);
export const IconPause = (p: P) => (
  <svg {...base} fill="currentColor" strokeWidth={1.2} {...p}>
    <rect x="6.5" y="5.5" width="4" height="13" rx="1.3" />
    <rect x="13.5" y="5.5" width="4" height="13" rx="1.3" />
  </svg>
);

// A five-point star, for ratings. The IconStar above is a four-point
// sparkle and reads as "AI", not as "one of five".
export const IconStarRate = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3.2l2.7 5.5 6 .9-4.35 4.24 1.03 5.99L12 17l-5.38 2.83 1.03-5.99L3.3 9.6l6-.9L12 3.2z" />
  </svg>
);

// A label tied to a thing — the kind of document a request asks for.
export const IconTag = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20.6 12.6l-8 8a2 2 0 01-2.8 0l-6.4-6.4A2 2 0 013 12.8V5a2 2 0 012-2h7.8a2 2 0 011.4.6l6.4 6.4a2 2 0 010 2.8z" />
    <circle cx="8.2" cy="8.2" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

// Two sheets stacked — "this one box holds more than one kind".
export const IconLayers = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3.4 13L12 17.7 20.6 13" />
  </svg>
);

// A parcel, for the service packages — a folder said "files", which is not
// what a package is.
export const IconPackage = (p: P) => (
  <svg {...base} {...p}>
    <path d="M21 8.2v7.6a2 2 0 01-1 1.73l-7 4a2 2 0 01-2 0l-7-4a2 2 0 01-1-1.73V8.2a2 2 0 011-1.73l7-4a2 2 0 012 0l7 4A2 2 0 0121 8.2z" />
    <path d="M3.3 7.1L12 12l8.7-4.9M12 12v10" />
    <path d="M7.5 4.6l8.8 5" />
  </svg>
);

// Document analysis: the page, plus the lens that is being run over it.
export const IconDocSearch = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14 3v5h5M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h4" />
    <circle cx="16.5" cy="15.5" r="3.5" />
    <path d="M19.2 18.2L22 21" />
  </svg>
);

// A checklist on a board — the intake questionnaire, which a magnifier did
// not describe.
export const IconClipboardList = (p: P) => (
  <svg {...base} {...p}>
    <rect x="8" y="2.5" width="8" height="4" rx="1.4" />
    <path d="M16 4.5h1.5A1.5 1.5 0 0119 6v13.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 19.5V6a1.5 1.5 0 011.5-1.5H8" />
    <path d="M8.7 11h6.6M8.7 15h4.4" />
  </svg>
);

// ── Tezkor advokat: one icon per service, each drawn for its own name ──
//
// The six services used to share the generic set (a camera, a bolt, a
// warning triangle, a chat bubble, the scales, a group of people), and two of
// them — the pair inside the "Ikkinchi fikr" dialog — said nothing about what
// they were: the scales mean "law" on every other screen, and a crowd of
// people is not "a panel of advocates giving a second opinion".
//
// These are drawn at the size they are actually used (20-21px in the card
// tile, 17px in the segmented tabs), which is why they run on a 1.6 stroke
// instead of the shared 2: at 20px a 2px stroke closes up the interior detail
// that tells two of these apart. The solid accents are the one mark that
// carries each icon's meaning — the bolt, the impact, the check, the gavel —
// so the difference survives even at tab size.
const fine: P = { ...base, strokeWidth: 1.6 };

// Scheduled video consultation: a real meeting with a person in frame.
export const IconVideoConsult = (p: P) => (
  <svg {...fine} {...p}>
    <rect x="2.4" y="5" width="13.4" height="14" rx="3.2" />
    <path d="M19.2 9.1l2.4-1.5v8.8l-2.4-1.5" />
    <circle cx="9.1" cy="10.4" r="2.1" />
    <path d="M5.6 16.4a3.7 3.7 0 017 0" />
  </svg>
);

// Express: the same call, but it rings a duty advocate the instant it is
// made — a headset with the bolt struck through it.
export const IconExpressCall = (p: P) => (
  <svg {...fine} {...p}>
    <path d="M4.3 13.6v-1.8a7.7 7.7 0 0115.4 0v1.8" />
    <path d="M4.3 12.9h1.5a1.6 1.6 0 011.6 1.6v2.6a1.6 1.6 0 01-1.6 1.6H5.5a1.2 1.2 0 01-1.2-1.2v-4.6z" />
    <path d="M19.7 12.9h-1.5a1.6 1.6 0 00-1.6 1.6v2.6a1.6 1.6 0 001.6 1.6h.3a1.2 1.2 0 001.2-1.2v-4.6z" />
    <path d="M12.9 7.6l-2.3 3.4h2.6l-.6 3.2 2.5-3.5h-2.6l.4-3.1z" fill="currentColor" stroke="none" />
  </svg>
);

// Traffic-accident consultation: a car in side view with the impact struck
// off its nose. One car reads at 17px where two did not — the earlier pair
// collapsed into two indistinct blobs.
export const IconTrafficCase = (p: P) => (
  <svg {...fine} {...p}>
    <path d="M2.4 16.2v-2.5l1.7-3.9A1.9 1.9 0 015.8 8.7h6.3a1.9 1.9 0 011.7 1.1l1.7 3.9v2.5" />
    <path d="M2.4 16.2h13.1M4.2 13.3h9.5" />
    <circle cx="5.8" cy="16.5" r="1.6" />
    <circle cx="12.4" cy="16.5" r="1.6" />
    <path d="M18 9.2l2.3-1.7M18.6 12.1h2.9M18.2 15l2.4 1.4" />
  </svg>
);

// Chat consultation: the advocate's answer arrives written — a bubble of
// text with a pen over it. No tick here: the tick belongs to the second
// opinion below, and two icons wearing one would say the same thing twice.
export const IconChatConsult = (p: P) => (
  <svg {...fine} {...p}>
    <rect x="2.4" y="3.6" width="14.8" height="11.3" rx="3.4" />
    <path d="M7.3 14.9v3.6l3.9-3.6" />
    <path d="M6.1 7.7h7.4M6.1 11.1h4.9" />
    <path d="M21.2 13.6l1.4 1.4-4.8 4.8-2 .6.6-2 4.8-4.8z" />
  </svg>
);

// Second opinion, one advocate: a first view already given, and a second,
// independent one set beside it and signed off.
export const IconSecondOpinion = (p: P) => (
  <svg {...fine} {...p}>
    <path d="M2.6 8.4a4.9 4.9 0 014.9-4.9h3.2a4.9 4.9 0 010 9.8H7.5l-3.2 2.4.6-2.9a4.9 4.9 0 01-2.3-4.4z" opacity=".45" />
    <path d="M21.4 14.1a5.2 5.2 0 00-5.2-5.2h-3.4a5.2 5.2 0 000 10.4h3.4l3.4 2.6-.6-3.1a5.2 5.2 0 002.4-4.7z" />
    <path d="M14.1 14.2l1.6 1.6 3-3.1" />
  </svg>
);

// Second opinion, a panel: three advocates on the bench and the one verdict
// they agree on. A gavel was tried here and read as a scribble at 20px; the
// check is what the client is actually buying — a shared conclusion.
export const IconOpinionPanel = (p: P) => (
  <svg {...fine} {...p}>
    <circle cx="12" cy="5.1" r="2.5" />
    <path d="M7.9 12a4.2 4.2 0 018.2 0" />
    <circle cx="4.5" cy="7.3" r="1.9" />
    <path d="M1.7 13a3 3 0 014.2-2.6" />
    <circle cx="19.5" cy="7.3" r="1.9" />
    <path d="M22.3 13a3 3 0 00-4.2-2.6" />
    <path d="M8.3 18.4l2.6 2.6 4.8-5.4" />
  </svg>
);

// ── "Kimdan maslahat olasiz?" — the two answers, told apart ───────────
//
// The choice is a human advocate or LexGo's AI, and it was drawn with the
// scales and a plain chat bubble: the scales are what every legal screen on
// the site already wears, and a bubble with three dots is any chat anywhere.
// Neither said which of the two you were picking. These do — a person behind
// the scales, and an answer with the spark in it.

// A real advocate: a person, with the law behind them rather than instead of
// them. Same 1.6 stroke as the Tezkor set, for the same reason.
export const IconAdvocatePerson = (p: P) => (
  <svg {...fine} {...p}>
    <circle cx="8.6" cy="8.2" r="3.3" />
    <path d="M2.4 20.2a6.2 6.2 0 0112.4 0" />
    <path d="M18.5 3.3v7.2M15.8 5.4h5.4M16.9 10.5h3.2" />
    <path d="M15.8 5.4l-1.3 2.9h2.6l-1.3-2.9zM21.2 5.4l-1.3 2.9h2.6l-1.3-2.9z" />
  </svg>
);

// The AI's answer: a reply with the spark inside it, so the spark is what the
// answer is made of rather than a badge stuck on a generic bubble.
export const IconAiAnswer = (p: P) => (
  <svg {...fine} {...p}>
    <path d="M20.8 11.7a8 8 0 01-8 8H6.9L3 22.2l1.1-4.1a8 8 0 016.7-12.3h2a8 8 0 018 5.9" />
    <path d="M11.8 7.7l1.2 2.9 2.9 1.2-2.9 1.2-1.2 2.9-1.2-2.9L7.7 11.8l2.9-1.2 1.2-2.9z" />
    <path d="M17.4 3.1l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6.6-1.5z" fill="currentColor" stroke="none" />
  </svg>
);

// Name → component registry so data files can reference icons by string.
const ICON_MAP: Record<string, ComponentType<P>> = {
  IconChatDots,
  IconFileText,
  IconBuilding,
  IconDocLines,
  IconUsers,
  IconHome,
  IconCard,
  IconBriefcase,
  IconScale,
  IconGavel,
  IconShield,
  IconShieldCheck,
  IconSparkle,
  IconGlobe,
  IconGrid,
  IconSearch,
  IconVideo,
  IconClipboardCheck,
  IconDownload,
  IconUser,
  IconStar,
  IconBolt,
  IconAward,
  IconTrendingUp,
  IconEye,
  IconEyeOff,
  IconRocket,
  IconTarget,
  IconGraduation,
  IconAlert,
  IconClock,
  IconChat,
  IconVideoConsult,
  IconExpressCall,
  IconTrafficCase,
  IconChatConsult,
  IconSecondOpinion,
  IconOpinionPanel,
  IconAdvocatePerson,
  IconAiAnswer,
};

export function Icon({ name, ...p }: { name: string } & P) {
  const C = ICON_MAP[name] ?? IconGrid;
  return <C {...p} />;
}
