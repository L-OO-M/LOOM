import { PublicFooter } from "@/components/landing/PublicFooter";
import FaqSection from "./_components/FaqScroller";
import { faqData } from "./_components/faq-data";
import { JsonLd, faqPageSchema } from "@/components/seo/JsonLd";
import { canonicalFor } from "@/lib/seo";
import "./_components/faq.css";

export const dynamic = "force-static";

export const metadata = {
  title: "Questions, answered honestly",
  description: "How joining LOOM works, who it is for, and what happens after you sign up.",
  ...canonicalFor("/faq"),
};

export default function FaqPage() {
  const questions = faqData.rows.flatMap(row => row.faqItems).filter(item => !item.cta);
  return (
    <>
    <div className="loom-faq-exact">
      <JsonLd data={faqPageSchema(questions)} />
      <main id="main" className="faq-page-bg min-h-screen">
        <FaqSection data={faqData} />
      </main>
    </div>
    <PublicFooter />
    </>
  );
}
