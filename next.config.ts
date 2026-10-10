import { readdirSync, readFileSync } from "node:fs";
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

function copiedMediapipe(): string[] {
  try {
    return readdirSync(path.join(process.cwd(), "public", "mediapipe", "wasm")).filter((dir) => /^\d+\.\d+\.\d+/.test(dir));
  } catch {
    return [];
  }
}

function mediapipeVersion(): string {
  const copied = copiedMediapipe();
  if (copied.length === 1) return copied[0];
  try {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "node_modules", "@mediapipe", "tasks-vision", "package.json"), "utf8"));
    return String(pkg.version ?? "");
  } catch {
    return "";
  }
}

// The browser talks to /api/backend on the same origin; the route handler at
// app/api/backend/[...path]/route.ts proxies to BACKEND_ORIGIN server-side, so
// there are no cross-origin CORS/private-network problems with the LAN backend.
const nextConfig: NextConfig = {
  env: { HERO_IMAGES: heroImages(), MEDIAPIPE_VERSION: mediapipeVersion() },
  // Dev server defaults to allowing only "localhost" as the request origin
  // (Next.js 16 cross-origin dev-asset protection); local CDP-driven testing
  // hits 127.0.0.1 directly, which otherwise gets a silent 403 on every
  // _next/static chunk and looks like "nothing on the page works".
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      { source: "/mediapipe/wasm/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/mediapipe/models/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }] },
      { source: "/meeting-bg/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
    ];
  },
  // Backend/plan docs call the seller cabinets /portal/advokat and
  // /portal/yurist; send those links to the real routes instead of a 404.
  async redirects() {
    return [
      { source: "/:locale(uz|ru|en)/portal/advokat/:path*", destination: "/:locale/portal/advocate/:path*", permanent: false },
      { source: "/:locale(uz|ru|en)/portal/yurist/:path*", destination: "/:locale/portal/lawyer/:path*", permanent: false },
      { source: "/:locale(uz|ru|en)/marketplace/lawyers", destination: "/:locale/lawyers", permanent: false },
      { source: "/:locale(uz|ru|en)/marketplace/lawyers/:id", destination: "/:locale/lawyers/:id", permanent: false },
      // Promotion CTA links are written by the backend as
      // /portal/client/marketplace/lawyers/{id}; the profile page is /portal/client/lawyers/{id}.
      { source: "/:locale(uz|ru|en)/portal/client/marketplace/lawyers/:id", destination: "/:locale/portal/client/lawyers/:id", permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
