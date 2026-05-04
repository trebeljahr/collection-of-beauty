import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Imprint",
  description: "Operator and contact information for Collection of Beauty.",
  alternates: { canonical: "/imprint" },
  robots: { index: true, follow: true },
};

export default function ImprintPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
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
              href="mailto:imprint+collection-of-beauty@trebeljahr.com"
              className="underline hover:text-[var(--muted-foreground)]"
            >
              imprint+collection-of-beauty@trebeljahr.com
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
            As a service provider, I am responsible for my own content on these pages in accordance
            with § 7 (1) DDG and general laws. However, pursuant to §§ 8 to 10 DDG, I am not
            obligated as a service provider to monitor transmitted or stored third-party information
            or to investigate circumstances that indicate illegal activity.
          </p>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Obligations to remove or block the use of information under general laws remain
            unaffected. Liability in this regard is only possible from the point at which a specific
            legal violation becomes known. Upon becoming aware of such violations I will remove the
            content immediately.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Liability for Links</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            This site contains links to external websites of third parties over whose content I have
            no influence. I cannot assume any liability for these third-party contents; the
            respective provider or operator of the linked pages is solely responsible. Linked pages
            were checked for possible legal violations at the time of linking. Permanent monitoring
            of the linked content is not reasonable without concrete evidence of a violation. If I
            become aware of any legal violations, I will remove the link immediately.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Copyright</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            The artworks shown on this site are, to the best of my knowledge, in the public domain
            or available under open licences. Source files and metadata are drawn from Wikimedia
            Commons; per-work attribution and licence details are linked from each artwork page. If
            you believe a work has been published here in error, please get in touch and the
            affected content will be removed promptly.
          </p>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Original content created by the site operator (page text, layout, code) is subject to
            German copyright law. Duplication, processing, distribution, and any kind of use outside
            the limits of copyright require written consent.
          </p>
        </div>
      </section>
    </div>
  );
}
