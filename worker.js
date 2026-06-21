/* TriTrack — Strava sync backend (Cloudflare Worker)
 *
 * Holds your Strava client secret (browsers may never see it) and does the
 * OAuth handshake + activity fetching on the server side, where it's allowed.
 *
 * Required setup (see STRAVA-SETUP.md):
 *   - Secret env vars:  STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
 *   - Plain env var:    ALLOWED_ORIGIN   (your app URL, e.g.
 *                       https://hehaaberhassing-dev.github.io  — origin only)
 *   - KV namespace binding named:  TOKENS
 *
 * Endpoints:
 *   GET /auth?origin=<appUrl>   → sends the user to Strava to authorize
 *   GET /callback?code=...      → Strava returns here; we store the refresh
 *                                 token and bounce back to the app with a session
 *   GET /activities?session=..&after=<unix>  → returns new activities as JSON
 *   GET /status?session=..      → { connected: bool }
 */

const STRAVA_AUTH = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN = "https://www.strava.com/oauth/token";
const STRAVA_API = "https://www.strava.com/api/v3";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function postToken(params) {
  return fetch(STRAVA_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const allow = env.ALLOWED_ORIGIN || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(allow) });
    }

    // 1) Begin OAuth — redirect the user to Strava's permission screen.
    if (path.endsWith("/auth")) {
      const appOrigin = url.searchParams.get("origin") || allow;
      const redirectUri = url.origin + "/callback";
      const authUrl =
        `${STRAVA_AUTH}?client_id=${encodeURIComponent(env.STRAVA_CLIENT_ID)}` +
        `&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&approval_prompt=auto&scope=activity:read_all` +
        `&state=${encodeURIComponent(appOrigin)}`;
      return Response.redirect(authUrl, 302);
    }

    // 2) OAuth callback — exchange the code, stash the refresh token, return to app.
    if (path.endsWith("/callback")) {
      const code = url.searchParams.get("code");
      const appOrigin = url.searchParams.get("state") || "/";
      if (!code) return new Response("Missing code", { status: 400 });

      const res = await postToken({
        client_id: env.STRAVA_CLIENT_ID,
        client_secret: env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      });
      if (!res.ok) return new Response("Token exchange failed", { status: 502 });
      const tok = await res.json();

      const session = crypto.randomUUID().replace(/-/g, "");
      await env.TOKENS.put(session, JSON.stringify({ refresh_token: tok.refresh_token }));

      const back = appOrigin + (appOrigin.includes("#") ? "&" : "#") + "strava_session=" + session;
      return Response.redirect(back, 302);
    }

    // 3) Return activities newer than `after` (unix seconds).
    if (path.endsWith("/activities")) {
      const session = url.searchParams.get("session");
      const after = url.searchParams.get("after") || "0";
      if (!session) return json({ error: "no session" }, 400, allow);

      const stored = await env.TOKENS.get(session);
      if (!stored) return json({ error: "unknown session" }, 401, allow);
      const refresh_token = JSON.parse(stored).refresh_token;

      const rRes = await postToken({
        client_id: env.STRAVA_CLIENT_ID,
        client_secret: env.STRAVA_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token,
      });
      if (!rRes.ok) return json({ error: "refresh failed" }, 502, allow);
      const rtok = await rRes.json();

      // Strava rotates refresh tokens — persist the new one.
      if (rtok.refresh_token && rtok.refresh_token !== refresh_token) {
        await env.TOKENS.put(session, JSON.stringify({ refresh_token: rtok.refresh_token }));
      }

      const out = [];
      for (let page = 1; page <= 12; page++) {
        const aRes = await fetch(
          `${STRAVA_API}/athlete/activities?after=${after}&per_page=200&page=${page}`,
          { headers: { Authorization: "Bearer " + rtok.access_token } }
        );
        if (!aRes.ok) break;
        const batch = await aRes.json();
        if (!Array.isArray(batch) || batch.length === 0) break;
        for (const a of batch) {
          out.push({
            id: a.id,
            name: a.name,
            type: a.type,
            sport_type: a.sport_type,
            distance: a.distance,
            moving_time: a.moving_time,
            elapsed_time: a.elapsed_time,
            start_date: a.start_date,
          });
        }
        if (batch.length < 200) break;
      }
      return json(out, 200, allow);
    }

    if (path.endsWith("/status")) {
      const session = url.searchParams.get("session");
      const connected = !!(session && (await env.TOKENS.get(session)));
      return json({ connected }, 200, allow);
    }

    return new Response("TriTrack Strava sync worker is running.", {
      headers: corsHeaders(allow),
    });
  },
};
