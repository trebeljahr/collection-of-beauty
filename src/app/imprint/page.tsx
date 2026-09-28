import type { Metadata } from "next";
import { PageBackdrop } from "@/components/page-backdrop";
import { artworkListings } from "@/lib/data";
import { IMPRINT_EMAIL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Imprint",
  description: "Operator and contact information for Collection of Beauty.",
  alternates: { canonical: "/imprint" },
};

// A strip of works about law, letters and offices across the top; the
// legal text below stays plain. In the order PageBackdrop deals them: the
// first three are a phone's top row, the first eight the widest screen's.
// Decoration, so an id that stops resolving (a rescan, a takedown) drops
// that one tile instead of failing the page.
const BANNER_IDS = [
  "collection-of-beauty-the-lawyer-possibly-ulrich-zasius-1461-1536-humanist-jurist-giuseppe-arcimboldo-nationalmuseum-1589",
  "collection-of-beauty-carl-spitzweg-das-auge-des-gesetzes-justitia-1857",
  "collection-of-beauty-1280px-vincent-van-gogh-the-postman-joseph-etienne-roulin-bf37-barnes-foundation",
  "collection-of-beauty-hans-holbein-der-jungere-der-kaufmann-georg-gisze-google-art-project",
  "collection-of-beauty-carl-spitzweg-der-briefbote-im-rosenthal",
  "collection-of-beauty-rembrandt-scholar-at-the-lectern",
  "collection-of-beauty-massysm-quentin-the-moneylender-and-his-wife-1514",
  "collection-of-beauty-sandro-botticelli-050",
  "collection-of-beauty-the-virgin-with-chancellor-rolin-by-jan-van-eyck-louvre-webp",
  "collection-of-beauty-holbein-danse-macabre-19",
  "collection-of-beauty-benjamin-west-john-eardley-wilmot-google-art-project",
  "collection-of-beauty-louis-leopold-boilly-the-reading-of-the-bulletin-of-the-grand-74-1989-saint-louis-art-museum",
  "collection-of-beauty-jean-leon-gerome-015-carpets",
  "collection-of-beauty-the-tribute-money-john-singleton-copley",
  "collection-of-beauty-judge-martin-howard-by-john-singleton-copley",
  "collection-of-beauty-david-wilkie-chelsea-pensioners-reading-the-waterloo-dispatch",
];
const byId = new Map(artworkListings.map((a) => [a.id, a]));
const BANNER = BANNER_IDS.flatMap((id) => byId.get(id) ?? []);

export default function ImprintPage() {
  return (
    <div className="relative isolate overflow-x-clip">
      <PageBackdrop works={BANNER} strip />
      <div className="mx-auto max-w-2xl px-4 pb-8 md:pb-12">
        <header className="mb-8">
          <h1 className="font-serif text-3xl md:text-4xl">Imprint</h1>
        </header>

        <section className="space-y-6 text-[var(--foreground)]">
          <p>
            Information pursuant to § 5 DDG (German Digital Services Act) and § 18 (2) MStV
            (Interstate Media Treaty).
          </p>

          <div>
            <h2 className="font-serif text-xl md:text-2xl">Service Provider</h2>
            <p className="mt-2">
              Rico Trebeljahr
              <br />
              c/o Block Services
              <br />
              Stuttgarter Str. 106
              <br />
              70736 Fellbach
              <br />
              Germany
            </p>
          </div>

          <div>
            <h2 className="font-serif text-xl md:text-2xl">Contact</h2>
            <p className="mt-2">
              Email:{" "}
              <a
                href={`mailto:${IMPRINT_EMAIL}`}
                className="rounded-sm underline hover:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {IMPRINT_EMAIL}
              </a>
            </p>
          </div>

          <div>
            <h2 className="font-serif text-xl md:text-2xl">
              Person Responsible for Content (§ 18 (2) MStV)
            </h2>
            <p className="mt-2">
              Rico Trebeljahr
              <br />
              c/o Block Services
              <br />
              Stuttgarter Str. 106
              <br />
              70736 Fellbach
              <br />
              Germany
            </p>
          </div>

          <div>
            <h2 className="font-serif text-xl md:text-2xl">Liability for Content</h2>
            <p className="mt-2 text-[var(--muted-foreground)]">
              As a service provider, I am responsible for my own content on these pages in
              accordance with § 7 (1) DDG and general laws. However, pursuant to §§ 8 to 10 DDG, I
              am not obligated as a service provider to monitor transmitted or stored third-party
              information or to investigate circumstances that indicate illegal activity.
            </p>
            <p className="mt-2 text-[var(--muted-foreground)]">
              Obligations to remove or block the use of information under general laws remain
              unaffected. Liability in this regard is only possible from the point at which a
              specific legal violation becomes known. Upon becoming aware of such violations I will
              remove the content immediately.
            </p>
          </div>

          <div>
            <h2 className="font-serif text-xl md:text-2xl">Liability for Links</h2>
            <p className="mt-2 text-[var(--muted-foreground)]">
              This site contains links to external websites of third parties over whose content I
              have no influence. I cannot assume any liability for these third-party contents; the
              respective provider or operator of the linked pages is solely responsible. Linked
              pages were checked for possible legal violations at the time of linking. Permanent
              monitoring of the linked content is not reasonable without concrete evidence of a
              violation. If I become aware of any legal violations, I will remove the link
              immediately.
            </p>
          </div>

          <div>
            <h2 className="font-serif text-xl md:text-2xl">Copyright</h2>
            <p className="mt-2 text-[var(--muted-foreground)]">
              The artworks shown on this site are, to the best of my knowledge, in the public domain
              or available under open licences. Source files and metadata are drawn from Wikimedia
              Commons; per-work attribution and licence details are linked from each artwork page.
              If you believe a work has been published here in error, please get in touch and the
              affected content will be removed promptly.
            </p>
            <p className="mt-2 text-[var(--muted-foreground)]">
              Original content created by the site operator (page text, layout, code) is subject to
              German copyright law. Duplication, processing, distribution, and any kind of use
              outside the limits of copyright require written consent.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
