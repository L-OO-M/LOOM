"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
const WORDS = [
    "design.",
    "prototype.",
    "solve.",
    "build.",
    "develop.",
    "debug.",
    "learn.",
    "cook.",
    "ship.",
    "prompt.",
    "collaborate.",
    "create.",
    "inspire.",
    "follow.",
    "innovate.",
    "test.",
    "optimize.",
    "teach.",
    "visualize.",
    "transform.",
    "scale.",
    "do it.",
];
export default function ScrollAnimation() {
    const root = useRef(null);
    useEffect(() => {
        const section = root.current;
        if (!section)
            return;
        gsap.registerPlugin(ScrollTrigger);
        const media = gsap.matchMedia();
        media.add("(prefers-reduced-motion: no-preference)", () => {
            const context = gsap.context(() => {
                const items = gsap.utils.toArray(".ycs-word");
                const first = items[0];
                const last = items.at(-1);
                if (!first || !last)
                    return;
                // Ease from the site's warm ink into the spectrum and back again.
                gsap.set(section, { "--ycs-chroma": 0 });
                gsap.fromTo(section, { "--ycs-chroma": 0 }, {
                    "--ycs-chroma": 0.17,
                    ease: "none",
                    scrollTrigger: {
                        trigger: first,
                        start: "center 65%",
                        end: "center center",
                        scrub: 0.2,
                        invalidateOnRefresh: true,
                    },
                });
                gsap.fromTo(section, { "--ycs-chroma": 0.17 }, {
                    "--ycs-chroma": 0,
                    immediateRender: false,
                    ease: "none",
                    scrollTrigger: {
                        trigger: last,
                        start: "center center",
                        end: "center 35%",
                        scrub: 0.2,
                        invalidateOnRefresh: true,
                    },
                });
                // Crossfade neighbouring words as they meet the stationary prefix.
                const dimmer = gsap.timeline({ defaults: { ease: "none" } });
                gsap.set(items, { opacity: (i) => (i === 0 ? 1 : 0.16) });
                items.slice(1).forEach((item, i) => {
                    dimmer.to(item, { opacity: 1, duration: 1 }, i);
                    dimmer.to(items[i], { opacity: 0.16, duration: 1 }, i);
                });
                ScrollTrigger.create({
                    trigger: first,
                    endTrigger: last,
                    start: "center center",
                    end: "center center",
                    animation: dimmer,
                    scrub: 0.2,
                    invalidateOnRefresh: true,
                });
                // Recalculate when web fonts settle, including after a direct hash visit.
                let mounted = true;
                void document.fonts?.ready.then(() => {
                    if (mounted)
                        ScrollTrigger.refresh();
                });
                return () => {
                    mounted = false;
                };
            }, section);
            return () => context.revert();
        }, section);
        return () => media.revert();
    }, []);
    return (<section ref={root} id="you-can" className="ycs" aria-labelledby="ycs-title">

      <div className="ycs-content">
        <div className="ycs-track">
          <h2 id="ycs-title" className="ycs-prefix">
            <span aria-hidden="true">you can</span>
            <span className="sr-only">
              You can design, prototype, solve, build, develop, debug, learn, cook, ship, prompt,
              collaborate, create, inspire, follow, innovate, test, optimize, teach, visualize,
              transform, scale, and do it.
            </span>
          </h2>
          <ul className="ycs-words" aria-hidden="true" style={{ "--count": WORDS.length }}>
            {WORDS.map((word, i) => (<li key={word} className="ycs-word" style={{ "--i": i }}>
                {word}
              </li>))}
          </ul>
        </div>
      </div>

    </section>);
}
