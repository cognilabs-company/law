import type { ReactNode } from "react";
import type { CcxIconProps } from "../../icons";

function Gl({ size = 22, className, children, style, ...rest }: CcxIconProps & { children: ReactNode }) {
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

export const IcPlus = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M12 5v14M5 12h14" />
  </Gl>
);

export const IcList = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <path className="opx-i__a" d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth={2.6} />
  </Gl>
);

export const IcBoard = (p: CcxIconProps) => (
  <Gl {...p}>
    <rect className="opx-i__t" x="3.5" y="4" width="5" height="16" rx="1.8" />
    <rect x="3.5" y="4" width="5" height="16" rx="1.8" />
    <rect x="10" y="4" width="5" height="11" rx="1.8" />
    <rect className="opx-i__a" x="16.5" y="4" width="4" height="7" rx="1.6" />
  </Gl>
);

export const IcCase = (p: CcxIconProps) => (
  <Gl {...p}>
    <rect className="opx-i__t" x="3.5" y="7.5" width="17" height="12" rx="2.5" />
    <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
    <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
    <path className="opx-i__a" d="M3.5 12.5h17" />
  </Gl>
);

export const IcDots = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth={3} />
  </Gl>
);

export const IcUp = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Gl>
);

export const IcDown = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Gl>
);

export const IcCalendar = (p: CcxIconProps) => (
  <Gl {...p}>
    <rect className="opx-i__t" x="3.5" y="5" width="17" height="15" rx="2.5" />
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
    <path className="opx-i__a" d="M8 14h.01M12 14h.01M16 14h.01" strokeWidth={2.4} />
  </Gl>
);

export const IcPercent = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M18.5 5.5l-13 13" />
    <circle className="opx-i__a" cx="7" cy="7" r="2.5" />
    <circle className="opx-i__a" cx="17" cy="17" r="2.5" />
  </Gl>
);

export const IcSend = (p: CcxIconProps) => (
  <Gl {...p}>
    <path className="opx-i__t" d="M20.5 3.5 3.5 10.5l6.5 3 3 6.5 7.5-16.5Z" />
    <path d="M20.5 3.5 3.5 10.5l6.5 3 3 6.5 7.5-16.5Z" />
    <path className="opx-i__a" d="m10 13.5 4-4" />
  </Gl>
);

export const IcGlobe = (p: CcxIconProps) => (
  <Gl {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17" />
    <path className="opx-i__a" d="M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5Z" />
  </Gl>
);

export const IcFilter = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M4 6h16M7 12h10" />
    <path className="opx-i__a" d="M10 18h4" />
  </Gl>
);

export const IcBookmark = (p: CcxIconProps) => (
  <Gl {...p}>
    <path className="opx-i__t" d="M6.5 4h11v16l-5.5-4-5.5 4V4Z" />
    <path d="M6.5 4h11v16l-5.5-4-5.5 4V4Z" />
  </Gl>
);

export const IcBars = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M4 20h16" />
    <path d="M7 16v-5M12 16V6" />
    <path className="opx-i__a" d="M17 16v-8" />
  </Gl>
);

export const IcAlert = (p: CcxIconProps) => (
  <Gl {...p}>
    <path className="opx-i__t" d="M10.3 4.3 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
    <path d="M10.3 4.3 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
    <path className="opx-i__a" d="M12 9.5v4M12 16.8h.01" />
  </Gl>
);

export const IcPower = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M12 3.5v8" />
    <path className="opx-i__a" d="M7 6.5a7.5 7.5 0 1 0 10 0" />
  </Gl>
);
