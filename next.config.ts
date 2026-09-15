import { readdirSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

// Client dashboard hero pictures: every public/img/hero-img-<n>.<ext>, in number
// order (so hero-img-10 follows hero-img-9). Read when the app is built or
// started — dropping in hero-img-6.png and rebuilding is all it takes.
function heroImages(): string {
  try {
    return readdirSync(path.join(process.cwd(), "public", "img"))
      .map((file) => ({ file, n: Number(/^hero-img-(\d+)\.(?:png|jpe?g|webp|avif)$/i.exec(file)?.[1]) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => a.n - b.n)
      .map((x) => `/img/${x.file}`)
      .join(",");
  } catch {
    return "";
  }
}

// The browser talks to /api/backend on the same origin; the route handler at
// app/api/backend/[...path]/route.ts proxies to BACKEND_ORIGIN server-side, so
// there are no cross-origin CORS/private-network problems with the LAN backend.
const nextConfig: NextConfig = {
  env: { HERO_IMAGES: heroImages() },
  // Backend/plan docs call the seller cabinets /portal/advokat and
  // /portal/yurist; send those links to the real routes instead of a 404.
  async redirects() {
    return [
      { source: "/:locale(uz|ru|en)/portal/advokat/:path*", destination: "/:locale/portal/advocate/:path*", permanent: false },
      { source: "/:locale(uz|ru|en)/portal/yurist/:path*", destination: "/:locale/portal/lawyer/:path*", permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
