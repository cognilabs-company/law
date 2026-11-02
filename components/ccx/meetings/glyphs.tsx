import type { ReactNode } from "react";
import type { CcxIconProps } from "../icons";

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

export const IcCalendar = (p: CcxIconProps) => (
  <Glyph {...p}>
    <rect className="opx-i__t" x="3.5" y="5" width="17" height="15.5" rx="3" />
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path className="opx-i__a" d="M8 14h2M14 14h2M8 17h2" />
  </Glyph>
);

export const IcPlus = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M12 5v14M5 12h14" />
  </Glyph>
);

export const IcUsers = (p: CcxIconProps) => (
  <Glyph {...p}>
    <circle className="opx-i__t" cx="9" cy="8.5" r="3.5" />
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 19.5a6.5 6.5 0 0 1 13 0" />
    <path className="opx-i__a" d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.3" />
  </Glyph>
);

export const IcOpen = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M8 16 16 8M9.5 8H16v6.5" />
  </Glyph>
);
