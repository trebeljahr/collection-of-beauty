import { LineageGraph } from "@/components/lineage-graph";
import { artists, connections } from "@/lib/data";

export default function LineagePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <header className="mb-6">
        <h1 className="font-serif text-3xl md:text-4xl">Lineage</h1>
        <p className="mt-2 max-w-3xl text-[var(--muted-foreground)]">
          The social graph of artists in the collection — who knew whom,
          painted with whom, taught whom. Solid lines are direct personal
          connections; dashed lines are shared movements with overlapping
          lifetimes.
        </p>
      </header>
      <LineageGraph artists={artists} connections={connections} />
    </div>
  );
}
