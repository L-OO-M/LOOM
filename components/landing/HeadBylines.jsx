// Public head / co-head byline. Leads and heads are required to have a photo, so
// this renders the portrait when the chapter has one and honest initials when it
// does not — never a placeholder face and never a broken image.

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function HeadPill({ role, name, photo }) {
  return (
    <span className="inline-flex items-center gap-2">
      {name ? (
        photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={`Portrait of ${name}, ${role}`}
            width={24}
            height={24}
            loading="lazy"
            className="size-6 shrink-0 rounded-full border object-cover"
            style={{ borderColor: "var(--line)" }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
            style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}
          >
            {initials(name)}
          </span>
        )
      ) : null}
      <span>
        {role}: <strong style={{ color: "var(--text)" }}>{name || "not assigned yet"}</strong>
      </span>
    </span>
  );
}

export function HeadBylines({ head, coHead }) {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" style={{ color: "var(--text-muted)" }}>
      <HeadPill role="Head" name={head?.name} photo={head?.photo} />
      <HeadPill role="Co-Head" name={coHead?.name} photo={coHead?.photo} />
    </p>
  );
}
