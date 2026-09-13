"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-ink mt-6 print:hidden">
      Print / save PDF
    </button>
  );
}
