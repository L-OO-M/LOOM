import { ImageResponse } from "next/og";
import { getSql } from "@/lib/db";
import { reputationFor } from "@/lib/reputation";

export const revalidate = 300;
export const alt = "L.O.O.M. Builder card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function initials(name) {
  if (!name) return "?";
  return String(name).trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export default async function Image({ params, searchParams }) {
  const { username } = await params;
  const clean = username.trim().toLowerCase();
  const format = searchParams?.format === "story" ? "story" : "feed";
  const W = format === "story" ? 1080 : 1200;
  const H = format === "story" ? 1920 : 630;

  let card = null;
  let profile = null;
  let rep = { score: 0, achievements: 0 };
  try {
    const sql = getSql();
    const [c] = await sql`SELECT username, bio FROM user_profiles WHERE username = ${clean} AND is_public = true LIMIT 1`;
    card = c || null;
    if (card) {
      const [p] = await sql`SELECT name, primary_domain FROM profiles WHERE user_id = (SELECT user_id FROM user_profiles WHERE username = ${clean} LIMIT 1) LIMIT 1`;
      profile = p || null;
      rep = await reputationFor(sql, (await sql`SELECT user_id FROM user_profiles WHERE username = ${clean} LIMIT 1`)[0]?.user_id).catch(() => ({ score: 0 }));
    }
  } catch {}

  if (!card) {
    return new ImageResponse(
      (
        <div style={{ width: W, height: H, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0b0c", color: "#f2f3f1", fontSize: 32 }}>
          L.O.O.M. — Builder not found
        </div>
      ),
      { width: W, height: H }
    );
  }

  const name = profile?.name || card.username;
  const domain = profile?.primary_domain || "builder";
  const bio = (card.bio || "Building with L.O.O.M. — proof over promises.").slice(0, 120);

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: format === "story" ? 64 : 48,
          background: "#0a0b0c",
          color: "#f2f3f1",
          border: "1px solid #262b2e",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 20, letterSpacing: 4, color: "#d6b25e", fontWeight: 700 }}>L.O.O.M.</div>
          <div style={{ fontSize: 14, color: "#a0a5a8", background: "#1a1e20", padding: "6px 12px", borderRadius: 999 }}>@{clean}</div>
        </div>

        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <div
            style={{
              width: format === "story" ? 140 : 96,
              height: format === "story" ? 140 : 96,
              borderRadius: 999,
              background: "#1a1e20",
              border: "2px solid #d6b25e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: format === "story" ? 48 : 32,
              fontWeight: 800,
              color: "#d6b25e",
            }}
          >
            {initials(name)}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: format === "story" ? 52 : 40, fontWeight: 700, lineHeight: 1 }}>{name}</div>
            <div style={{ fontSize: 18, color: "#a0a5a8", marginTop: 8 }}>
              @{clean} · {domain}
            </div>
            <div style={{ fontSize: 16, color: "#f2f3f1", marginTop: 12, maxWidth: 640, lineHeight: 1.4 }}>{bio}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ background: "#121415", border: "1px solid #262b2e", borderRadius: 16, padding: "16px 24px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 14, letterSpacing: 2, color: "#a0a5a8" }}>PROOF SCORE</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#f2f3f1" }}>{rep.score ?? 0}</div>
          </div>
          <div style={{ background: "#d6b25e", borderRadius: 16, padding: "16px 24px", display: "flex", alignItems: "center", color: "#101314", fontWeight: 700 }}>
            loom.sh/u/{clean}
          </div>
        </div>

        <div style={{ fontSize: 12, letterSpacing: 3, color: "#262b2e", textAlign: "center" }}>THE THREAD CONTINUES — PROOF OVER PROMISES</div>
      </div>
    ),
    { width: W, height: H }
  );
}
