"use client";

export default function ExportGithubButton({ data }) {
  function download() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "loom-github-stats.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={download} className="rounded-xl border px-3 py-2 text-sm transition active:scale-[0.97]" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
      Export JSON
    </button>
  );
}
