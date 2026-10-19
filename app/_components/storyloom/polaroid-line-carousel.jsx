"use client";
import * as React from "react";
export function wrap(i, n) {
    return n ? ((i % n) + n) % n : 0;
}
export function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
}
export function stringY(x, w, y0, sag) {
    const t = clamp(x / Math.max(w, 1), 0, 1);
    return y0 + 4 * sag * t * (1 - t);
}
export function springStep(x, v, target, dt, k = 70) {
    const nv = v + (k * (target - x) - 2 * Math.sqrt(k) * v) * dt;
    return [x + nv * dt, nv];
}
export function swingStep(a, w, lineVel, dt, gain) {
    const nw = w + (-38 * a - 4.2 * w + lineVel * 0.0034 * gain) * dt;
    return [clamp(a + nw * dt, -0.6, 0.6), nw];
}
export function nearestAt(off, spacing, n) {
    return clamp(Math.round(off / spacing), 0, Math.max(0, n - 1));
}
export function pad2(n) {
    return n < 10 ? "0" + n : String(n);
}
const PALETTES = {
    dawn: {
        top: "#e7b7a5",
        bottom: "#f8e8d6",
        sun: "#fff4df",
        far: "#d2b2bb",
        near: "#3a2a3b",
        mist: "255,240,232",
    },
    alpine: {
        top: "#7ea5c8",
        bottom: "#e3ecf2",
        sun: "#ffffff",
        far: "#a9bfd0",
        near: "#1c3044",
        mist: "236,244,250",
    },
    dusk: {
        top: "#2a2450",
        bottom: "#ef8d60",
        sun: "#ffd9a6",
        far: "#93607c",
        near: "#18121f",
        mist: "255,196,160",
    },
    mist: {
        top: "#c4d0cb",
        bottom: "#eef1ec",
        sun: "#ffffff",
        far: "#aebcb5",
        near: "#2c3a33",
        mist: "246,248,245",
    },
};
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hexRgb(h) {
    const v = parseInt(h.replace("#", ""), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mixRgb(a, b, t) {
    const A = hexRgb(a);
    const B = hexRgb(b);
    return "rgb(" + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",") + ")";
}
// Paint a seeded landscape once for slides with neither a photo nor artwork.
function paintLandscape(seed, palette, w = 1600, h = 1000) {
    if (typeof document === "undefined")
        return "";
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    if (!g)
        return "";
    const P = PALETTES[palette];
    const r = mulberry32(seed * 104729 + 7);
    const sky = g.createLinearGradient(0, 0, 0, h * 0.72);
    sky.addColorStop(0, P.top);
    sky.addColorStop(1, P.bottom);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const sx = w * (0.22 + r() * 0.56);
    const sy = h * (0.26 + r() * 0.16);
    const halo = g.createRadialGradient(sx, sy, 0, sx, sy, w * 0.45);
    halo.addColorStop(0, "rgba(" + hexRgb(P.sun).join(",") + ",.85)");
    halo.addColorStop(0.08, "rgba(" + hexRgb(P.sun).join(",") + ",.55)");
    halo.addColorStop(1, "rgba(" + hexRgb(P.sun).join(",") + ",0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, w, h);
    g.fillStyle = P.sun;
    g.beginPath();
    g.arc(sx, sy, h * 0.045, 0, Math.PI * 2);
    g.fill();
    for (let L = 0; L < 5; L++) {
        const k = L / 4;
        const base = h * (0.42 + k * 0.4);
        const amp = h * (0.07 + k * 0.1);
        const ph = [r(), r(), r(), r()].map((v) => v * Math.PI * 2);
        const fr = [1.3 + r(), 3.1 + r() * 2, 7 + r() * 4, 17 + r() * 8];
        const ridge = (x) => {
            const u = x / w;
            return (base -
                amp *
                    (0.55 * Math.sin(u * fr[0] + ph[0]) +
                        0.28 * Math.sin(u * fr[1] + ph[1]) +
                        0.12 * Math.abs(Math.sin(u * fr[2] + ph[2])) +
                        0.05 * Math.sin(u * fr[3] + ph[3])));
        };
        const mist = g.createLinearGradient(0, base - amp * 1.4, 0, base + amp * 0.4);
        mist.addColorStop(0, "rgba(" + P.mist + ",0)");
        mist.addColorStop(1, "rgba(" + P.mist + "," + (0.55 - k * 0.35).toFixed(2) + ")");
        g.fillStyle = mist;
        g.fillRect(0, base - amp * 1.4, w, amp * 1.8);
        const body = g.createLinearGradient(0, base - amp, 0, h);
        body.addColorStop(0, mixRgb(P.far, P.near, Math.pow(k, 1.3)));
        body.addColorStop(1, mixRgb(P.far, P.near, Math.min(1, Math.pow(k, 1.3) + 0.18)));
        g.fillStyle = body;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 6)
            g.lineTo(x, ridge(x));
        g.lineTo(w, h);
        g.closePath();
        g.fill();
        if (L >= 3) {
            g.fillStyle = mixRgb(P.far, P.near, Math.min(1, Math.pow(k, 1.3) + 0.08));
            for (let x = 0; x < w; x += 7 + r() * 9) {
                if (r() < 0.35)
                    continue;
                const y = ridge(x) + 2;
                const th = h * (0.025 + r() * 0.035) * (0.6 + k);
                g.beginPath();
                g.moveTo(x, y - th);
                g.lineTo(x + th * 0.32, y);
                g.lineTo(x - th * 0.32, y);
                g.closePath();
                g.fill();
            }
        }
    }
    const vig = g.createRadialGradient(w / 2, h * 0.45, h * 0.3, w / 2, h / 2, w * 0.78);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,.32)");
    g.fillStyle = vig;
    g.fillRect(0, 0, w, h);
    const grain = g.getImageData(0, 0, w, h);
    for (let i = 0; i < grain.data.length; i += 4) {
        const v = (r() - 0.5) * 14;
        grain.data[i] = grain.data[i] + v;
        grain.data[i + 1] = grain.data[i + 1] + v;
        grain.data[i + 2] = grain.data[i + 2] + v;
    }
    g.putImageData(grain, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.88);
}
const DEFAULT_SLIDES = [
    {
        title: "First Light",
        caption: "Haze lifting off the eastern ridges.",
        palette: "dawn",
        seed: 3,
    },
    { title: "High Pass", caption: "Cold air, clear to the far range.", palette: "alpine", seed: 8 },
    {
        title: "Ember Hour",
        caption: "The last of the sun on the valley floor.",
        palette: "dusk",
        seed: 14,
    },
    {
        title: "Still Valley",
        caption: "Morning mist that never quite lifts.",
        palette: "mist",
        seed: 21,
    },
    { title: "Rose Ridge", caption: "Five ridges, one long exhale.", palette: "dawn", seed: 34 },
    {
        title: "Blue Hour",
        caption: "Pines going dark against the snow.",
        palette: "alpine",
        seed: 55,
    },
];
function useSlideImages(slides) {
    const recipes = JSON.stringify(slides.map((s, i) => s.image || s.artwork ? null : { seed: s.seed ?? i + 1, palette: s.palette ?? "dawn" }));
    const [painted, setPainted] = React.useState([]);
    React.useEffect(() => {
        const values = JSON.parse(recipes);
        setPainted(values.map((s) => (s ? paintLandscape(s.seed, s.palette) : "")));
    }, [recipes]);
    return slides.map((s, i) => s.image || painted[i] || "");
}
const PL_CSS = `
.pl-root{position:relative;width:100%;overflow:hidden;background:var(--pl-bg);color:var(--pl-ink);user-select:none;-webkit-user-select:none;touch-action:pan-y;outline:none;cursor:grab}
.pl-root[data-drag='1']{cursor:grabbing}
.pl-root:focus-visible{box-shadow:inset 0 0 0 2px var(--pl-ink)}
.pl-string{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.pl-card{position:absolute;left:0;top:0;width:var(--pl-cw);transform-origin:50% 0;will-change:transform;cursor:inherit}
.pl-print{margin-top:10px;background:var(--pl-paper,#fbfaf7);padding:10px 10px 0;border:1px solid var(--pl-paper-border,transparent);box-shadow:0 1px 2px rgba(0,0,0,.12),0 18px 30px -16px rgba(0,0,0,.4);transition:transform .5s cubic-bezier(.2,.7,.2,1),filter .5s ease,border-color .3s ease}
.pl-card[data-on='0'] .pl-print{transform:scale(.9);filter:saturate(.7) brightness(.8)}
.pl-card[data-on='1'] .pl-print{border-color:var(--pl-active-border,var(--pl-paper-border,transparent))}
.pl-shot{position:relative;aspect-ratio:1;overflow:hidden;background:#d9d5cc}
.pl-shot img{position:absolute;inset:0;width:100%;height:100%;max-width:none;object-fit:cover;display:block;pointer-events:none}
.pl-note{min-height:54px;display:flex;align-items:center;justify-content:center;padding:8px 4px;font:italic 400 clamp(12px,1.3vw,17px)/1.15 var(--font-serif-accent,Georgia,serif);color:var(--pl-note-ink,#3b3833);text-align:center}
.pl-peg{position:absolute;left:50%;top:0;width:10px;height:26px;margin-left:-5px;border-radius:2px;background:linear-gradient(90deg,color-mix(in srgb,var(--pl-string) 75%,black),var(--pl-string) 45%,color-mix(in srgb,var(--pl-string) 60%,black));box-shadow:0 2px 3px rgba(0,0,0,.25)}
.pl-peg::after{content:'';position:absolute;left:4px;top:8px;width:2px;height:7px;background:rgba(0,0,0,.45);border-radius:1px}
.pl-art{height:100%;display:grid;place-items:center;color:var(--pl-tint);background:radial-gradient(ellipse at 50% 45%,color-mix(in srgb,var(--pl-tint) 16%,transparent),transparent 70%),repeating-linear-gradient(0deg,transparent 0 23px,color-mix(in srgb,var(--pl-tint) 7%,transparent) 23px 24px),repeating-linear-gradient(90deg,transparent 0 23px,color-mix(in srgb,var(--pl-tint) 7%,transparent) 23px 24px),var(--pl-bg)}
.pl-art::before,.pl-art::after{content:'';position:absolute;width:64%;aspect-ratio:1;border:1px solid color-mix(in srgb,var(--pl-tint) 20%,transparent);border-radius:50%}
.pl-art::after{width:85%;border-style:dashed;opacity:.6}
.pl-art svg{width:32%;height:32%;stroke-width:1.1;filter:drop-shadow(0 0 16px color-mix(in srgb,var(--pl-tint) 25%,transparent))}
.pl-art-label{position:absolute;left:12px;top:12px;font:10px/1 var(--font-mono,monospace);letter-spacing:.16em;opacity:.65}
.pl-bar{position:absolute;left:clamp(20px,4vw,56px);right:clamp(20px,4vw,56px);bottom:32px;display:flex;align-items:center;gap:clamp(12px,2vw,24px);cursor:default}
.pl-cap{flex:1;min-width:0;overflow:hidden;padding-bottom:.15em}
.pl-cap>*{display:block;animation:pl-in .55s cubic-bezier(.2,.8,.2,1) both}
.pl-title{font:500 clamp(20px,2.2vw,28px)/1.15 var(--font-serif-accent,Georgia,serif)}
.pl-sub{margin-top:8px;font:400 13px/1.5 var(--font-sans,system-ui,sans-serif);color:var(--pl-muted);max-width:36rem}
.pl-count{font:500 11px/1 var(--font-mono,monospace);letter-spacing:.14em;color:var(--pl-muted);white-space:nowrap}
.pl-count b{color:var(--pl-ink);font-weight:500}
.pl-btn{appearance:none;flex-shrink:0;width:40px;height:40px;border-radius:50%;border:1px solid var(--pl-line);background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;transition:background .2s ease,color .2s ease}
.pl-btn:hover:not(:disabled){background:var(--pl-ink);color:var(--pl-bg)}
.pl-btn:disabled{opacity:.3;cursor:default}
.pl-btn:focus-visible{outline:2px solid var(--pl-ink);outline-offset:2px}
.pl-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@keyframes pl-in{from{transform:translateY(100%);opacity:0}to{transform:none;opacity:1}}
@media(max-width:600px){.pl-bar{display:grid;grid-template-columns:1fr 40px 40px;gap:16px;bottom:24px}.pl-cap{grid-column:1/-1;min-height:84px}.pl-count{align-self:center}.pl-sub{font-size:12px;max-width:30rem}}
@media(prefers-reduced-motion:reduce){.pl-cap>*{animation:none}.pl-print{transition:none}}
`;
export default function PolaroidLineCarousel({ slides = DEFAULT_SLIDES, height = "100svh", cardWidth = 300, sag = 46, swing = 1, autoplay = 4500, string = "#8a7f72", background = "var(--color-background, #efece6)", ink = "var(--color-foreground, #161513)", onChange, className, style, ariaLabel = "Image carousel", }) {
    const n = slides.length;
    const srcs = useSlideImages(slides);
    const [active, setActive] = React.useState(0);
    const [dragging, setDragging] = React.useState(false);
    const [size, setSize] = React.useState({ w: 1200, h: 800, cw: cardWidth });
    const rootRef = React.useRef(null);
    const pathRef = React.useRef(null);
    const cards = React.useRef([]);
    const sim = React.useRef({ off: 0, vel: 0, target: 0, a: [], w: [] });
    const drag = React.useRef(null);
    const lastTouch = React.useRef(0);
    const activeRef = React.useRef(0);
    const opts = React.useRef({ sag, swing });
    React.useEffect(() => {
        opts.current = { sag, swing };
    }, [sag, swing]);
    const spacing = size.cw * 1.08;
    const goTo = React.useCallback((i) => {
        sim.current.target = clamp(i, 0, Math.max(0, n - 1)) * spacing;
    }, [n, spacing]);
    React.useEffect(() => {
        const root = rootRef.current;
        if (!root)
            return;
        const ro = new ResizeObserver(() => {
            const r = root.getBoundingClientRect();
            const cw = Math.round(Math.max(150, Math.min(cardWidth, r.width * 0.58, r.height * 0.42)));
            setSize({ w: r.width, h: r.height, cw });
        });
        ro.observe(root);
        return () => ro.disconnect();
    }, [cardWidth]);
    React.useEffect(() => {
        activeRef.current = clamp(activeRef.current, 0, Math.max(0, n - 1));
        sim.current.target = activeRef.current * spacing;
        sim.current.off = activeRef.current * spacing;
        sim.current.vel = 0;
        setActive(activeRef.current);
    }, [spacing, n]);
    React.useEffect(() => {
        onChange?.(active);
    }, [active, onChange]);
    React.useEffect(() => {
        const root = rootRef.current;
        if (!root)
            return;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let visible = true;
        let raf = 0;
        let prev = performance.now();
        const S = sim.current;
        const frame = (now) => {
            raf = 0;
            if (!visible)
                return;
            const dt = Math.min(0.033, (now - prev) / 1000);
            prev = now;
            const { w, h, cw } = size;
            const y0 = Math.max(40, h * 0.14);
            const d = drag.current;
            let lineVel;
            if (d?.moved)
                lineVel = d.v * 1000;
            else {
                const before = S.off;
                if (motion.matches) {
                    S.off = S.target;
                    S.vel = 0;
                }
                else
                    [S.off, S.vel] = springStep(S.off, S.vel, S.target, dt);
                lineVel = -(S.off - before) / Math.max(dt, 1e-3);
            }
            const o = opts.current;
            const g = motion.matches ? 0 : o.swing;
            const near = nearestAt(S.off, spacing, n);
            for (let i = 0; i < n; i++) {
                const el = cards.current[i];
                if (!el)
                    continue;
                const x = w / 2 + i * spacing - S.off;
                if (x < -cw * 1.5 || x > w + cw * 1.5) {
                    el.style.visibility = "hidden";
                    continue;
                }
                el.style.visibility = "visible";
                let [a, av] = swingStep(S.a[i] || 0, S.w[i] || 0, lineVel, dt, g);
                if (g)
                    a += Math.sin(now / 1300 + i * 1.7) * 0.0009 * g;
                else {
                    a = 0;
                    av = 0;
                }
                S.a[i] = a;
                S.w[i] = av;
                const y = stringY(x, w, y0, o.sag) - 6;
                el.style.transform = `translate(${(x - cw / 2).toFixed(1)}px,${y.toFixed(1)}px) rotate(${a.toFixed(4)}rad)`;
                el.style.zIndex = String(i === near ? n + 1 : n - Math.abs(i - near));
            }
            pathRef.current?.setAttribute("d", `M0 ${y0} Q${w / 2} ${y0 + 2 * o.sag} ${w} ${y0}`);
            if (near !== activeRef.current) {
                activeRef.current = near;
                setActive(near);
            }
            raf = requestAnimationFrame(frame);
        };
        const io = new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? false;
            if (visible && !raf) {
                prev = performance.now();
                raf = requestAnimationFrame(frame);
            }
        });
        io.observe(root);
        raf = requestAnimationFrame(frame);
        return () => {
            cancelAnimationFrame(raf);
            io.disconnect();
        };
    }, [size, spacing, n]);
    React.useEffect(() => {
        if (!autoplay || n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
            return;
        const t = window.setInterval(() => {
            const root = rootRef.current;
            if (!root ||
                document.hidden ||
                drag.current ||
                root.contains(document.activeElement) ||
                root.matches(":hover") ||
                performance.now() - lastTouch.current < autoplay)
                return;
            const rect = root.getBoundingClientRect();
            if (rect.bottom <= 0 || rect.top >= window.innerHeight)
                return;
            goTo(activeRef.current >= n - 1 ? 0 : activeRef.current + 1);
        }, autoplay);
        return () => window.clearInterval(t);
    }, [autoplay, n, goTo]);
    const onDown = (e) => {
        if (e.button !== 0 || !e.isPrimary || e.target.closest(".pl-bar"))
            return;
        lastTouch.current = performance.now();
        drag.current = {
            x: e.clientX,
            off: sim.current.off,
            lx: e.clientX,
            lt: e.timeStamp,
            v: 0,
            moved: false,
        };
    };
    const onMove = (e) => {
        const d = drag.current;
        if (!d)
            return;
        const dx = e.clientX - d.x;
        if (!d.moved && Math.abs(dx) > 5) {
            d.moved = true;
            setDragging(true);
            rootRef.current?.setPointerCapture(e.pointerId);
        }
        if (!d.moved)
            return;
        const dt = Math.max(1, e.timeStamp - d.lt);
        d.v = 0.7 * ((e.clientX - d.lx) / dt) + 0.3 * d.v;
        d.lx = e.clientX;
        d.lt = e.timeStamp;
        const max = Math.max(0, n - 1) * spacing;
        let off = d.off - dx;
        if (off < 0)
            off *= 0.35;
        if (off > max)
            off = max + (off - max) * 0.35;
        sim.current.off = off;
    };
    const finishDrag = (e, cancelled = false) => {
        const d = drag.current;
        drag.current = null;
        lastTouch.current = performance.now();
        if (!d)
            return;
        if (rootRef.current?.hasPointerCapture(e.pointerId))
            rootRef.current.releasePointerCapture(e.pointerId);
        if (d.moved) {
            setDragging(false);
            sim.current.vel = cancelled ? 0 : -d.v * 1000;
            goTo(nearestAt(sim.current.off - (cancelled ? 0 : d.v * 180), spacing, n));
        }
        else if (!cancelled) {
            const card = e.target.closest("[data-i]");
            if (card)
                goTo(Number(card.getAttribute("data-i")));
        }
    };
    const step = (dir) => {
        lastTouch.current = performance.now();
        goTo(activeRef.current + dir);
    };
    const onKey = (e) => {
        if (e.key === "ArrowRight")
            step(1);
        else if (e.key === "ArrowLeft")
            step(-1);
        else
            return;
        e.preventDefault();
    };
    const s = slides[active] || {};
    if (!n)
        return null;
    return (<div ref={rootRef} className={["pl-root", className].filter(Boolean).join(" ")} style={{
            height,
            "--pl-bg": background,
            "--pl-ink": ink,
            "--pl-string": string,
            "--pl-muted": "color-mix(in srgb, var(--pl-ink) 55%, transparent)",
            "--pl-line": "color-mix(in srgb, var(--pl-ink) 18%, transparent)",
            "--pl-cw": size.cw + "px",
            ...style,
        }} data-drag={dragging ? "1" : "0"} data-cursor="drag" role="region" aria-roledescription="carousel" aria-label={ariaLabel} tabIndex={0} onKeyDown={onKey} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={(e) => finishDrag(e)} onPointerCancel={(e) => finishDrag(e, true)} onLostPointerCapture={(e) => finishDrag(e, true)}>
      <style>{PL_CSS}</style>
      <svg className="pl-string" aria-hidden="true">
        <path ref={pathRef} fill="none" stroke={string} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      {slides.map((sl, i) => (<div key={i} className="pl-card" data-i={i} data-on={i === active ? "1" : "0"} ref={(el) => {
                cards.current[i] = el;
            }} aria-hidden={i === active ? undefined : true}>
          <div className="pl-print">
            <div className="pl-shot">
              {sl.artwork ? (<div className="pl-art" style={{ "--pl-tint": sl.tint || "var(--primary)" }} aria-hidden="true">
                  <span className="pl-art-label">L.O.O.M. / {pad2(i + 1)}</span>
                  {sl.artwork}
                </div>) : srcs[i] ? (<img src={srcs[i]} alt={sl.alt || sl.title || ""} draggable={false}/>) : null}
            </div>
            <div className="pl-note">{sl.title || ""}</div>
          </div>
          <div className="pl-peg"/>
        </div>))}
      <div className="pl-bar" data-cursor="default">
        <div className="pl-cap" key={active} aria-hidden="true">
          {s.title ? <span className="pl-title">{s.title}</span> : null}
          {s.caption ? <span className="pl-sub">{s.caption}</span> : null}
        </div>
        <span className="pl-count" aria-hidden="true">
          <b>{pad2(active + 1)}</b> / {pad2(n)}
        </span>
        <button type="button" className="pl-btn" aria-label="Previous" disabled={active === 0} onClick={() => step(-1)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.4"/>
          </svg>
        </button>
        <button type="button" className="pl-btn" aria-label="Next" disabled={active === n - 1} onClick={() => step(1)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.4"/>
          </svg>
        </button>
      </div>
      <div className="pl-sr" aria-live="polite">{`Print ${active + 1} of ${n}${s.title ? ": " + s.title : ""}${s.caption ? ". " + s.caption : ""}`}</div>
    </div>);
}
