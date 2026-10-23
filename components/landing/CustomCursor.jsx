"use client";
import "./custom-cursor.css";
import { useEffect, useRef } from "react";
const SEGMENT_COUNT = 22;
const CURSOR_QUERY = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const NATIVE_TARGETS = "input, textarea, select, iframe, [contenteditable]:not([contenteditable='false'])";
const INTERACTIVE_TARGETS = "a[href], button:not(:disabled), [role='button']:not([aria-disabled='true']), summary, label[for]";
export default function CustomCursor() {
    const rootRef = useRef(null);
    const segmentsRef = useRef([]);
    useEffect(() => {
        const root = rootRef.current;
        const segments = segmentsRef.current;
        if (!root || segments.length !== SEGMENT_COUNT)
            return;
        const media = window.matchMedia(CURSOR_QUERY);
        let dispose = () => { };
        const connect = () => {
            let visible = false;
            let raf = 0;
            let previousTime = 0;
            const point = { x: 0, y: 0 };
            const followers = Array.from({ length: SEGMENT_COUNT }, () => ({ x: 0, y: 0 }));
            const hide = () => {
                visible = false;
                root.dataset["visible"] = "0";
                root.dataset["pressed"] = "0";
                delete document.documentElement.dataset["customCursor"];
                cancelAnimationFrame(raf);
                raf = 0;
            };
            const updateTarget = (target) => {
                if (!target || target.closest(NATIVE_TARGETS)) {
                    hide();
                    return false;
                }
                const interactive = target.closest(INTERACTIVE_TARGETS);
                const drag = !target.closest("[data-cursor='default']") && target.closest("[data-cursor='drag']");
                root.dataset["mode"] = interactive ? "link" : drag ? "drag" : "default";
                return true;
            };
            const frame = (time) => {
                const dt = Math.min(64, Math.max(1, time - previousTime));
                previousTime = time;
                // Match the reference's 0.3 trailing weight at 60 fps, while keeping
                // the same movement on higher-refresh displays.
                const ease = 1 - Math.pow(0.3, dt / (1000 / 60));
                let lead = point;
                let settling = false;
                followers.forEach((follower, index) => {
                    if (index === 0) {
                        follower.x = point.x;
                        follower.y = point.y;
                    }
                    else {
                        follower.x += (lead.x - follower.x) * ease;
                        follower.y += (lead.y - follower.y) * ease;
                    }
                    const segment = segments[index];
                    if (segment)
                        segment.style.transform = `translate3d(${follower.x}px, ${follower.y}px, 0)`;
                    if (Math.abs(point.x - follower.x) + Math.abs(point.y - follower.y) > 0.1)
                        settling = true;
                    lead = follower;
                });
                raf = settling ? requestAnimationFrame(frame) : 0;
            };
            const onMove = (event) => {
                if (event.pointerType && event.pointerType !== "mouse") {
                    hide();
                    return;
                }
                const target = event.target instanceof Element ? event.target : null;
                if (!updateTarget(target))
                    return;
                point.x = event.clientX;
                point.y = event.clientY;
                const head = segments[0];
                if (head)
                    head.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
                if (!visible) {
                    followers.forEach((follower, index) => {
                        follower.x = point.x;
                        follower.y = point.y;
                        const segment = segments[index];
                        if (segment)
                            segment.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
                    });
                }
                visible = true;
                root.dataset["visible"] = "1";
                root.dataset["pressed"] = event.buttons ? "1" : "0";
                document.documentElement.dataset["customCursor"] = "active";
                if (!raf) {
                    previousTime = performance.now();
                    raf = requestAnimationFrame(frame);
                }
            };
            const onDown = (event) => {
                if (event.pointerType && event.pointerType !== "mouse") {
                    hide();
                    return;
                }
                if (visible)
                    root.dataset["pressed"] = "1";
            };
            const onUp = () => {
                root.dataset["pressed"] = "0";
            };
            const onKey = (event) => {
                if (event.key === "Tab")
                    hide();
            };
            const onScroll = () => {
                if (visible)
                    updateTarget(document.elementFromPoint(point.x, point.y));
            };
            const onVisibility = () => {
                if (document.hidden)
                    hide();
            };
            document.addEventListener("pointermove", onMove, { passive: true });
            document.addEventListener("pointerdown", onDown, { passive: true });
            document.addEventListener("pointerup", onUp, { passive: true });
            document.addEventListener("pointercancel", hide);
            document.addEventListener("pointerleave", hide);
            document.addEventListener("keydown", onKey);
            document.addEventListener("scroll", onScroll, { passive: true, capture: true });
            document.addEventListener("visibilitychange", onVisibility);
            window.addEventListener("blur", hide);
            return () => {
                hide();
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerdown", onDown);
                document.removeEventListener("pointerup", onUp);
                document.removeEventListener("pointercancel", hide);
                document.removeEventListener("pointerleave", hide);
                document.removeEventListener("keydown", onKey);
                document.removeEventListener("scroll", onScroll, true);
                document.removeEventListener("visibilitychange", onVisibility);
                window.removeEventListener("blur", hide);
            };
        };
        const sync = () => {
            dispose();
            dispose = media.matches ? connect() : () => { };
        };
        sync();
        media.addEventListener("change", sync);
        return () => {
            dispose();
            media.removeEventListener("change", sync);
        };
    }, []);
    return (<div ref={rootRef} className="loom-cursor" data-visible="0" data-mode="default" data-pressed="0" aria-hidden="true">
      {Array.from({ length: SEGMENT_COUNT }, (_, index) => {
            return (<span key={index} ref={(element) => {
                    segmentsRef.current[index] = element;
                }} className="loom-cursor__segment" style={{
                    "--cursor-step": (SEGMENT_COUNT - index) / SEGMENT_COUNT,
                    "--cursor-tone": `${100 - (index / (SEGMENT_COUNT - 1)) * 100}%`,
                }}/>);
        })}
    </div>);
}
