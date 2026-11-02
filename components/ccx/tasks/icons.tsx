import type { ReactNode } from "react";
import type { CcxIconProps } from "../icons";

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

export const IcClip = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="m20 11.5-8.2 8.2a5.3 5.3 0 0 1-7.5-7.5l8.4-8.4a3.6 3.6 0 0 1 5.1 5.1l-8.4 8.4a1.8 1.8 0 0 1-2.5-2.5l7.7-7.7" />
  </Gl>
);

export const IcDownload = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M12 4v11" />
    <path className="opx-i__a" d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M5 19.5h14" />
  </Gl>
);

export const IcUpload = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M12 15V4" />
    <path className="opx-i__a" d="m7.5 8.5 4.5-4.5 4.5 4.5" />
    <path d="M5 19.5h14" />
  </Gl>
);

export const IcImage = (p: CcxIconProps) => (
  <Gl {...p}>
    <rect className="opx-i__t" x="3.5" y="4.5" width="17" height="15" rx="3" />
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle className="opx-i__a" cx="9" cy="10" r="1.8" />
    <path d="m20.5 15.5-5-5-8.5 9" />
  </Gl>
);

export const IcImageOff = (p: CcxIconProps) => (
  <Gl {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path className="opx-i__a" d="M4 4l16 16" />
  </Gl>
);

export const IcPencil = (p: CcxIconProps) => (
  <Gl {...p}>
    <path className="opx-i__t" d="M15.5 4.5l4 4L8.5 19.5h-4v-4l11-11Z" />
    <path d="M15.5 4.5l4 4L8.5 19.5h-4v-4l11-11Z" />
    <path className="opx-i__a" d="M13.5 6.5l4 4" />
  </Gl>
);

export const IcUsers = (p: CcxIconProps) => (
  <Gl {...p}>
    <circle className="opx-i__t" cx="9" cy="8.5" r="3.5" />
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M3 19.5a6 6 0 0 1 12 0" />
    <path className="opx-i__a" d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14a5.5 5.5 0 0 1 3.5 5.5" />
  </Gl>
);

export const IcTrash = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7" />
    <path d="M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12.5" />
    <path className="opx-i__a" d="M10 11v6M14 11v6" />
  </Gl>
);

export const IcArchive = (p: CcxIconProps) => (
  <Gl {...p}>
    <rect className="opx-i__t" x="3.5" y="4" width="17" height="4.5" rx="1.5" />
    <rect x="3.5" y="4" width="17" height="4.5" rx="1.5" />
    <path d="M5 8.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5" />
    <path className="opx-i__a" d="M10 12.5h4" />
  </Gl>
);

export const IcUndo = (p: CcxIconProps) => (
  <Gl {...p}>
    <path className="opx-i__a" d="M9 14 4.5 9.5 9 5" />
    <path d="M4.5 9.5h10a5 5 0 0 1 0 10H11" />
  </Gl>
);

export const IcPlay = (p: CcxIconProps) => (
  <Gl {...p}>
    <path className="opx-i__t" d="M7 5.2v13.6a1 1 0 0 0 1.5.9l10.6-6.8a1 1 0 0 0 0-1.7L8.5 4.3A1 1 0 0 0 7 5.2Z" />
    <path d="M7 5.2v13.6a1 1 0 0 0 1.5.9l10.6-6.8a1 1 0 0 0 0-1.7L8.5 4.3A1 1 0 0 0 7 5.2Z" />
  </Gl>
);

export const IcPlayCircle = (p: CcxIconProps) => (
  <Gl {...p}>
    <circle className="opx-i__t" cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="8.5" />
    <path className="opx-i__a" d="M10.2 8.8v6.4l5-3.2-5-3.2Z" />
  </Gl>
);

export const IcSend = (p: CcxIconProps) => (
  <Gl {...p}>
    <path className="opx-i__t" d="M20.5 3.5 14 20.5l-4-6.5-6.5-4 17-6.5Z" />
    <path d="M20.5 3.5 14 20.5l-4-6.5-6.5-4 17-6.5Z" />
    <path className="opx-i__a" d="M20.5 3.5 10 14" />
  </Gl>
);

export const IcCalendar = (p: CcxIconProps) => (
  <Gl {...p}>
    <rect className="opx-i__t" x="3.5" y="5" width="17" height="15.5" rx="3" />
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path className="opx-i__a" d="M8 14h3" />
  </Gl>
);

export const IcCheckCircle = (p: CcxIconProps) => (
  <Gl {...p}>
    <circle className="opx-i__t" cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="8.5" />
    <path className="opx-i__a" d="m8.5 12.2 2.4 2.4 4.6-4.9" />
  </Gl>
);

export const IcAlert = (p: CcxIconProps) => (
  <Gl {...p}>
    <path className="opx-i__t" d="M12 4 2.8 19.5h18.4L12 4Z" />
    <path d="M12 4 2.8 19.5h18.4L12 4Z" />
    <path className="opx-i__a" d="M12 10v4.5M12 17.2h.01" />
  </Gl>
);

export const IcHourglass = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M7 3.5h10M7 20.5h10" />
    <path className="opx-i__t" d="M8 20.5v-3.2a4 4 0 0 1 1.6-3.2L12 12l2.4 2.1a4 4 0 0 1 1.6 3.2v3.2" />
    <path d="M8 3.5v3.2a4 4 0 0 0 1.6 3.2L12 12l2.4-2.1A4 4 0 0 0 16 6.7V3.5" />
    <path className="opx-i__a" d="M8 20.5v-3.2a4 4 0 0 1 1.6-3.2L12 12l2.4 2.1a4 4 0 0 1 1.6 3.2v3.2" />
  </Gl>
);

export const IcZoomIn = (p: CcxIconProps) => (
  <Gl {...p}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="m15.6 15.6 4.4 4.4" />
    <path className="opx-i__a" d="M10.8 8.3v5M8.3 10.8h5" />
  </Gl>
);

export const IcZoomOut = (p: CcxIconProps) => (
  <Gl {...p}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="m15.6 15.6 4.4 4.4" />
    <path className="opx-i__a" d="M8.3 10.8h5" />
  </Gl>
);

export const IcInfo = (p: CcxIconProps) => (
  <Gl {...p}>
    <circle className="opx-i__t" cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="8.5" />
    <path className="opx-i__a" d="M12 11v5.5M12 7.8h.01" />
  </Gl>
);

export const IcChevL = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="m15 6-6 6 6 6" />
  </Gl>
);

export const IcChevR = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="m9 6 6 6-6 6" />
  </Gl>
);

export const IcFit = (p: CcxIconProps) => (
  <Gl {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Gl>
);

export const IcNote = (p: CcxIconProps) => (
  <Gl {...p}>
    <path className="opx-i__t" d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z" />
    <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z" />
    <path className="opx-i__a" d="M8 9h8M8 12h5" />
  </Gl>
);

export const IcSpin = (p: CcxIconProps) => (
  <Gl {...p} className={`opx-tk-spin ${p.className ?? ""}`}>
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
  </Gl>
);
