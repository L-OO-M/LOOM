import { initials } from "@/lib/builderCard";

// Deterministic, theme-safe avatar tint — var() only, no hardcoded colors.
function avatarTint(name) {
  const s = name || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 4;
  return [
    { background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" },
    { background: "color-mix(in srgb, var(--accent) 9%, transparent)", color: "var(--text)" },
    { background: "var(--bg-muted)", color: "var(--text)" },
    { background: "color-mix(in srgb, var(--accent) 22%, transparent)", color: "var(--text)" }
  ][h];
}

/**
 * One avatar for every profile surface: the stored photo when the member has one
 * (leads and heads only, enforced by the API), otherwise initials.
 *
 * `variant="accent"` is the public card's single-tone identity mark; the default
 * "tint" is the deterministic four-way tint used in app directories.
 */
export function PersonAvatar({ name, avatarUrl = null, size = 44, variant = "tint", className = "" }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt={`Portrait of ${name}`}
        width={size}
        height={size}
        loading="lazy"
        className={`shrink-0 rounded-full object-cover ${className}`.trim()}
        style={{ width: size, height: size }}
      />
    );
  }
  const style = variant === "accent"
    ? {
        background: "color-mix(in srgb, var(--accent) 16%, var(--bg-muted))",
        color: "var(--accent)",
        boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)"
      }
    : avatarTint(name);
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-bold ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.28)), ...style }}
    >
      {initials(name)}
    </span>
  );
}
