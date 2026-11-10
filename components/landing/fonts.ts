import { Inter_Tight, Playfair_Display } from "next/font/google";

// Display faces for the home landing only. Loading them here, not in the root
// layout, keeps them off every other page.
export const landingSans = Inter_Tight({
  subsets: ["latin", "cyrillic"],
  variable: "--lh-font-sans",
  display: "swap",
});

// The italic accent echoes the serif "Go" of the Tezkor Himoya wordmark. It only ever
// sets a few accent words, so it is not preloaded.
export const landingSerif = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  style: ["italic"],
  variable: "--lh-font-serif",
  display: "swap",
  preload: false,
});
