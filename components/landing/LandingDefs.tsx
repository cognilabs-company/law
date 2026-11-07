/**
 * Shared clip paths for the notched photo cards. They use objectBoundingBox
 * units, so a card can be any size as long as it keeps its aspect ratio.
 * Apply with: clip-path: url(#lh-clip-card)
 */
export default function LandingDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        {/* 4:5 card with a stepped notch at the top right. */}
        <clipPath id="lh-clip-card" clipPathUnits="objectBoundingBox">
          <path d="M.075 0H.585Q.66 0 .66 .06Q.66 .12 .735 .12H.925Q1 .12 1 .18V.94Q1 1 .925 1H.075Q0 1 0 .94V.06Q0 0 .075 0Z" />
        </clipPath>
        {/* 3:4 card with stepped notches at the top right and bottom left. */}
        <clipPath id="lh-clip-portrait" clipPathUnits="objectBoundingBox">
          <path d="M.08 0H.62Q.7 0 .7 .055Q.7 .11 .78 .11H.92Q1 .11 1 .17V.94Q1 1 .92 1H.38Q.3 1 .3 .945Q.3 .89 .22 .89H.08Q0 .89 0 .83V.06Q0 0 .08 0Z" />
        </clipPath>
      </defs>
    </svg>
  );
}
