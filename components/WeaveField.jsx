// "use client";

// import { useEffect, useRef } from "react";

// /* The loom narrative — scattered threads stream in from the LEFT, get caught
//    by the beam at center (a slow vortex spins them into line), and exit RIGHT
//    as ordered warp: chaos processed into fabric. Scrolling drives the story:
//    scroll velocity makes the wires snake, and scroll progress looms everything
//    tighter until the fabric is complete by the time the hero leaves. Cursor
//    nearby parts and brightens the strands. One 2D canvas, no libraries:
//    analytical full-width curves (unbroken at any viewport), IO + visibility
//    gating, DPR ≤ 1.5, one composed frame under prefers-reduced-motion. */
// const CHAOS = [
//   [63, 210, 224], [232, 168, 62], [232, 106, 94], [143, 168, 200], [232, 194, 106]
// ];
// const ORDERED = [232, 194, 106];
// const CREAM = [244, 241, 232];
// const SLOTS = 14;
// const COUNT = 34;

// function mix(a, b, t) {
//   return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
// }
// function smooth(a, b, x) {
//   const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
//   return t * t * (3 - 2 * t);
// }
// function clamp01(v) {
//   return Math.min(1, Math.max(0, v));
// }

// export function WeaveField() {
//   const ref = useRef(null);

//   useEffect(() => {
//     const canvas = ref.current;
//     if (!canvas) return;
//     const ctx = canvas.getContext("2d");
//     const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
//     const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
//     let w = 0, h = 0, heroH = 1, raf = 0, running = false;
//     const pointer = { x: -9999, y: -9999 };
//     // scroll story state (lerped every frame — never jumpy)
//     const scroll = { target: 0, y: 0, vel: 0, prev: 0 };
//     const sparks = [];
//     let sparkTimer = 0;

//     const slotY = (i) => h * (0.12 + (0.76 * i) / (SLOTS - 1));

//     // Stateless strands: everything derives from (x, t), so lines are
//     // unbroken at any width and cost nothing to maintain.
//     const threads = Array.from({ length: COUNT }, (_, i) => ({
//       slot: (i * 7 + 3) % SLOTS,
//       chaos: CHAOS[i % CHAOS.length],
//       order: i % 3 === 0 ? CREAM : ORDERED,
//       amp1: 50 + ((i * 37) % 70),
//       amp2: 18 + ((i * 23) % 30),
//       lam1: 300 + ((i * 61) % 260),
//       lam2: 90 + ((i * 29) % 80),
//       drift: 26 + ((i * 13) % 40), // pattern travel speed, px/s (left → right)
//       phase: i * 1.93,
//       width: i % 4 === 0 ? 1.8 : 1.1
//     }));

//     function size() {
//       const r = canvas.parentElement.getBoundingClientRect();
//       w = Math.max(1, Math.floor(r.width));
//       h = Math.max(1, Math.floor(r.height));
//       heroH = Math.max(1, h);
//       canvas.width = Math.floor(w * dpr);
//       canvas.height = Math.floor(h * dpr);
//       ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
//     }

//     // Thread height at (x, t): turbulent left, spun at the beam, warp right.
//     // loomT (scroll progress) pulls everything toward finished order;
//     // snake (scroll velocity) sets the wires wriggling mid-flight.
//     function threadY(th, x, t, loomT, snake) {
//       const sY = slotY(th.slot);
//       const travel = t * 0.001 * th.drift;
//       const chaos =
//         sY
//         + Math.sin(x / th.lam1 + th.phase - travel * 0.4) * th.amp1
//         + Math.sin(x / th.lam2 - th.phase * 1.7 - travel) * th.amp2;
//       const loomL = w * 0.41, loomR = w * 0.59;
//       const zone = smooth(loomL, loomR, x); // 0 left → 1 right
//       const capture = Math.max(zone, loomT * 0.97);
//       const ordered = sY + Math.sin(t * 0.0011 + th.phase) * 6;
//       let y = chaos + (ordered - chaos) * capture;
//       // vortex breath around the beam while being captured
//       const cx = (loomL + loomR) / 2;
//       const band = Math.exp(-Math.pow((x - cx) / (w * 0.07), 2));
//       y += Math.sin((x - cx) / 34 + t * 0.004 + th.phase) * 26 * band * (1 - capture * 0.55);
//       // scroll snake — traveling wave, strongest while loose
//       y += Math.sin(x * 0.02 - t * 0.009 + th.phase) * snake * (1 - capture * 0.6);
//       return { y, capture };
//     }

//     function frame(t, dt) {
//       // ease scroll state toward reality
//       scroll.y += (scroll.target - scroll.y) * 0.12;
//       const inst = dt > 0 ? (scroll.y - scroll.prev) / dt : 0;
//       scroll.prev = scroll.y;
//       scroll.vel += (inst - scroll.vel) * 0.08;
//       const loomT = clamp01(scroll.y / (heroH * 0.85));
//       const snake = 8 + Math.min(1, Math.abs(scroll.vel) / 2200) * 46;

//       ctx.clearRect(0, 0, w, h);
//       ctx.lineCap = "round";
//       const loomL = w * 0.41, loomR = w * 0.59;
//       // the beam
//       const beam = ctx.createLinearGradient(loomL, 0, loomR, 0);
//       beam.addColorStop(0, "rgba(232,194,106,0)");
//       beam.addColorStop(0.5, "rgba(232,194,106,0.14)");
//       beam.addColorStop(1, "rgba(232,194,106,0)");
//       ctx.fillStyle = beam;
//       ctx.fillRect(loomL, 0, loomR - loomL, h);
//       ctx.strokeStyle = "rgba(232,194,106,0.22)";
//       ctx.lineWidth = 1;
//       for (const f of [0.44, 0.5, 0.56]) {
//         ctx.globalAlpha = 0.5;
//         ctx.beginPath();
//         ctx.moveTo(w * f, h * 0.06);
//         ctx.lineTo(w * f, h * 0.94);
//         ctx.stroke();
//       }
//       ctx.globalAlpha = 1;
//       // strands
//       const step = Math.max(5, Math.floor(w / 160));
//       const hasPointer = pointer.x > -100;
//       for (const th of threads) {
//         // cursor proximity sampled at the pointer's x — one eval per strand
//         let glow = 0, push = 0;
//         if (hasPointer) {
//           const { y: py } = threadY(th, pointer.x, t, loomT, snake);
//           const d = Math.abs(pointer.y - py);
//           if (d < 130) {
//             const f = (130 - d) / 130;
//             glow = f;
//             push = (pointer.y > py ? -1 : 1) * f * 26;
//           }
//         }
//         // blend toward finished gold where the fabric is done (right side)
//         const { capture: mid } = threadY(th, w * 0.7, t, loomT, snake);
//         const c = mix(th.chaos, th.order, mid * 0.85);
//         ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.26 + mid * 0.32 + glow * 0.3).toFixed(3)})`;
//         ctx.lineWidth = th.width + glow * 0.7;
//         ctx.beginPath();
//         for (let x = -10; x <= w + 10; x += step) {
//           const { y } = threadY(th, x, t, loomT, snake);
//           const yy = y + push * Math.exp(-Math.pow((x - pointer.x) / 130, 2));
//           if (x === -10) ctx.moveTo(x, yy);
//           else ctx.lineTo(x, yy);
//         }
//         ctx.stroke();
//       }
//       // processing sparks ride the finished warp out to the right
//       sparkTimer -= dt;
//       if (sparkTimer <= 0 && sparks.length < 8) {
//         sparkTimer = 0.35 + Math.random() * 0.4;
//         sparks.push({ x: loomR + 10, slot: (Math.random() * SLOTS) | 0, v: 240 + Math.random() * 120 });
//       }
//       for (let i = sparks.length - 1; i >= 0; i--) {
//         sparks[i].x += sparks[i].v * dt;
//         if (sparks[i].x > w + 20) sparks.splice(i, 1);
//       }
//       for (const s of sparks) {
//         const y = slotY(s.slot);
//         ctx.fillStyle = "rgba(244,241,232,0.9)";
//         ctx.beginPath();
//         ctx.arc(s.x, y, 1.6, 0, Math.PI * 2);
//         ctx.fill();
//         ctx.fillStyle = "rgba(232,194,106,0.25)";
//         ctx.beginPath();
//         ctx.arc(s.x, y, 4.5, 0, Math.PI * 2);
//         ctx.fill();
//       }
//     }

//     let last = 0;
//     function loop(now) {
//       if (!running) return;
//       const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
//       last = now;
//       frame(now, dt);
//       raf = requestAnimationFrame(loop);
//     }
//     function start() {
//       if (running || reduce) return;
//       running = true;
//       last = performance.now();
//       raf = requestAnimationFrame(loop);
//     }
//     function stop() {
//       running = false;
//       cancelAnimationFrame(raf);
//     }

//     const onMove = (e) => {
//       const r = canvas.getBoundingClientRect();
//       pointer.x = e.clientX - r.left;
//       pointer.y = e.clientY - r.top;
//     };
//     const onLeave = () => { pointer.x = -9999; pointer.y = -9999; };
//     const onScroll = () => { scroll.target = window.scrollY || 0; };
//     const onVis = () => { document.hidden ? stop() : start(); };
//     const io = new IntersectionObserver(([entry]) => {
//       if (document.hidden) return;
//       entry.isIntersecting ? start() : stop();
//     }, { threshold: 0 });

//     size();
//     onScroll();
//     window.addEventListener("resize", size);
//     window.addEventListener("pointermove", onMove, { passive: true });
//     window.addEventListener("scroll", onScroll, { passive: true });
//     document.addEventListener("mouseleave", onLeave);
//     document.addEventListener("visibilitychange", onVis);
//     io.observe(canvas);
//     if (reduce) frame(9000, 0.016);
//     else start();

//     return () => {
//       stop();
//       io.disconnect();
//       window.removeEventListener("resize", size);
//       window.removeEventListener("pointermove", onMove);
//       window.removeEventListener("scroll", onScroll);
//       document.removeEventListener("mouseleave", onLeave);
//       document.removeEventListener("visibilitychange", onVis);
//     };
//   }, []);

//   return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
// }



"use client";

import { useEffect, useRef } from "react";

/* The loom narrative — scattered threads stream in from the LEFT, get caught
   by the beam at center (a slow vortex spins them into line), and exit RIGHT
   as ordered warp: chaos processed into fabric. Scrolling drives the story:
   scroll velocity makes the wires snake, and scroll progress looms everything
   tighter until the fabric is complete by the time the hero leaves. Cursor
   nearby parts and brightens the strands. One 2D canvas, no libraries:
   analytical full-width curves (unbroken at any viewport), IO + visibility
   gating, DPR ≤ 1.5, one composed frame under prefers-reduced-motion. */

const CHAOS = [
  [63, 210, 224], [232, 168, 62], [232, 106, 94], [143, 168, 200], [232, 194, 106]
];
const ORDERED = [232, 194, 106];
const CREAM = [244, 241, 232];
const SLOTS = 14;
const COUNT = 34;

// -------------------------------------------------------------
// Speed Multiplier:
// 1.0 = normal speed | 0.5 = 50% speed | 0.35 = 35% speed
// Change this value to adjust the overall animation speed.
// -------------------------------------------------------------
const SPEED = 0.35;

function mix(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}
function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

export function WeaveField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0, h = 0, heroH = 1, raf = 0, running = false;
    const pointer = { x: -9999, y: -9999 };
    // scroll story state (lerped every frame — never jumpy)
    const scroll = { target: 0, y: 0, vel: 0, prev: 0 };
    const sparks = [];
    let sparkTimer = 0;

    const slotY = (i) => h * (0.12 + (0.76 * i) / (SLOTS - 1));

    // Stateless strands: everything derives from (x, t), so lines are
    // unbroken at any width and cost nothing to maintain.
    const threads = Array.from({ length: COUNT }, (_, i) => ({
      slot: (i * 7 + 3) % SLOTS,
      chaos: CHAOS[i % CHAOS.length],
      order: i % 3 === 0 ? CREAM : ORDERED,
      amp1: 50 + ((i * 37) % 70),
      amp2: 18 + ((i * 23) % 30),
      lam1: 300 + ((i * 61) % 260),
      lam2: 90 + ((i * 29) % 80),
      drift: 26 + ((i * 13) % 40), // pattern travel speed, px/s (left → right)
      phase: i * 1.93,
      width: i % 4 === 0 ? 1.8 : 1.1
    }));

    function size() {
      const r = canvas.parentElement.getBoundingClientRect();
      w = Math.max(1, Math.floor(r.width));
      h = Math.max(1, Math.floor(r.height));
      heroH = Math.max(1, h);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Thread height at (x, t): turbulent left, spun at the beam, warp right.
    // loomT (scroll progress) pulls everything toward finished order;
    // snake (scroll velocity) sets the wires wriggling mid-flight.
    function threadY(th, x, t, loomT, snake) {
      const sY = slotY(th.slot);
      const travel = t * 0.001 * th.drift;
      const chaos =
        sY
        + Math.sin(x / th.lam1 + th.phase - travel * 0.4) * th.amp1
        + Math.sin(x / th.lam2 - th.phase * 1.7 - travel) * th.amp2;
      const loomL = w * 0.41, loomR = w * 0.59;
      const zone = smooth(loomL, loomR, x); // 0 left → 1 right
      const capture = Math.max(zone, loomT * 0.97);
      const ordered = sY + Math.sin(t * 0.0011 + th.phase) * 6;
      let y = chaos + (ordered - chaos) * capture;
      // vortex breath around the beam while being captured
      const cx = (loomL + loomR) / 2;
      const band = Math.exp(-Math.pow((x - cx) / (w * 0.07), 2));
      y += Math.sin((x - cx) / 34 + t * 0.004 + th.phase) * 26 * band * (1 - capture * 0.55);
      // scroll snake — traveling wave, strongest while loose
      y += Math.sin(x * 0.02 - t * 0.009 + th.phase) * snake * (1 - capture * 0.6);
      return { y, capture };
    }

    function frame(t, dt, realDt) {
      // ease scroll state toward reality
      scroll.y += (scroll.target - scroll.y) * 0.12;
      const inst = realDt > 0 ? (scroll.y - scroll.prev) / realDt : 0;
      scroll.prev = scroll.y;
      scroll.vel += (inst - scroll.vel) * 0.08;
      const loomT = clamp01(scroll.y / (heroH * 0.85));
      const snake = 8 + Math.min(1, Math.abs(scroll.vel) / 2200) * 46;

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      const loomL = w * 0.41, loomR = w * 0.59;
      // the beam
      const beam = ctx.createLinearGradient(loomL, 0, loomR, 0);
      beam.addColorStop(0, "rgba(232,194,106,0)");
      beam.addColorStop(0.5, "rgba(232,194,106,0.14)");
      beam.addColorStop(1, "rgba(232,194,106,0)");
      ctx.fillStyle = beam;
      ctx.fillRect(loomL, 0, loomR - loomL, h);
      ctx.strokeStyle = "rgba(232,194,106,0.22)";
      ctx.lineWidth = 1;
      for (const f of [0.44, 0.5, 0.56]) {
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(w * f, h * 0.06);
        ctx.lineTo(w * f, h * 0.94);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // strands
      const step = Math.max(5, Math.floor(w / 160));
      const hasPointer = pointer.x > -100;
      for (const th of threads) {
        // cursor proximity sampled at the pointer's x — one eval per strand
        let glow = 0, push = 0;
        if (hasPointer) {
          const { y: py } = threadY(th, pointer.x, t, loomT, snake);
          const d = Math.abs(pointer.y - py);
          if (d < 130) {
            const f = (130 - d) / 130;
            glow = f;
            push = (pointer.y > py ? -1 : 1) * f * 26;
          }
        }
        // blend toward finished gold where the fabric is done (right side)
        const { capture: mid } = threadY(th, w * 0.7, t, loomT, snake);
        const c = mix(th.chaos, th.order, mid * 0.85);
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.26 + mid * 0.32 + glow * 0.3).toFixed(3)})`;
        ctx.lineWidth = th.width + glow * 0.7;
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += step) {
          const { y } = threadY(th, x, t, loomT, snake);
          const yy = y + push * Math.exp(-Math.pow((x - pointer.x) / 130, 2));
          if (x === -10) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // processing sparks ride the finished warp out to the right
      sparkTimer -= dt;
      if (sparkTimer <= 0 && sparks.length < 8) {
        sparkTimer = 0.35 + Math.random() * 0.4;
        sparks.push({ x: loomR + 10, slot: (Math.random() * SLOTS) | 0, v: 240 + Math.random() * 120 });
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        sparks[i].x += sparks[i].v * dt;
        if (sparks[i].x > w + 20) sparks.splice(i, 1);
      }
      for (const s of sparks) {
        const y = slotY(s.slot);
        ctx.fillStyle = "rgba(244,241,232,0.9)";
        ctx.beginPath();
        ctx.arc(s.x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(232,194,106,0.25)";
        ctx.beginPath();
        ctx.arc(s.x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    let last = 0;
    let simulatedTime = 0;

    function loop(now) {
      if (!running) return;
      const realDt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;

      // Scale deltaTime by SPEED multiplier
      const dt = realDt * SPEED;
      simulatedTime += dt * 1000;

      frame(simulatedTime, dt, realDt);
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (running || reduce) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    const onLeave = () => { pointer.x = -9999; pointer.y = -9999; };
    const onScroll = () => { scroll.target = window.scrollY || 0; };
    const onVis = () => { document.hidden ? stop() : start(); };
    const io = new IntersectionObserver(([entry]) => {
      if (document.hidden) return;
      entry.isIntersecting ? start() : stop();
    }, { threshold: 0 });

    size();
    onScroll();
    window.addEventListener("resize", size);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("visibilitychange", onVis);
    io.observe(canvas);
    if (reduce) frame(9000, 0.016, 0.016);
    else start();

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener("resize", size);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}