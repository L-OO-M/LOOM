import { ImageResponse } from "next/og";
import { BuilderCard } from "@/lib/builderCard";
import { loadPublicBuilderCard } from "../../cardData";

export const dynamic = "force-dynamic";
export const contentType = "image/png";

/**
 * Builder card in a chosen size.
 *
 * Format lives in the PATH, not a query string, on purpose. Metadata image
 * routes are cached by pathname, so /opengraph-image?format=story and
 * ?format=square were served the same cached 1200x630 PNG -- three buttons that
 * silently downloaded one image. A path segment cannot be cached ambiguously.
 *
 *   /u/<name>/card/feed     1200x630  link previews
 *   /u/<name>/card/story    1080x1920 Instagram / WhatsApp status
 *   /u/<name>/card/square   1080x1080 feed posts
 */
const FORMATS = {
  feed: { w: 1200, h: 630 },
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 }
};

export async function GET(_request, { params }) {
  const { username, format } = await params;
  const clean = String(username || "").trim().toLowerCase();
  const { w, h } = FORMATS[format] || FORMATS.feed;
  const data = await loadPublicBuilderCard(clean);

  if (!data) {
    return new ImageResponse(
      (
        <div style={{
          width: w, height: h, display: "flex", alignItems: "center", justifyContent: "center",
          background: "#0a1628", color: "rgba(244,241,232,0.6)", fontSize: w > h ? 30 : 44, letterSpacing: 4
        }}>
          L.O.O.M. — BUILDER NOT FOUND
        </div>
      ),
      { width: w, height: h }
    );
  }

  return new ImageResponse(<BuilderCard data={{ ...data, format }} />, { width: w, height: h });
}
