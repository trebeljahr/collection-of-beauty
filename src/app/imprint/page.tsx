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
        <div>
          <h2 className="font-serif text-xl md:text-2xl">Operator</h2>
          <p className="mt-2">
            Rico Trebeljahr
            <br />
            {/* TODO: fill in real address */}
            <span className="text-[var(--muted-foreground)]">[Street and number]</span>
            <br />
            <span className="text-[var(--muted-foreground)]">[Postal code, City]</span>
            <br />
            <span className="text-[var(--muted-foreground)]">Germany</span>
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Contact</h2>
          <p className="mt-2">
            Email:{" "}
            <a
              href="mailto:ricotrebeljahr@gmail.com"
              className="underline hover:text-[var(--muted-foreground)]"
            >
              ricotrebeljahr@gmail.com
            </a>
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Responsible for content</h2>
          <p className="mt-2">
            Rico Trebeljahr
            <br />
            <span className="text-[var(--muted-foreground)]">[address as above]</span>
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Liability</h2>

          <h3 className="mt-3 font-serif text-lg">Liability for content</h3>
          <p className="mt-1 text-[var(--muted-foreground)]">
            The contents of this site have been compiled with care, but no guarantee can be given
            for the accuracy, completeness, or timeliness of the information. As a service provider
            I am responsible for my own content on these pages under general law, but I am not
            obliged to monitor third-party information transmitted or stored on my behalf, nor to
            investigate circumstances that suggest illegal activity.
          </p>

          <h3 className="mt-4 font-serif text-lg">Liability for links</h3>
          <p className="mt-1 text-[var(--muted-foreground)]">
            This site contains links to external websites whose contents I do not control. No
            guarantee can therefore be given for that third-party content; the operator of each
            linked site is solely responsible for it. If I am made aware of any legal violations
            among linked sites, the link in question will be removed.
          </p>

          <h3 className="mt-4 font-serif text-lg">Copyright</h3>
          <p className="mt-1 text-[var(--muted-foreground)]">
            The works shown on this site are, to the best of my knowledge, in the public domain or
            available under open licences, with metadata sourced from Wikimedia Commons. If you do
            notice a copyright issue, please get in touch and the affected content will be removed
            promptly.
          </p>
        </div>
      </section>
    </div>
  );
}
