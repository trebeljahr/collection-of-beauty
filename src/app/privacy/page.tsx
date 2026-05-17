import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Collection of Beauty handles personal data: analytics, newsletter, processors, and your rights under the GDPR.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = "imprint+collection-of-beauty@trebeljahr.com";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Last updated: 2026-05-17 ·{" "}
          <Link href="/datenschutz" className="underline hover:text-[var(--foreground)]">
            Deutsche Fassung
          </Link>
        </p>
      </header>

      <section className="space-y-6 text-[var(--foreground)]">
        <p>
          This site (<em>Collection of Beauty</em>) processes very little personal data. This page
          explains what is collected, why, with whom it is shared, and how you can exercise your
          rights under the EU General Data Protection Regulation (GDPR) and the German Federal Data
          Protection Act (BDSG).
        </p>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Controller</h2>
          <p className="mt-2">
            The controller responsible for data processing on this site is the service provider
            named in the{" "}
            <Link href="/imprint" className="underline hover:text-[var(--muted-foreground)]">
              imprint
            </Link>
            . Contact for privacy matters:{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline hover:text-[var(--muted-foreground)]"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Hosting</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            The site runs in a Docker container on a server located in the European Union (Hetzner
            Online GmbH, Gunzenhausen / Falkenstein, Germany). The reverse proxy and the container
            runtime write technical access logs (IP address, request timestamp, requested URL, HTTP
            status, referrer, user agent) that are kept only for as long as is necessary to operate
            and secure the service, and are then overwritten by log rotation. The logs are not used
            for analytics or any other purpose. Legal basis: Art. 6(1)(f) GDPR — legitimate interest
            in operating a secure service.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Analytics — Plausible</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            The site uses a self-hosted instance of{" "}
            <a
              href="https://plausible.io/data-policy"
              rel="noreferrer"
              target="_blank"
              className="underline hover:text-[var(--foreground)]"
            >
              Plausible Analytics
            </a>{" "}
            running at <code>plausible.trebeljahr.com</code> (server in the EU, operated by the
            controller). Plausible is cookieless and does not store personal data: it does not set
            cookies, does not use cross-site or cross-device tracking, and does not collect IP
            addresses, device identifiers, or any data that could be used to identify a visitor.
            Aggregate page-view counts, referrer, country (from IP at request time, not stored), and
            browser/OS family are recorded.
          </p>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Legal basis: Art. 6(1)(f) GDPR — legitimate interest in understanding which pages are
            read, without using technologies that would require consent under § 25 TDDDG (the German
            implementation of the ePrivacy Directive). Because no information is stored on, or read
            from, your device, § 25 TDDDG does not apply.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Newsletter</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            The site offers a weekly email digest of five artworks from the collection. The mailing
            list is managed by Mailgun (operated by Sinch Email, Inc., United States), an
            email-delivery service. To subscribe you provide your email address; this is the only
            personal datum stored for the newsletter.
          </p>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Legal basis: Art. 6(1)(a) GDPR — your explicit consent given at subscription. Consent is
            recorded by Mailgun with the subscription timestamp and IP. You may withdraw consent at
            any time, with effect for the future, by using the unsubscribe link in every issue or by
            emailing{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline hover:text-[var(--foreground)]"
            >
              {CONTACT_EMAIL}
            </a>
            . After you unsubscribe, your address is removed from the active list; Mailgun may keep
            a suppression record (the hashed address marked as unsubscribed) to honour your opt-out
            on future sends.
          </p>
          <p className="mt-2 text-[var(--muted-foreground)]">
            The email content itself contains a tracking pixel and rewritten links, so that Mailgun
            reports per-issue open and click counts to the operator. These metrics are used solely
            to assess whether the newsletter is being received and read; no profiles are built and
            the data is not used for advertising or shared with third parties. If you do not wish to
            be measured this way, your email client's "block remote images" setting suppresses the
            open pixel, and the unsubscribe link works without click tracking.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Transfers to Third Countries</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Sinch Email, Inc. (Mailgun) is established in the United States. Sending the newsletter
            therefore involves a transfer of your email address (and the engagement metrics
            described above) to a third country within the meaning of Chapter V GDPR. The transfer
            is covered by the EU Standard Contractual Clauses (Art. 46(2)(c) GDPR) concluded with
            the processor. The U.S. legal environment may permit government access to personal data
            that would not occur under EU law; you have the rights set out below regardless of where
            the data is processed.
          </p>
          <p className="mt-2 text-[var(--muted-foreground)]">
            No other transfers to third countries take place. Plausible runs on EU infrastructure
            under the controller's own administration.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Storage Period</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted-foreground)]">
            <li>
              Server access logs: kept only as long as necessary to operate and secure the service,
              then overwritten by log rotation.
            </li>
            <li>Plausible event data: aggregate counters only; no per-visitor record exists.</li>
            <li>
              Newsletter address: retained until you unsubscribe. Mailgun suppression records may be
              kept indefinitely to prevent re-mailing after opt-out.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Your Rights</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Under the GDPR you have the right to:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted-foreground)]">
            <li>access the personal data held about you (Art. 15);</li>
            <li>have inaccurate data corrected (Art. 16);</li>
            <li>have your data deleted (Art. 17), subject to overriding legal obligations;</li>
            <li>restrict processing (Art. 18);</li>
            <li>receive your data in a portable format (Art. 20);</li>
            <li>
              object to processing carried out on the basis of legitimate interests (Art. 21), which
              includes the analytics described above;
            </li>
            <li>withdraw any consent you have given, with effect for the future (Art. 7(3)).</li>
          </ul>
          <p className="mt-2 text-[var(--muted-foreground)]">
            To exercise any of these rights, email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline hover:text-[var(--foreground)]"
            >
              {CONTACT_EMAIL}
            </a>
            . You also have the right to lodge a complaint with a supervisory authority (Art. 77
            GDPR). The competent authority for the controller is the Landesbeauftragte für den
            Datenschutz und die Informationsfreiheit Baden-Württemberg.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">No Automated Decision-Making</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            The site does not carry out automated decision-making or profiling within the meaning of
            Art. 22 GDPR.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Changes to This Policy</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            This policy may be updated to reflect changes in the site, the services it uses, or
            applicable law. The date at the top of the page indicates when it was last revised.
          </p>
        </div>
      </section>
    </div>
  );
}
