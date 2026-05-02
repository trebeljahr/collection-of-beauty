import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Impressum",
  description: "Angaben gemäß § 5 TMG für Collection of Beauty.",
  alternates: { canonical: "/impressum" },
  robots: { index: true, follow: true },
};

export default function ImpressumPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl">Impressum</h1>
      </header>

      <section className="space-y-6 text-[var(--foreground)]">
        <div>
          <h2 className="font-serif text-xl md:text-2xl">Angaben gemäß § 5 TMG</h2>
          <p className="mt-2">
            Rico Trebeljahr
            <br />
            {/* TODO: fill in real address */}
            <span className="text-[var(--muted-foreground)]">[Straße und Hausnummer]</span>
            <br />
            <span className="text-[var(--muted-foreground)]">[PLZ Ort]</span>
            <br />
            <span className="text-[var(--muted-foreground)]">Deutschland</span>
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Kontakt</h2>
          <p className="mt-2">
            E-Mail:{" "}
            <a
              href="mailto:ricotrebeljahr@gmail.com"
              className="underline hover:text-[var(--muted-foreground)]"
            >
              ricotrebeljahr@gmail.com
            </a>
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">
            Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV
          </h2>
          <p className="mt-2">
            Rico Trebeljahr
            <br />
            {/* TODO: fill in real address */}
            <span className="text-[var(--muted-foreground)]">[Anschrift wie oben]</span>
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Haftungsausschluss</h2>

          <h3 className="mt-3 font-serif text-lg">Haftung für Inhalte</h3>
          <p className="mt-1 text-[var(--muted-foreground)]">
            Die Inhalte dieser Seiten wurden mit größtmöglicher Sorgfalt erstellt. Für die
            Richtigkeit, Vollständigkeit und Aktualität der Inhalte kann jedoch keine Gewähr
            übernommen werden. Als Diensteanbieter bin ich gemäß § 7 Abs. 1 TMG für eigene Inhalte
            auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG bin
            ich als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
            Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige
            Tätigkeit hinweisen.
          </p>

          <h3 className="mt-4 font-serif text-lg">Haftung für Links</h3>
          <p className="mt-1 text-[var(--muted-foreground)]">
            Diese Seite enthält Links zu externen Websites Dritter, auf deren Inhalte ich keinen
            Einfluss habe. Deshalb kann ich für diese fremden Inhalte auch keine Gewähr übernehmen.
            Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber
            der Seiten verantwortlich. Eine permanente inhaltliche Kontrolle der verlinkten Seiten
            ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden
            von Rechtsverletzungen werde ich derartige Links umgehend entfernen.
          </p>

          <h3 className="mt-4 font-serif text-lg">Urheberrecht</h3>
          <p className="mt-1 text-[var(--muted-foreground)]">
            Die auf dieser Website gezeigten Werke befinden sich nach bestem Wissen in der Public
            Domain oder unter offenen Lizenzen, mit Metadaten von Wikimedia Commons. Sollten Sie
            dennoch eine Urheberrechtsverletzung bemerken, bitte ich um einen entsprechenden
            Hinweis. Bei Bekanntwerden werde ich derartige Inhalte umgehend entfernen.
          </p>
        </div>
      </section>
    </div>
  );
}
