import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long-running LLM/contract calls must not be cut off.
export const maxDuration = 300;

const BACKEND = process.env.BACKEND_ORIGIN || "https://lexgo.api.cognilabs.org";

// Same-origin proxy to the LawProject AI backend (avoids browser CORS and
// private-network restrictions). Streams status/body/content-type through.
async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  const search = req.nextUrl.search || "";
  const target = `${BACKEND}/${(path || []).join("/")}${search}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  const auth = req.headers.get("authorization");
  if (auth) headers["authorization"] = auth;
  // Client identity for per-user rate limits and the session device label /
  // IP (/auth/sessions, user_consents). Without these every web user looks
  // like this Next host. The backend must trust them only from the Next host.
  //
  // Assumes exactly ONE trusted hop in front of Next (the hosting edge) that
  // appends the connecting peer's address to X-Forwarded-For. Everything to
  // the left of that last entry is whatever the browser sent, so only the
  // RIGHTMOST entry is used, and the client's own chain / X-Real-IP are never
  // relayed. With no XFF at all, an incoming X-Real-IP (set by such an edge)
  // is the fallback. A deployment with more hops, or none, must change this.
  const ua = req.headers.get("user-agent");
  if (ua) headers["user-agent"] = ua;
  const hops = (req.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const clientIp = hops.length ? hops[hops.length - 1] : req.headers.get("x-real-ip")?.trim() || "";
  if (clientIp) {
    headers["x-forwarded-for"] = clientIp;
    headers["x-real-ip"] = clientIp;
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch {
    return new Response(JSON.stringify({ error: "backend_unreachable" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  const buf = await res.arrayBuffer();
  const out = new Headers();
  const passType = res.headers.get("content-type");
  if (passType) out.set("content-type", passType);
  const disp = res.headers.get("content-disposition");
  if (disp) out.set("content-disposition", disp);
  // 429 cooldown / OTP lock hint for the UI countdown.
  const retry = res.headers.get("retry-after");
  if (retry) out.set("retry-after", retry);
  return new Response(buf, { status: res.status, headers: out });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as OPTIONS,
};
