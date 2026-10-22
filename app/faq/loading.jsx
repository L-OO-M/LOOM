import { PublicFooter } from "@/components/landing/PublicFooter";
import FaqSection from "./_components/FaqScroller";
import { faqData } from "./_components/faq-data";
import "./_components/faq.css";

export default function Loading() {
  return (
    <>
      <div className="loom-faq-exact" aria-busy="true">
        <div className="faq-page-bg min-h-screen">
          <FaqSection data={faqData} headingLevel="h2" />
        </div>
      </div>
      <PublicFooter />
    </>
  );
}
