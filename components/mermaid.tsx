"use client";

import { useEffect, useRef, useState } from "react";

let init = false;

/** Client-side Mermaid renderer — chart source is app-owned text. */
export function Mermaid({ chart, caption }: { chart: string; caption?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const mermaid = (await import("mermaid")).default;
      if (!init) {
        mermaid.initialize({ startOnLoad: false, theme: "neutral" });
        init = true;
      }
      const { svg } = await mermaid.render(
        `m${Math.random().toString(36).slice(2)}`,
        chart,
      );
      if (live && ref.current) ref.current.innerHTML = svg;
    })().catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, [chart]);

  return (
    <figure className="overflow-x-auto rounded-lg border border-[#e2e9f2] bg-white p-3">
      {err ? (
        <pre dir="ltr" className="text-[11px] text-slate-600">{chart}</pre>
      ) : (
        <div ref={ref} dir="ltr" />
      )}
      {caption && (
        <figcaption className="mt-2 text-center text-[11px] text-slate-500">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
