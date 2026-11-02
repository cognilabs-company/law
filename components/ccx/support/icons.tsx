import type { ReactNode } from "react";
import type { CcxIconProps } from "../icons";

function Glyph({ size = 20, className, children, style, ...rest }: CcxIconProps & { children: ReactNode }) {
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

export const IcBubble = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5h-1A1.5 1.5 0 0 1 3 16V7a1.5 1.5 0 0 1 1.5-1.5Z" />
    <path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5h-1A1.5 1.5 0 0 1 3 16V7a1.5 1.5 0 0 1 1.5-1.5Z" />
    <path className="opx-i__a" d="M8 10h8M8 13.5h5" />
  </Glyph>
);

export const IcSend = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M20.5 3.5 3.5 10.6l6.8 2.6 2.6 6.8 7.6-16.5Z" />
    <path d="M20.5 3.5 3.5 10.6l6.8 2.6 2.6 6.8 7.6-16.5Z" />
    <path d="m10.3 13.2 4.4-4.4" />
  </Glyph>
);

export const IcClip = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.4 3.4 0 0 1 4.8 4.8l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4" />
  </Glyph>
);

export const IcDownload = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M12 4v11M7 10.5l5 5 5-5" />
    <path className="opx-i__a" d="M4.5 19.5h15" />
  </Glyph>
);

export const IcSwap = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M4 8h14M14.5 4.5 18 8l-3.5 3.5" />
    <path className="opx-i__a" d="M20 16H6M9.5 12.5 6 16l3.5 3.5" />
  </Glyph>
);

export const IcSpark = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9 12 3.5Z" />
    <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9 12 3.5Z" />
    <path className="opx-i__a" d="M18.5 16.5v3M17 18h3" />
  </Glyph>
);

export const IcVideo = (p: CcxIconProps) => (
  <Glyph {...p}>
    <rect className="opx-i__t" x="2.5" y="6.5" width="13" height="11" rx="3" />
    <rect x="2.5" y="6.5" width="13" height="11" rx="3" />
    <path d="m15.5 10.5 5-3v9l-5-3" />
  </Glyph>
);

export const IcScreen = (p: CcxIconProps) => (
  <Glyph {...p}>
    <rect className="opx-i__t" x="3" y="4.5" width="18" height="12" rx="2" />
    <rect x="3" y="4.5" width="18" height="12" rx="2" />
    <path d="M8.5 20h7M12 16.5V20" />
    <path className="opx-i__a" d="m10 9 2.5 2.5L10 14" />
  </Glyph>
);

export const IcLock = (p: CcxIconProps) => (
  <Glyph {...p}>
    <rect className="opx-i__t" x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    <path className="opx-i__a" d="M12 14.5v2" />
  </Glyph>
);

export const IcPanel = (p: CcxIconProps) => (
  <Glyph {...p}>
    <rect className="opx-i__t" x="14" y="4" width="6.5" height="16" rx="1.5" />
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <path d="M14 4v16" />
    <path className="opx-i__a" d="M16.5 8.5h1.5M16.5 11.5h1.5" />
  </Glyph>
);

export const IcSort = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path d="M4 7h11M4 12h8M4 17h5" />
    <path className="opx-i__a" d="M18 6v12M15.5 15.5 18 18l2.5-2.5" />
  </Glyph>
);

export const IcAlert = (p: CcxIconProps) => (
  <Glyph {...p}>
    <path className="opx-i__t" d="M12 3.5 21 19.5H3L12 3.5Z" />
    <path d="M12 3.5 21 19.5H3L12 3.5Z" />
    <path className="opx-i__a" d="M12 10v4M12 16.8v.2" />
  </Glyph>
);
