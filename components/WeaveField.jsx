"use client";

import { useEffect, useRef } from "react";

/* Living weave — warp threads in the four pillar colors plus loom-gold drift
   across the navy hero like strands on a loom. One 2D canvas, no libraries:
   ~36 threads × two-pass strokes (wide faint pass for glow, thin pass for
   the strand) keeps it GPU-cheap. Motion rules:
   - IntersectionObserver + visibilitychange gate the rAF loop (no off-screen work)
   - prefers-reduced-motion renders a single static frame, never loops
   - DPR capped at 1.5; pointer only nudges phase, never drives layout */
const PALETTE = ["#3fd2e0", "#e8a83e", "#e86a5e", "#8fa8c8", "#e8c26a"];

export function WeaveField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let running = false;
    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: 0.5, tx: 0.5 };

    const threads = Array.from({ length: 36 }, (_, i) => {
      const band = (i % 4) / 3; // spread across the four pillar hues + gold
      return {
        base: 0.12 + 0.76 * ((i * 0.61803) % 1),
        amp: 18 + ((i * 37) % 46),
        lambda: 260 + ((i * 53) % 320),
        speed: 0.00012 + ((i * 7) % 10) * 0.00002,
        phase: i * 1.7,
        color: PALETTE[i % PALETTE.length],
        width: i % 3 === 0 ? 1.8 : 1.1,
        alpha: 0.14 + ((i * 13) % 20) / 100,
        drift: band - 0.5
      };
    });

    function size() {
      const r = canvas.parentElement.getBoundingClientRect();
      w = Math.max(1, Math.floor(r.width));
      h = Math.max(1, Math.floor(r.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame(t) {
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      const step = Math.max(6, Math.floor(w / 130));
      for (const th of threads) {
        const yBase = th.base * h + Math.sin(t * 0.00006 + th.phase) * 14 + th.drift * 10;
        // wide faint pass = glow without shadowBlur cost
        for (const [mult, aMult] of [[4.5, 0.25], [1, 1]]) {
          ctx.beginPath();
          for (let x = -20; x <= w + 20; x += step) {
            const y = yBase
              + Math.sin(x / th.lambda + th.phase + t * th.speed + pointer.x * 1.2) * th.amp
              + Math.sin(x / (th.lambda * 0.37) - t * th.speed * 1.6) * th.amp * 0.3;
            if (x === -20) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = th.color;
          ctx.globalAlpha = th.alpha * aMult;
          ctx.lineWidth = th.width * mult;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      pointer.x += (pointer.tx - pointer.x) * 0.04;
    }

    function loop(t) {
      if (!running) return;
      frame(t);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      pointer.tx = (e.clientX - r.left) / Math.max(1, r.width);
    };
    const onVis = () => { document.hidden ? stop() : start(); };
    const io = new IntersectionObserver(([entry]) => {
      if (document.hidden) return;
      entry.isIntersecting ? start() : stop();
    }, { threshold: 0 });

    size();
    window.addEventListener("resize", size);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    io.observe(canvas);
    if (reduce) frame(12000); // one composed frame, then stillness
    else start();

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener("resize", size);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
