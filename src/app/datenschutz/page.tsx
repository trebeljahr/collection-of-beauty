import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
  description:
    "Wie Collection of Beauty mit personenbezogenen Daten umgeht: Analyse, Newsletter, Auftragsverarbeiter und Ihre Rechte nach der DSGVO.",
  alternates: { canonical: "/datenschutz" },
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = "imprint+collection-of-beauty@trebeljahr.com";

export default function DatenschutzPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl">Datenschutzerklärung</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Stand: 17.05.2026 ·{" "}
          <Link href="/privacy" className="underline hover:text-[var(--foreground)]">
            English version
          </Link>
        </p>
      </header>

      <section className="space-y-6 text-[var(--foreground)]">
        <p>
          Diese Website (<em>Collection of Beauty</em>) verarbeitet nur sehr wenige personenbezogene
          Daten. Diese Seite erläutert, welche Daten erhoben werden, zu welchem Zweck, an wen sie
          weitergegeben werden und wie Sie Ihre Rechte nach der EU-Datenschutz-Grundverordnung
          (DSGVO) und dem Bundesdatenschutzgesetz (BDSG) ausüben können.
        </p>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Verantwortlicher</h2>
          <p className="mt-2">
            Verantwortlicher für die Datenverarbeitung auf dieser Website ist der im{" "}
            <Link href="/imprint" className="underline hover:text-[var(--muted-foreground)]">
              Impressum
            </Link>{" "}
            genannte Diensteanbieter. Kontakt in Datenschutzangelegenheiten:{" "}
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
            Die Website läuft in einem Docker-Container auf einem Server in der Europäischen Union
            (Hetzner Online GmbH, Gunzenhausen / Falkenstein, Deutschland). Der Reverse Proxy und
            die Container-Laufzeitumgebung schreiben technische Zugriffsprotokolle (IP-Adresse,
            Zeitstempel, aufgerufene URL, HTTP-Status, Referrer, User-Agent), die nur so lange
            aufbewahrt werden, wie es zum Betrieb und zur Sicherheit des Dienstes erforderlich ist,
            und anschließend durch Log-Rotation überschrieben werden. Die Protokolle werden nicht zu
            Analyse- oder anderen Zwecken verwendet. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO —
            berechtigtes Interesse am sicheren Betrieb des Dienstes.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Reichweitenmessung — Plausible</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Die Website nutzt eine selbst betriebene Instanz von{" "}
            <a
              href="https://plausible.io/data-policy"
              rel="noreferrer"
              target="_blank"
              className="underline hover:text-[var(--foreground)]"
            >
              Plausible Analytics
            </a>{" "}
            unter <code>plausible.trebeljahr.com</code> (Server in der EU, betrieben vom
            Verantwortlichen). Plausible arbeitet cookiefrei und speichert keine personenbezogenen
            Daten: Es werden keine Cookies gesetzt, kein Cross-Site- oder Cross-Device-Tracking
            durchgeführt und keine IP-Adressen, Geräte-Kennungen oder sonstige zur Identifizierung
            geeignete Daten gespeichert. Erfasst werden lediglich aggregierte Seitenaufrufe,
            Referrer, Land (anhand der IP zum Zeitpunkt des Aufrufs, ohne Speicherung) und
            Browser-/OS-Familie.
          </p>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse an einer
            Auswertung, welche Seiten gelesen werden, ohne Techniken einzusetzen, die nach § 25
            TDDDG (deutsche Umsetzung der ePrivacy-Richtlinie) einer Einwilligung bedürften. Da
            keine Informationen in Ihrem Endgerät gespeichert oder aus diesem ausgelesen werden,
            greift § 25 TDDDG nicht.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Newsletter</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Die Website bietet einen wöchentlichen E-Mail-Newsletter mit fünf Werken aus der
            Sammlung an. Die Verteilerliste wird in einer vom Verantwortlichen selbst betriebenen
            Instanz der quelloffenen Software{" "}
            <a
              href="https://listmonk.app/"
              className="underline hover:text-[var(--foreground)]"
              rel="noopener noreferrer"
              target="_blank"
            >
              ListMonk
            </a>{" "}
            geführt, die auf einem Server in der Europäischen Union läuft. Der eigentliche Versand
            an Ihr Postfach erfolgt über Amazon Web Services Simple Email Service in der Region
            eu-west-1 (Irland). Zur Anmeldung geben Sie Ihre E-Mail-Adresse an; dies ist die einzige
            personenbezogene Information, die für den Newsletter gespeichert wird.
          </p>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO — Ihre ausdrückliche Einwilligung bei der
            Anmeldung. Die Einwilligung wird im Double-Opt-In-Verfahren eingeholt: Sie geben Ihre
            Adresse ein, erhalten eine Bestätigungs-E-Mail und erst nach Klick auf den darin
            enthaltenen Link wird Ihre Adresse als bestätigtes Listenmitglied markiert. Der
            Anmeldezeitpunkt wird in ListMonk protokolliert; Ihre IP-Adresse wird ausschließlich vom
            Rate Limiter für das konfigurierte Zeitfenster (derzeit 60 Sekunden) verarbeitet und
            anschließend verworfen. Sie können Ihre Einwilligung jederzeit mit Wirkung für die
            Zukunft widerrufen, indem Sie den Abmeldelink in jeder Ausgabe nutzen oder eine E-Mail
            an{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline hover:text-[var(--foreground)]"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            schreiben. Nach der Abmeldung wird Ihre Adresse in ListMonk in den Status „abgemeldet"
            überführt, sodass keine weiteren Ausgaben mehr zugestellt werden.
          </p>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Die E-Mail selbst enthält einen Zählpixel und umgeschriebene Links, sodass ListMonk
            Öffnungs- und Klickzahlen pro Ausgabe meldet. Diese Kennzahlen dienen ausschließlich der
            Feststellung, ob der Newsletter ankommt und gelesen wird; es werden keine Profile
            gebildet und die Daten werden nicht an Dritte weitergegeben. Wenn Sie diese Messung
            nicht wünschen, unterdrücken Sie den Zählpixel über die Einstellung „Externe Bilder
            blockieren" in Ihrem E-Mail-Programm; der Abmeldelink funktioniert auch ohne
            Klick-Tracking.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Übermittlung in Drittländer</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            ListMonk wird vom Verantwortlichen auf EU-Infrastruktur betrieben; eine Drittlands­
            übermittlung findet hierfür nicht statt. Die Zustellung der E-Mails erfolgt über Amazon
            Web Services EMEA SARL mit Sitz in Luxemburg in der Region eu-west-1 (Irland). Die
            Konzernmutter ist in den Vereinigten Staaten ansässig; ein Zugriff durch US-Behörden
            nach dortigem Recht kann daher nicht vollständig ausgeschlossen werden. Mit AWS EMEA
            sind die EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO) abgeschlossen; AWS
            ergänzt diese durch technische Maßnahmen wie Transport- und Ruheverschlüsselung. Die
            unten genannten Rechte stehen Ihnen unabhängig vom Verarbeitungsort zu.
          </p>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Weitere Übermittlungen in Drittländer finden nicht statt. Plausible läuft auf
            EU-Infrastruktur unter eigener Verwaltung des Verantwortlichen.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Speicherdauer</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted-foreground)]">
            <li>
              Server-Zugriffsprotokolle: nur so lange wie zum Betrieb und zur Sicherheit
              erforderlich, anschließend durch Log-Rotation überschrieben.
            </li>
            <li>
              Plausible-Ereignisdaten: ausschließlich aggregierte Zähler; es existiert kein
              personenbezogener Datensatz.
            </li>
            <li>
              Newsletter-Adresse: bis zur Abmeldung. Abgemeldete Einträge bleiben in ListMonk als
              Sperrvermerk erhalten, damit nach einem Widerruf keine erneute Zustellung erfolgt;
              eine vollständige Löschung kann jederzeit unter der oben genannten Adresse verlangt
              werden.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Ihre Rechte</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">Nach der DSGVO haben Sie das Recht:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted-foreground)]">
            <li>Auskunft über die zu Ihrer Person gespeicherten Daten zu verlangen (Art. 15);</li>
            <li>unrichtige Daten berichtigen zu lassen (Art. 16);</li>
            <li>
              die Löschung Ihrer Daten zu verlangen (Art. 17), soweit keine gesetzlichen
              Aufbewahrungspflichten entgegenstehen;
            </li>
            <li>die Verarbeitung einschränken zu lassen (Art. 18);</li>
            <li>Ihre Daten in einem übertragbaren Format zu erhalten (Art. 20);</li>
            <li>
              der Verarbeitung auf Grundlage berechtigter Interessen zu widersprechen (Art. 21), was
              die oben beschriebene Reichweitenmessung einschließt;
            </li>
            <li>
              eine erteilte Einwilligung mit Wirkung für die Zukunft zu widerrufen (Art. 7 Abs. 3).
            </li>
          </ul>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Zur Ausübung dieser Rechte genügt eine E-Mail an{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline hover:text-[var(--foreground)]"
            >
              {CONTACT_EMAIL}
            </a>
            . Daneben steht Ihnen das Beschwerderecht bei einer Aufsichtsbehörde zu (Art. 77 DSGVO).
            Zuständige Aufsichtsbehörde für den Verantwortlichen ist die Landesbeauftragte für den
            Datenschutz und die Informationsfreiheit Baden-Württemberg.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Keine automatisierte Entscheidung</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Eine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22
            DSGVO findet nicht statt.
          </p>
        </div>

        <div>
          <h2 className="font-serif text-xl md:text-2xl">Änderungen dieser Erklärung</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Diese Datenschutzerklärung kann angepasst werden, um Änderungen der Website, der
            eingesetzten Dienste oder der Rechtslage abzubilden. Das Datum am Seitenanfang gibt den
            Stand der letzten Aktualisierung an.
          </p>
        </div>
      </section>
    </div>
  );
}
