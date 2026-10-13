import { ImageResponse } from "next/og";
import { BuilderCard } from "@/lib/builderCard";
import { loadPublicBuilderCard } from "./cardData";

export const revalidate = 300;
export const alt = "L.O.O.M. builder card";
export const contentType = "image/png";

export const size = { width: 1200, height: 630 };

/**
 * The unfurl card. Feed size only -- this is what Discord, Slack, X and
 * WhatsApp request, and they all want 1200x630.
 *
 * Sized downloads (story, square) live at /u/<name>/card/<format> because
 * metadata image routes are cached by pathname and a ?format= query was
 * ignored. See app/u/[username]/card/[format]/route.js.
 */
export default async function Image({ params }) {
  const { username } = await params;
  const clean = String(username || "").trim().toLowerCase();
  const data = await loadPublicBuilderCard(clean);

  if (!data) {
    return new ImageResponse(
      (
        <div style={{
          width: 1200, height: 630, display: "flex", alignItems: "center", justifyContent: "center",
          background: "#0a1628", color: "rgba(244,241,232,0.6)", fontSize: 30, letterSpacing: 4
        }}>
          L.O.O.M. — BUILDER NOT FOUND
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  return new ImageResponse(<BuilderCard data={{ ...data, format: "feed" }} />, { width: 1200, height: 630 });
}
