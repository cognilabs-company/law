import type { ReactNode } from "react";
import type { CcxIconProps } from "../../icons";

function G({ size = 18, className, children, style, ...rest }: CcxIconProps & { children: ReactNode }) {
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

export const IcMail = (p: CcxIconProps) => (
  <G {...p}>
    <rect className="opx-i__t" x="3" y="5" width="18" height="14" rx="2.5" />
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path className="opx-i__a" d="m4 7.5 8 5.5 8-5.5" />
  </G>
);

export const IcSend = (p: CcxIconProps) => (
  <G {...p}>
    <path className="opx-i__t" d="M21 3 14.5 21l-4-7.5L3 9.5 21 3Z" />
    <path d="M21 3 14.5 21l-4-7.5L3 9.5 21 3Z" />
    <path className="opx-i__a" d="M21 3 10.5 13.5" />
  </G>
);

export const IcStar = (p: CcxIconProps) => (
  <G {...p}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
  </G>
);

export const IcEdit = (p: CcxIconProps) => (
  <G {...p}>
    <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4Z" />
    <path className="opx-i__a" d="m13.5 6.5 4 4" />
  </G>
);

export const IcPlus = (p: CcxIconProps) => (
  <G {...p}>
    <path d="M12 5v14M5 12h14" />
  </G>
);

export const IcSpark = (p: CcxIconProps) => (
  <G {...p}>
    <path className="opx-i__t" d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15A2 2 0 0 0 9 13.8L3.5 12 9 10.2A2 2 0 0 0 10.2 9L12 3.5Z" />
    <path d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15A2 2 0 0 0 9 13.8L3.5 12 9 10.2A2 2 0 0 0 10.2 9L12 3.5Z" />
  </G>
);

export const IcTarget = (p: CcxIconProps) => (
  <G {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle className="opx-i__a" cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </G>
);

export const IcUsers = (p: CcxIconProps) => (
  <G {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path className="opx-i__a" d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.3A6.5 6.5 0 0 1 21.5 20" />
  </G>
);

export const IcUserPlus = (p: CcxIconProps) => (
  <G {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path className="opx-i__a" d="M19 8v6M16 11h6" />
  </G>
);

export const IcMic = (p: CcxIconProps) => (
  <G {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path className="opx-i__a" d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </G>
);

export const IcGlobe = (p: CcxIconProps) => (
  <G {...p}>
    <circle cx="12" cy="12" r="9" />
    <path className="opx-i__a" d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </G>
);

export const IcCart = (p: CcxIconProps) => (
  <G {...p}>
    <path d="M3 4h2.5l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" />
    <circle className="opx-i__a" cx="10" cy="19.5" r="1.3" />
    <circle className="opx-i__a" cx="17" cy="19.5" r="1.3" />
  </G>
);

export const IcChat = (p: CcxIconProps) => (
  <G {...p}>
    <path className="opx-i__t" d="M4 5.5h16v11H9l-5 4v-15Z" />
    <path d="M4 5.5h16v11H9l-5 4v-15Z" />
  </G>
);

export const IcBell = (p: CcxIconProps) => (
  <G {...p}>
    <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" />
    <path className="opx-i__a" d="M10 20.5a2 2 0 0 0 4 0" />
  </G>
);

export const IcClip = (p: CcxIconProps) => (
  <G {...p}>
    <path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L14.8 7" />
  </G>
);

export const IcHistory = (p: CcxIconProps) => (
  <G {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
    <path d="M3.5 4.5V9H8" />
    <path className="opx-i__a" d="M12 8v4.5l3 2" />
  </G>
);

export const IcPin = (p: CcxIconProps) => (
  <G {...p}>
    <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z" />
    <circle className="opx-i__a" cx="12" cy="10" r="2.3" />
  </G>
);

export const IcLink = (p: CcxIconProps) => (
  <G {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path className="opx-i__a" d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </G>
);

export const IcAlert = (p: CcxIconProps) => (
  <G {...p}>
    <path d="M12 4 2.8 19.5h18.4L12 4Z" />
    <path className="opx-i__a" d="M12 10v4.5M12 17.2h.01" />
  </G>
);

export const IcInfo = (p: CcxIconProps) => (
  <G {...p}>
    <circle cx="12" cy="12" r="9" />
    <path className="opx-i__a" d="M12 11v5.5M12 7.8h.01" />
  </G>
);

export const IcVerified = (p: CcxIconProps) => (
  <G {...p}>
    <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" />
    <path className="opx-i__a" d="m9 12 2 2 4-4" />
  </G>
);

export const IcExternal = (p: CcxIconProps) => (
  <G {...p}>
    <path className="opx-i__a" d="M14 4h6v6M20 4l-9 9" />
    <path d="M19 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H10" />
  </G>
);

export const IcArchive = (p: CcxIconProps) => (
  <G {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9" />
    <path className="opx-i__a" d="M10 13h4" />
  </G>
);

export const IcPlay = (p: CcxIconProps) => (
  <G {...p}>
    <path d="M7 5v14l11-7L7 5Z" />
  </G>
);
