"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Field, inputStyle } from "@/components/ui";
import { optimizedImageUrl } from "@/lib/media-url";

/**
 * One image field: upload a file, paste a URL, or clear it.
 *
 * The upload goes through /api/uploads/images, which stores the bytes in
 * Supabase Storage or Cloudinary and returns the URL that is persisted on the
 * event row. Keeping the URL text editable means a lead can point at artwork
 * that already lives somewhere else, and a failed upload never blocks the form.
 */
export function CoverImageField({
  value,
  onChange,
  label = "Cover image",
  hint = "PNG, JPEG, WebP or GIF, up to 8 MB. Leave blank for generated artwork.",
  purpose = "event",
  disabled = false
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = /^(https:\/\/|\/(?!\/))/.test(String(value || ""));

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("purpose", purpose);
      const response = await fetch("/api/uploads/images", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError(data?.error?.message || "Upload failed. Try a smaller image or paste a URL instead.");
        return;
      }
      onChange(data.data.url);
    } catch {
      setError("Network error — the image was not uploaded.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <Field label={label}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={value || ""}
            onChange={(event) => onChange(event.target.value)}
            maxLength={500}
            placeholder="Upload a file, or paste an https:// image URL"
            style={{ ...inputStyle, flex: "1 1 240px" }}
            disabled={disabled}
          />
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-1.5 disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            {busy ? "Uploading…" : "Upload"}
          </button>
          {value ? (
            <button
              type="button"
              className="rounded-lg border p-2"
              style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}
              onClick={() => onChange("")}
              disabled={disabled}
              aria-label="Remove image"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(event) => upload(event.target.files?.[0])}
          tabIndex={-1}
        />
      </Field>
      <p className="meta mt-1">{hint}</p>
      {error ? (
        <p role="alert" className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
      {preview ? (
        <div
          className="relative mt-3 h-36 w-full overflow-hidden rounded-xl"
          style={{ border: "1px solid var(--line)" }}
        >
          <Image
            src={optimizedImageUrl(value, 1200)}
            alt="Cover preview"
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 720px"
            className="object-cover"
          />
        </div>
      ) : null}
    </div>
  );
}
