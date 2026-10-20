import { buildLlmsTxt } from "@/lib/aeo";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // llms.txt is written for language models, which fetch it as plain text;
      // keep it cacheable so answer engines do not recompile it per request.
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
