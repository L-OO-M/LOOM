"use client";

export default function ExportGithubButton({ data }) {
  function download() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "loom-github-activity.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={download}
      type="button"
      title="Download your recorded GitHub activity as JSON"
      className="btn-ghost !py-2 text-sm transition active:scale-[0.97]"
    >
      ↓ Export activity
    </button>
  );
}
