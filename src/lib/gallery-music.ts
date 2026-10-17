// Background music for the 3D museum, and the credits it owes.
//
// The pieces are the ones on Rico's Spotify playlist "Beautiful
// Stillness" whose composers died more than 70 years ago. The Spotify
// recordings themselves are recent and in copyright, so each piece here
// is a different recording that is free to publish from Germany, where
// the site is operated:
//
//   - a recording its performer released under a Creative Commons
//     licence or into the public domain (Musopen, Wikimedia Commons,
//     IMSLP, Free Music Archive), or
//   - a 78 rpm record published before 1963. Performers' and producers'
//     rights in a recording ran 50 years from publication until the EU
//     extended them to 70 in 2013 (Directive 2011/77/EU); the extension
//     did not revive rights that had already ended, so every record
//     published before 1963 is in the public domain in the EU. A
//     transfer or restoration of such a record is not a new recording
//     and carries no rights of its own (§85 UrhG protects the first
//     fixation). Several of these records are still protected in the
//     US, where pre-1972 recordings run 100 to 110 years from
//     publication (Music Modernization Act 2018); `usStatus` says which.
//
// Left out, because the composer is alive or died after 1955: Yann
// Tiersen (two tracks), Max Richter, Michael Giacchino, FKJ (three).
// The playlist has Liebestraum No. 3 twice (Lang Lang, Jenő Jandó); it
// plays once here.
//
// A 78 is free, but its surface noise is loud under quiet music. On
// 17 October 2026 Rico heard rain under four of them (Furtwängler's
// Air, Fournier's Swan, Aribo's Rêverie, Backhaus's Liebestraum), and
// each was replaced with a modern recording that is free. Measured as
// the band over 4 kHz in a piece's quietest tenth, under its loud
// passages: the 78s 30 to 40 dB, the recordings now used 53 to 80 dB.
// The pre-1963 LPs that turned up (Navarra's Swan of 1956, Menuhin's
// Air of 1961, Vidusso's Rêverie of 1951) were 30 to 49 dB.
//
// `pnpm music:build` downloads each source, checks its SHA-1 against
// the value below, and encodes it to `assets-web/music/v2/<id>.mp3`
// (loudness-normalised, cut to where the music starts and ends, and
// trimmed where `trim` says). `pnpm assets:sync` publishes that folder
// with the rest of assets-web. The files are served immutable, so a
// re-encode goes under a new version folder.

export type MusicLicence = {
  name: string;
  url: string | null;
};

export type MusicTrack = {
  /** File stem under `MUSIC_DIR`. Also the key of the shuffle bag a
   *  visitor's browser keeps, so renaming one restarts their cycle. */
  id: string;
  /** The piece, as a concert programme names it. */
  work: string;
  composer: string;
  composerDates: string;
  /** Who plays it, with the instrument where that is not obvious. */
  performer: string;
  /** When and where the recording was made or first published. */
  recorded: string;
  licence: MusicLicence;
  /** The page the file was taken from. */
  sourceUrl: string;
  /** Where the source page lives, for the credit line. */
  sourceName: string;
  /** Why the recording may be published, in one or two sentences. */
  rights: string;
  /** A 78 rpm record published before 1963, free by its age in the EU.
   *  Without it, the performer released the recording. */
  pre1963?: true;
  /** Public-domain status in the US, where it differs from the EU. */
  usStatus?: string;
  /** The file `music:build` downloads, and its SHA-1 as the source
   *  reports it. `browserOnly`: the host answers a script with a bot
   *  check (IMSLP), so the file is saved from a browser to
   *  `assets/music/<id>.<ext>` and the build checks its SHA-1. */
  download: { url: string; sha1: string; browserOnly?: true };
  /** A 78 transfer is mono; encode it as such. */
  mono?: boolean;
  /** Seconds to cut from the start and the end (count-in, applause,
   *  run-out groove). */
  trim?: { start?: number; end?: number };
};

const CC_BY_3 = { name: "CC BY 3.0", url: "https://creativecommons.org/licenses/by/3.0/" };
const CC_BY_4 = { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" };
const CC_BY_SA_3 = {
  name: "CC BY-SA 3.0",
  url: "https://creativecommons.org/licenses/by-sa/3.0/",
};
const CC_BY_SA_4 = {
  name: "CC BY-SA 4.0",
  url: "https://creativecommons.org/licenses/by-sa/4.0/",
};
const CC0 = { name: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" };
const PUBLIC_DOMAIN = { name: "Public domain", url: null };

/** In playlist order. The player shuffles; the credits list them so. */
export const GALLERY_MUSIC: readonly MusicTrack[] = [
  {
    id: "debussy-arabesque-1-prati",
    work: "Arabesque No. 1, L. 66",
    composer: "Claude Debussy",
    composerDates: "1862–1918",
    performer: "Patrizia Prati, piano",
    recorded: "Live at the Museo del Romanticismo, Madrid, 17 May 2016",
    licence: CC_BY_SA_4,
    sourceName: "Wikimedia Commons",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Claude_Debussy_-_Premi%C3%A8re_Arabesque_-_Patrizia_Prati.ogg",
    rights:
      "Patrizia Prati released the recording under CC BY-SA 4.0 (Wikimedia permission ticket 2015120610013684).",
    download: {
      url: "https://upload.wikimedia.org/wikipedia/commons/0/0f/Claude_Debussy_-_Premi%C3%A8re_Arabesque_-_Patrizia_Prati.ogg",
      sha1: "bfd837b4a0cee8bbb09afe851b10911bccbd78b9",
    },
  },
  {
    id: "debussy-reverie-kolodin",
    work: "Rêverie, L. 68",
    composer: "Claude Debussy",
    composerDates: "1862–1918",
    performer: "Luis Kolodin, piano",
    recorded: "Published by Luis Kolodin, 2020",
    licence: CC_BY_SA_4,
    sourceName: "IMSLP",
    sourceUrl: "https://imslp.org/wiki/R%C3%AAverie%2C_CD_76_(Debussy%2C_Claude)",
    rights:
      "Luis Kolodin released the recording under CC BY-SA 4.0 on IMSLP (upload of 9 August 2022).",
    download: {
      url: "https://imslp.org/images/c/c8/PMLP2404-Y2Mate.is_-_Luis_Kolodin_plays_Debussy%27s_R%C3%AAverie-DiC0EEvFE3g-160k-1660024770846.mp3",
      sha1: "a5e443ed42b5aeebbb34629844ff53c6803fc014",
      browserOnly: true,
    },
  },
  {
    id: "chopin-nocturne-op9-2-levy",
    work: "Nocturne in E-flat major, Op. 9 No. 2",
    composer: "Frédéric Chopin",
    composerDates: "1810–1849",
    performer: "Frank Lévy, piano",
    recorded: "c. 2014, for Musopen's “Set Chopin Free” project",
    licence: PUBLIC_DOMAIN,
    sourceName: "Wikimedia Commons",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Chopin_-_Nocturne_No._2_in_E-flat_major,_Op._9_No._2_(Frank_Levy).flac",
    rights: "Musopen released the recording into the public domain.",
    download: {
      url: "https://upload.wikimedia.org/wikipedia/commons/8/89/Chopin_-_Nocturne_No._2_in_E-flat_major%2C_Op._9_No._2_%28Frank_Levy%29.flac",
      sha1: "c10c1175bb0955df8083bc1d67c8897114e9baf0",
    },
  },
  {
    id: "beethoven-moonlight-1-pitman",
    work: "Piano Sonata No. 14 in C-sharp minor, Op. 27 No. 2 “Moonlight”: I. Adagio sostenuto",
    composer: "Ludwig van Beethoven",
    composerDates: "1770–1827",
    performer: "Paul Pitman, piano",
    recorded: "Recorded for Musopen",
    licence: PUBLIC_DOMAIN,
    sourceName: "Wikimedia Commons",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Ludwig_van_Beethoven_-_sonata_no._14_in_c_sharp_minor_%27moonlight%27,_op._27_no._2_-_i._adagio_sostenuto.ogg",
    rights: "Musopen released the recording into the public domain.",
    download: {
      url: "https://upload.wikimedia.org/wikipedia/commons/4/48/Ludwig_van_Beethoven_-_sonata_no._14_in_c_sharp_minor_%27moonlight%27%2C_op._27_no._2_-_i._adagio_sostenuto.ogg",
      sha1: "791626955cc76a002be71460186baff629855294",
    },
  },
  {
    id: "schubert-impromptu-d899-3-bertoglio",
    work: "Impromptu in G-flat major, D. 899 No. 3 (Op. 90 No. 3)",
    composer: "Franz Schubert",
    composerDates: "1797–1828",
    performer: "Chiara Bertoglio, piano",
    recorded: "20 December 2012",
    licence: CC_BY_3,
    sourceName: "Wikimedia Commons",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Schubert%27s_Impromptu_no._3_in_G-flat_major,_D.899_-_Chiara_Bertoglio.ogg",
    rights: "Chiara Bertoglio released the recording under CC BY 3.0 through Musopen.",
    download: {
      url: "https://upload.wikimedia.org/wikipedia/commons/3/31/Schubert%27s_Impromptu_no._3_in_G-flat_major%2C_D.899_-_Chiara_Bertoglio.ogg",
      sha1: "3bd21875a2c86b124e12a130cffef5f4e2e3d06f",
    },
  },
  {
    id: "liszt-consolation-3-kramer",
    work: "Consolation No. 3 in D-flat major, S. 172/3",
    composer: "Franz Liszt",
    composerDates: "1811–1886",
    performer: "Benedict Kramer, piano; recorded by Tobias Lohner",
    recorded: "May 2005",
    licence: CC_BY_SA_4,
    sourceName: "Wikimedia Commons",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Franz_Liszt_-_Consolation_No._3,_Lento_placido.ogg",
    rights:
      "Released under CC BY-SA 4.0 by its makers (Wikimedia permission ticket 2016032110014115).",
    download: {
      url: "https://upload.wikimedia.org/wikipedia/commons/f/f5/Franz_Liszt_-_Consolation_No._3%2C_Lento_placido.ogg",
      sha1: "8d924542b7e4c516b4317b0d1591478316353c1f",
    },
  },
  {
    id: "liszt-liebestraum-3-kolodin",
    work: "Liebestraum No. 3 in A-flat major, S. 541/3",
    composer: "Franz Liszt",
    composerDates: "1811–1886",
    performer: "Luis Kolodin, piano",
    recorded: "Published by Luis Kolodin, 2022",
    licence: CC_BY_SA_4,
    sourceName: "IMSLP",
    sourceUrl: "https://imslp.org/wiki/Liebestr%C3%A4ume%2C_S.541_(Liszt%2C_Franz)",
    rights:
      "Luis Kolodin released the recording under CC BY-SA 4.0 on IMSLP (upload of 1 August 2022).",
    download: {
      url: "https://imslp.org/images/6/67/PMLP2598-LISZT.mp3",
      sha1: "ca4b5564e4735c2f033de20aa7db6c9e9a5b4e95",
      browserOnly: true,
    },
  },
  {
    id: "bach-cello-suite-1-prelude-michel",
    work: "Cello Suite No. 1 in G major, BWV 1007: I. Prélude",
    composer: "Johann Sebastian Bach",
    composerDates: "1685–1750",
    performer: "John Michel, cello",
    recorded: "Published 2007",
    licence: CC_BY_SA_3,
    sourceName: "Wikimedia Commons",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:JOHN_MICHEL_CELLO-J_S_BACH_CELLO_SUITE_1_in_G_Prelude.ogg",
    rights:
      "John Michel released the recording under CC BY-SA 3.0 (Wikimedia permission ticket 2007090610014151).",
    download: {
      url: "https://upload.wikimedia.org/wikipedia/commons/4/43/JOHN_MICHEL_CELLO-J_S_BACH_CELLO_SUITE_1_in_G_Prelude.ogg",
      sha1: "3221142040c28dee4fab296603f1b272a8163d84",
    },
  },
  {
    id: "beethoven-pathetique-2-veesey",
    work: "Piano Sonata No. 8 in C minor, Op. 13 “Pathétique”: II. Adagio cantabile",
    composer: "Ludwig van Beethoven",
    composerDates: "1770–1827",
    performer: "Daniel Veesey, piano",
    recorded: "Published 23 April 2009",
    licence: CC0,
    sourceName: "Wikimedia Commons",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Daniel_Veesey_-_02_-_Sonata_8_Pathetique_-_II_Adagio_cantabile.ogg",
    rights: "Daniel Veesey released the recording under CC0 on the Free Music Archive.",
    download: {
      url: "https://upload.wikimedia.org/wikipedia/commons/0/07/Daniel_Veesey_-_02_-_Sonata_8_Pathetique_-_II_Adagio_cantabile.ogg",
      sha1: "a0b9157d01e3ea533e593eb6dc28940271d7df5e",
    },
  },
  {
    id: "satie-gymnopedie-1-baiocchi",
    work: "Gymnopédie No. 1",
    composer: "Erik Satie",
    composerDates: "1866–1925",
    performer: "Daria Baiocchi, piano",
    recorded: "July 2021, on a Steinway model B",
    licence: CC_BY_SA_4,
    sourceName: "Wikimedia Commons",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Satie_Gymnop%C3%A8die_n.1_DariaBaiocchi.wav",
    rights: "Daria Baiocchi released the recording under CC BY-SA 4.0.",
    download: {
      url: "https://upload.wikimedia.org/wikipedia/commons/a/aa/Satie_Gymnop%C3%A8die_n.1_DariaBaiocchi.wav",
      sha1: "f631c5433dd71e016c3d3756c8f186d3a9a45305",
    },
  },
  {
    id: "debussy-clair-de-lune-goedhart",
    work: "Suite bergamasque, L. 75: III. Clair de lune",
    composer: "Claude Debussy",
    composerDates: "1862–1918",
    performer: "Laurens Goedhart, piano",
    recorded: "20 August 2011",
    licence: CC_BY_3,
    sourceName: "Wikimedia Commons",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg",
    rights: "Laurens Goedhart published the recording on SoundCloud under CC BY 3.0.",
    download: {
      url: "https://upload.wikimedia.org/wikipedia/commons/b/be/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg",
      sha1: "50d152ad99294c8dd3783b6ddde30b1dfaef19c3",
    },
  },
  {
    id: "saint-saens-the-swan-colliard",
    work: "The Carnival of the Animals: XIII. The Swan",
    composer: "Camille Saint-Saëns",
    composerDates: "1835–1921",
    performer: "Matilda Colliard, cello; Stefano Ligoratti, piano",
    recorded: "Live; published by Classica Viva, Milan, 2015",
    licence: CC_BY_4,
    sourceName: "IMSLP",
    sourceUrl: "https://imslp.org/wiki/Le_carnaval_des_animaux_(Saint-Sa%C3%ABns%2C_Camille)",
    rights:
      "The performers released the recording under CC BY 4.0 on IMSLP (upload of 14 July 2015).",
    download: {
      url: "https://imslp.org/images/2/2c/PMLP06099-Le_Cygne.mp3",
      sha1: "afef94fe92f7232d069014466d011d1201b90928",
      browserOnly: true,
    },
    // The room after the last note, faded out by the uploader.
    trim: { end: 4 },
  },
  {
    id: "bach-air-bwv1068-usaf-strings",
    work: "Orchestral Suite No. 3 in D major, BWV 1068: II. Air",
    composer: "Johann Sebastian Bach",
    composerDates: "1685–1750",
    performer: "Air Force Strings, United States Air Force Band",
    recorded: "Collage, 2000",
    licence: PUBLIC_DOMAIN,
    sourceName: "Wikimedia Commons",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Air_-_Air_Force_Strings_-_United_States_Air_Force_Band.mp3",
    rights:
      "Recorded and published by the United States Air Force, which gives its band's recordings to the public domain.",
    download: {
      url: "https://upload.wikimedia.org/wikipedia/commons/e/ec/Air_-_Air_Force_Strings_-_United_States_Air_Force_Band.mp3",
      sha1: "7e02e9bec693f03b9682b236d9430f0f5956bc50",
    },
  },
];

/** Where the encoded files live in assets-web and on the asset origin.
 *  Bump the version for a re-encode: the files are cached immutable. */
export const MUSIC_DIR = "music/v2";

export function musicObjectKey(track: Pick<MusicTrack, "id">): string {
  return `${MUSIC_DIR}/${track.id}.mp3`;
}

/** One line of credit, as CC BY asks for it: work, performer, source,
 *  licence. The credits page links both and says the files were
 *  re-encoded. */
export function musicCreditLine(track: MusicTrack): string {
  return `${track.composer}, ${track.work}. ${track.performer}. ${track.sourceName}, ${track.licence.name}.`;
}
