import type { ReactNode } from "react";
import type { CcxIconProps } from "../../icons";

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

export const IcPlus = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M12 5v14M5 12h14" />
  </Glyph>
);

export const IcChat = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z" />
    <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z" />
    <path className="opx-i__a" d="M8 9.5h8M8 12.5h5" />
  </Glyph>
);

export const IcEdit = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M15.5 4.5 19.5 8.5 9 19H5v-4L15.5 4.5Z" />
    <path d="M15.5 4.5 19.5 8.5 9 19H5v-4L15.5 4.5Z" />
    <path className="opx-i__a" d="m13 7 4 4" />
  </Glyph>
);

export const IcPlay = (p: CcxIconProps) => (
  <Glyph {...p}>
    <circle className="opx-i__t" cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="8.5" />
    <path className="opx-i__a" d="M10.2 8.8v6.4l5-3.2-5-3.2Z" />
  </Glyph>
);

export const IcTrend = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M3.5 19.5h17" />
    <path className="opx-i__a" d="m4.5 15 5-5 3.5 3.5 6.5-7" />
    <path d="M15 6.5h4.5V11" />
  </Glyph>
);

export const IcPercent = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M18.5 5.5 5.5 18.5" />
    <circle className="opx-i__a" cx="7.5" cy="7.5" r="2.5" />
    <circle className="opx-i__a" cx="16.5" cy="16.5" r="2.5" />
  </Glyph>
);

export const IcAlert = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M10.3 4.2 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M10.3 4.2 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4.5M12 17.2h.01" />
  </Glyph>
);
