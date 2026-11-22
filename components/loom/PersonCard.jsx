"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// A name you can click.
//
// Every surface that lists people renders a name, and every one of those names
// is a dead end: you cannot tell who someone is without leaving the page. This
// wraps the name in a button that opens a small card -- role, department,
// verified record, chapter position -- with a link onward to their profile
// (public card) or their admin record (admins only).
//
// The panel is positioned `fixed` from the button's rect on purpose: names sit
// inside cards and table cells that clip overflow, and an absolutely-positioned
// popover would be cut in half.

const PANEL_WIDTH = 320;
const GAP = 8;

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export function PersonCard({ id, name, className = "", children }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [coords, setCoords] = useState(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") close();
    }
    function onPointer(event) {
      if (panelRef.current?.contains(event.target)) return;
      if (buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const maxLeft = Math.max(GAP, window.innerWidth - PANEL_WIDTH - GAP);
    const left = Math.min(Math.max(GAP, rect.left), maxLeft);
    // Prefer below; flip above when the panel would run off the bottom.
    const below = rect.bottom + GAP;
    const flip = below + 300 > window.innerHeight && rect.top > 320;
    setCoords({ left, top: flip ? Math.max(GAP, rect.top - 300 - GAP) : below });
  }

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    place();
    setOpen(true);
    if (data || !id) return;
    try {
      const res = await fetch(`/api/people/${encodeURIComponent(id)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body?.error?.message || "That card could not be loaded.");
        return;
      }
      setData(body.data);
    } catch {
      setError("Network error — try again.");
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`text-left underline decoration-dotted underline-offset-4 hover:no-underline ${className}`}
        style={{ color: "inherit" }}
      >
        {children ?? name ?? "A member"}
      </button>
      {open && coords && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={`${data?.name || name || "Member"} — quick card`}
          style={{
            position: "fixed",
            left: coords.left,
            top: coords.top,
            width: PANEL_WIDTH,
            zIndex: 60,
            background: "var(--bg-elevated)",
            border: "1px solid var(--line)",
            borderRadius: 16,
            boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
            padding: 16
          }}
        >
          {error ? (
            <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">
              {error}
            </p>
          ) : !data ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Loading…
            </p>
          ) : (
            <CardBody data={data} onNavigate={() => setOpen(false)} />
          )}
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={close}
              className="text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function CardBody({ data, onNavigate }) {
  const standing = data.standing
    ? `#${data.standing.rank} of ${data.standing.total}`
    : "Unranked";
  return (
    <div>
      <div className="flex items-start gap-3">
        {data.avatarUrl ? (
          // Remote avatars are user-supplied; a plain img keeps the card free of
          // next/image domain configuration for an edge surface.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.avatarUrl}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-full object-cover"
            style={{ border: "1px solid var(--line)" }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-medium"
            style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text-muted)" }}
          >
            {initials(data.name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>
            {data.name}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {data.roleLabel}
            {data.domain ? ` · ${data.domain}` : ""}
            {data.isSelf ? " · you" : ""}
          </p>
        </div>
      </div>

      {data.bio && (
        <p className="mt-2 line-clamp-3 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          {data.bio}
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
        <div>
          <dt className="inline">Rank </dt>
          <dd className="inline font-medium" style={{ color: "var(--text)" }}>{data.tier}</dd>
        </div>
        <div>
          <dt className="inline">Position </dt>
          <dd className="inline font-medium" style={{ color: "var(--text)" }}>{standing}</dd>
        </div>
        <div className="col-span-2">
          <dt className="inline">Verified work </dt>
          <dd className="inline">{data.proofTotal} pieces</dd>
        </div>
        {data.departments.length > 0 && (
          <div className="col-span-2">
            <dt className="inline">Departments </dt>
            <dd className="inline">
              {data.departments.map((d) => d.name).join(", ")}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {data.profileHref && (
          <Link
            href={data.profileHref}
            prefetch={false}
            onClick={onNavigate}
            className="btn-ghost !py-1 text-xs"
          >
            Profile
          </Link>
        )}
        {data.adminHref && (
          <Link
            href={data.adminHref}
            prefetch={false}
            onClick={onNavigate}
            className="btn-ghost !py-1 text-xs"
          >
            Admin record
          </Link>
        )}
        {data.github && (
          <a
            href={`https://github.com/${data.github}`}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-ghost !py-1 text-xs"
          >
            GitHub
          </a>
        )}
        {!data.profileHref && !data.adminHref && !data.github && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            No public card yet.
          </span>
        )}
      </div>
    </div>
  );
}
