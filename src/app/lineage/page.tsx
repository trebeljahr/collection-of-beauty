import { LineageGraph } from "@/components/lineage-graph";
import { artists, connections } from "@/lib/data";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lineage",
  description:
    `The social graph of ${artists.length} artists across ${connections.length} ` +
    `connections — who taught whom, painted alongside whom, shared movements with ` +
    `whom. An interactive force-directed map of the friendships and rivalries ` +
    `that shaped the history of Western art.`,
  alternates: { canonical: "/lineage" },
  openGraph: {
    title: "Lineage · Collection of Beauty",
    description:
      `Interactive social graph of ${artists.length} artists and ${connections.length} connections — ` +
      `teachers, rivals, co-founders of movements, friends and correspondents.`,
  },
};

export default function LineagePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <header className="mb-6">
        <h1 className="font-serif text-3xl md:text-4xl">Lineage</h1>
        <p className="mt-2 max-w-3xl text-[var(--muted-foreground)]">
          The social graph of artists in the collection — who knew whom, painted with whom, taught
          whom. Solid lines are direct personal connections; dashed lines are shared movements with
          overlapping lifetimes.
        </p>
      </header>
      <LineageGraph artists={artists} connections={connections} />
    </div>
  );
}
