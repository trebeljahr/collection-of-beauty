"use client";

import { useCallback, useEffect, useState } from "react";

// Curator decision UI for the low-res replacement review page.
// Selections persist in localStorage under DECISIONS_KEY; the floating
// export button copies a decisions JSON array consumable by
// scripts/apply-hires-replacements.mjs.

const DECISIONS_KEY = "replacement-decisions-v1";

type Decision = {
  id: string;
  fileUrl: string;
  action: "redownload" | "replace";
};

function loadDecisions(): Record<string, Decision> {
  try {
    return JSON.parse(window.localStorage.getItem(DECISIONS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveDecisions(d: Record<string, Decision>) {
  window.localStorage.setItem(DECISIONS_KEY, JSON.stringify(d));
  window.dispatchEvent(new Event("replacement-decisions-changed"));
}

export function ApproveButton({
  targetId,
  fileUrl,
  source,
}: {
  targetId: string;
  fileUrl: string;
  source: string;
}) {
  const [picked, setPicked] = useState(false);

  const refresh = useCallback(() => {
    const d = loadDecisions()[targetId];
    setPicked(d?.fileUrl === fileUrl);
  }, [targetId, fileUrl]);

  useEffect(() => {
    refresh();
    window.addEventListener("replacement-decisions-changed", refresh);
    return () => window.removeEventListener("replacement-decisions-changed", refresh);
  }, [refresh]);

  const toggle = () => {
    const all = loadDecisions();
    if (all[targetId]?.fileUrl === fileUrl) {
      delete all[targetId];
    } else {
      all[targetId] = {
        id: targetId,
        fileUrl,
        action: source === "own-file" ? "redownload" : "replace",
      };
    }
    saveDecisions(all);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`mt-2 rounded px-3 py-1 text-xs font-semibold ${
        picked
          ? "bg-emerald-600 text-white"
          : "border border-zinc-400 bg-white text-zinc-700 hover:bg-zinc-100"
      }`}
    >
      {picked ? "✓ approved as replacement" : "approve this candidate"}
    </button>
  );
}

export function ExportDecisions() {
  const [count, setCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    setCount(Object.keys(loadDecisions()).length);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("replacement-decisions-changed", refresh);
    return () => window.removeEventListener("replacement-decisions-changed", refresh);
  }, [refresh]);

  const copy = async () => {
    const json = JSON.stringify(Object.values(loadDecisions()), null, 2);
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const clear = () => {
    if (window.confirm("Clear all approval decisions?")) saveDecisions({});
  };

  if (count === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-zinc-300 bg-white p-3 shadow-lg">
      <span className="text-sm text-zinc-700">{count} approved</span>
      <button
        type="button"
        onClick={copy}
        className="rounded bg-zinc-900 px-3 py-1 text-xs font-semibold text-white"
      >
        {copied ? "copied!" : "copy decisions JSON"}
      </button>
      <button
        type="button"
        onClick={clear}
        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600"
      >
        clear
      </button>
    </div>
  );
}
