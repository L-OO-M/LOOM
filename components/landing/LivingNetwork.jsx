"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/* Living network: a canvas of the real federation. The LOOM knot sits at
   center; every chapter from /api/chapters orbits it, sized by members.
   The cursor wakes nearby nodes; selecting one shows its true numbers.
   No chapters yet → an honest founding state, never invented data. */
export function LivingNetwork() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [chapters, setChapters] = useState(null);
  const [selected, setSelected] = useState(null);
  const stateRef = useRef({ selected: null, hover: null });

  useEffect(() => {
    let live = true;
    fetch("/api/chapters").then((r) => r.json()).then((d) => {
      if (!live || !d.ok) { if (live) setChapters([]); return; }
      if (live) {
        const list = (d.data?.chapters ?? []).slice(0, 8);
        setChapters(list);
        if (list.length) setSelected((s) => s ?? list[0].slug);
      }
    }).catch(() => { if (live) setChapters([]); });
    return () => { live = false; };
  }, []);

  useEffect(() => { stateRef.current.selected = selected; }, [selected]);

  useEffect(() => {
    if (!chapters || !chapters.length) return;
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.getContext("2d");
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0, h = 0, raf = 0, running = true;
    const mouse = { x: -9999, y: -9999, inside: false };
    const maxMembers = Math.max(...chapters.map((c) => c.members || 0), 1);

    const nodes = chapters.map((c, i) => {
      const a = (Math.PI * 2 * i) / chapters.length - Math.PI / 2;
      return {
        c, angle: a, speed: 0.00012 + Math.random() * 0.00012,
        orbit: 0.30 + (i % 3) * 0.055, r: 5 + 13 * Math.sqrt((c.members || 0) / maxMembers),
        tw: Math.random() * Math.PI * 2, x: 0, y: 0
      };
    });

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      w = rect.width; h = Math.max(320, Math.min(480, w * 0.62));
      canvas.width = w * DPR; canvas.height = h * DPR;
      canvas.style.height = `${h}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e8c26a";
    const dark = document.documentElement.dataset.theme !== "light";

    const frame = (now) => {
      if (!running) return;
      const t = now / 1000;
      const cx = w / 2, cy = h / 2, base = Math.min(w, h);
      ctx.clearRect(0, 0, w, h);

      for (const n of nodes) {
        n.angle += reduced ? 0 : n.speed * 16;
        n.x = cx + Math.cos(n.angle) * base * n.orbit;
        n.y = cy + Math.sin(n.angle) * base * n.orbit * 0.82;
      }

      // threads: every chapter to the knot, plus neighbor arcs
      ctx.lineWidth = 1;
      for (const n of nodes) {
        const sel = stateRef.current.selected === n.c.slug;
        ctx.strokeStyle = sel ? accent : dark ? "rgba(232,194,106,0.28)" : "rgba(138,109,31,0.35)";
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(n.x, n.y); ctx.stroke();
      }
      ctx.strokeStyle = dark ? "rgba(143,168,200,0.22)" : "rgba(100,116,139,0.35)";
      ctx.setLineDash([2, 5]);
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i], b = nodes[(i + 1) % nodes.length];
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y); ctx.stroke();
      }
      ctx.setLineDash([]);

      // knot
      const pulse = reduced ? 0 : Math.sin(t * 1.6) * 2;
      ctx.strokeStyle = accent; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx, cy, 22 + pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark ? "rgba(244,241,232,0.6)" : "rgba(30,32,34,0.6)";
      ctx.font = "10px monospace"; ctx.textAlign = "center";
      ctx.fillText("LOOM", cx, cy + 38);

      for (const n of nodes) {
        const dx = n.x - mouse.x, dy = n.y - mouse.y;
        const d = Math.hypot(dx, dy);
        const wake = mouse.inside && d < 110 ? 1 - d / 110 : 0;
        const sel = stateRef.current.selected === n.c.slug;
        const hov = stateRef.current.hover === n.c.slug;
        const flicker = reduced ? 0 : Math.sin(t * 2 + n.tw) * 0.08;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * (1 + wake * 0.35) + (sel ? 2 : 0), 0, Math.PI * 2);
        ctx.fillStyle = (sel || hov)
          ? accent
          : dark ? `rgba(232,194,106,${0.45 + flicker + wake * 0.4})` : `rgba(138,109,31,${0.5 + flicker + wake * 0.4})`;
        ctx.fill();
        if (wake > 0.05 && !reduced) {
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 6 + wake * 8, 0, Math.PI * 2);
          ctx.strokeStyle = dark ? `rgba(63,210,224,${wake * 0.5})` : `rgba(14,116,144,${wake * 0.5})`;
          ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.fillStyle = dark ? "rgba(244,241,232,0.75)" : "rgba(30,32,34,0.8)";
        ctx.font = "11px system-ui"; ctx.textAlign = "center";
        ctx.fillText(n.c.public_name, n.x, n.y - n.r - 8);
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !reduced) { running = true; raf = requestAnimationFrame(frame); }
      else { running = false; cancelAnimationFrame(raf); }
      if (e.isIntersecting && reduced) frame(0);
    });
    io.observe(wrap);

    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    };
    const onMove = (e) => {
      toLocal(e); mouse.inside = true;
      let best = null, bd = 28;
      for (const n of nodes) {
        const d = Math.hypot(n.x - mouse.x, n.y - mouse.y);
        if (d < bd) { bd = d; best = n.c.slug; }
      }
      stateRef.current.hover = best;
      canvas.style.cursor = best ? "pointer" : "default";
    };
    const onLeave = () => { mouse.inside = false; stateRef.current.hover = null; };
    const onClick = (e) => {
      toLocal(e);
      for (const n of nodes) {
        if (Math.hypot(n.x - mouse.x, n.y - mouse.y) < n.r + 14) { setSelected(n.c.slug); return; }
      }
    };
    canvas.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    if (reduced) frame(0);
    return () => {
      running = false; cancelAnimationFrame(raf); io.disconnect();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters]);

  if (chapters === null) {
    return <div className="mt-10 h-72 animate-pulse rounded-2xl border" style={{ borderColor: "var(--line)" }} aria-label="Loading network" />;
  }

  if (!chapters.length) {
    return (
      <div className="mt-10 rounded-2xl border p-8 text-center sm:p-12" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <p className="kicker">The network, at ignition</p>
        <h3 className="font-display mt-4 text-3xl font-medium" style={{ color: "var(--text)" }}>
          One knot, waiting for its first threads.
        </h3>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6" style={{ color: "var(--text-muted)" }}>
          Chapters appear here the moment they form — with real members and real merges.
          Nothing is staged. Yours could draw the first line.
        </p>
        <Link href="/register" className="btn-ink mt-7">
          Start the founding chapter <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  const sel = chapters.find((c) => c.slug === selected) ?? chapters[0];
  return (
    <div className="mt-10 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <div ref={wrapRef} className="relative">
        <canvas ref={canvasRef} className="block w-full" role="img"
          aria-label={`Network map of ${chapters.length} chapters connected through LOOM`} />
      </div>
      <div className="grid gap-6 border-t p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-7" style={{ borderColor: "var(--line)" }}>
        <div aria-live="polite">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
            {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"} in the weave
          </p>
          <h3 className="font-display mt-2 text-3xl font-medium" style={{ color: "var(--text)" }}>{sel.public_name}</h3>
          <p className="mt-2 font-mono text-sm" style={{ color: "var(--text)" }}>
            {sel.members} <span className="font-sans text-xs" style={{ color: "var(--text-muted)" }}>members · {sel.oss_merges} verified OSS merges</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a chapter">
          {chapters.map((c) => (
            <button key={c.slug} type="button" onClick={() => setSelected(c.slug)}
              aria-pressed={selected === c.slug}
              className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
              style={selected === c.slug
                ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#101314" }
                : { borderColor: "var(--line)", color: "var(--text-muted)" }}>
              {c.public_name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-6 sm:px-7">
        <p className="max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
          One society, many campuses. Every node below is live data — hover the map or pick a chapter.
        </p>
        <Link href="/register" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--accent)" }}>
          Bring L.O.O.M. to your college <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
