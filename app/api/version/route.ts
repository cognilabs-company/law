// Deployed build identity for the client-side "new version available" check
// (components/VersionWatch). On Vercel VERCEL_GIT_COMMIT_SHA is set per
// deployment; elsewhere BUILD_SHA may be provided at build time.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_SHA || "";
  return new Response(JSON.stringify({ sha }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
