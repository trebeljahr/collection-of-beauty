import type { EraId } from "@/lib/gallery-eras";

/**
 * Hand-picked cover works for the /artists and /eras cards.
 *
 * Without a pick, an artist's cover is the first work build-data reads and
 * an era's is the first work of its shuffle, both cropped at dead centre.
 * That chopped heads off portraits and blooms off botanical plates, and the
 * work it landed on was rarely one that says much about the artist.
 *
 * Each pick names a work by id and, where the centre crop loses the subject,
 * a CSS `object-position` for the `object-fit: cover` crop. Artist cards are
 * square and era cards 4:3, so a position only moves the crop along the
 * axis that overflows: "50% 20%" slides a tall work's square up, "30% 50%"
 * slides a wide work's square left. Positions were chosen by eye against
 * those two aspect ratios; if a card's aspect changes, re-check them.
 *
 * `fit: "contain"` shows the whole work on the card's mat instead. It is for
 * the few artists whose only works cannot be cropped without losing the
 * subject.
 *
 * `src/lib/cover-picks.test.ts` fails when a picked work leaves the
 * catalogue or stops belonging to its artist or era. Artists without a pick
 * keep the build-data default.
 */
export type CoverPick = {
  id: string;
  position?: string;
  fit?: "contain";
};

export const ERA_COVERS: Record<EraId, CoverPick> = {
  // Botticelli, The Birth of Venus
  gothic: {
    id: "collection-of-beauty-sandro-botticelli-la-nascita-di-venere-google-art-project-edited",
  },
  // Bruegel, Hunters in the Snow; keeps the hunters
  renaissance: {
    id: "collection-of-beauty-2560px-pieter-bruegel-the-elder-hunters-in-the-snow-winter-google-art-project",
    position: "30% 50%",
  },
  // Rembrandt, The Night Watch
  baroque: { id: "collection-of-beauty-la-ronda-de-noche-por-rembrandt-van-rijn" },
  // David, Oath of the Horatii
  enlightenment: {
    id: "collection-of-beauty-le-serment-des-horaces-jacques-louis-david-musee-du-louvre-peintures-inv-3692-mr-1432",
  },
  // Turner, The Fighting Temeraire
  romantic: { id: "collection-of-beauty-the-fighting-temeraire-jmw-turner-national-gallery" },
  // Audubon, Wild Turkey; keeps the hen's head
  "natural-history": { id: "audubon-birds-6-wild-turkey", position: "70% 50%" },
  // Millet, The Gleaners
  realism: { id: "collection-of-beauty-jean-francois-millet-gleaners-google-art-project-2" },
  // Hokusai, The Great Wave off Kanagawa
  "ukiyo-e": { id: "collection-of-beauty-tsunami-by-hokusai-19th-century", position: "20% 50%" },
  // Monet, Impression, Sunrise
  "fin-de-siecle": { id: "collection-of-beauty-monet-impression-sunrise" },
  // Van Gogh, Starry Night Over the Rhône
  "post-impressionism": { id: "collection-of-beauty-starry-night-over-the-rhone" },
  // Delaunay, Eiffel Tower
  modernism: {
    id: "collection-of-beauty-robert-delaunay-eiffel-tower-hirschhorn-ii",
    position: "50% 60%",
  },
};

export const ARTIST_COVERS: Record<string, CoverPick> = {
  // Rosa Centifolia
  "pierre-joseph-redoute": { id: "redoute-roses-rosa-centifolia", position: "50% 0%" },
  // American Flamingo (Plate 431)
  "john-james-audubon": { id: "audubon-birds-431-american-flamingo", position: "50% 40%" },
  // The Water-Lily Pond
  "claude-monet": { id: "collection-of-beauty-the-water-lily-pond-google-arts-culture" },
  // The Rape of the Daughters of Leucippus
  "peter-paul-rubens": { id: "collection-of-beauty-07leucip", position: "50% 20%" },
  // The Fighting Temeraire tugged to her last berth to be broken up
  "j-m-w-turner": {
    id: "collection-of-beauty-the-fighting-temeraire-jmw-turner-national-gallery",
    position: "15% 50%",
  },
  // The Zōjō-ji Temple at Shiba (Shiba Zōjōji), from Twenty Views of Tokyo
  "kawase-hasui": {
    id: "collection-of-beauty-het-zojo-heiligdom-in-shiba-shiba-zojoji-titel-op-object-twintig-gezichten-op-tokyo-serietitel-toky",
    position: "50% 72%",
  },
  // Discomedusae (Kunstformen der Natur)
  "ernst-haeckel": { id: "kunstformen-images-haeckel-discomedusae-8", position: "50% 0%" },
  // Still Life: Vase with Twelve Sunflowers
  "vincent-van-gogh": { id: "collection-of-beauty-vincent-willem-van-gogh-128" },
  // Self-portrait
  "rembrandt-van-rijn": {
    id: "collection-of-beauty-rembrandt-van-rijn-self-portrait-google-art-project",
    position: "50% 15%",
  },
  // Sudden Shower over Shin-Ōhashi Bridge and Atake, from One Hundred Famous Views of Edo
  "utagawa-hiroshige": {
    id: "collection-of-beauty-hiroshige-atake-sous-une-averse-soudaine",
    position: "50% 65%",
  },
  // Black Bashi-Bazouk
  "jean-leon-gerome": {
    id: "collection-of-beauty-1280px-gerome-black-bashi-bazouk-c-1869",
    position: "50% 2%",
  },
  // The Great Wave off Kanagawa
  "katsushika-hokusai": {
    id: "collection-of-beauty-tsunami-by-hokusai-19th-century",
    position: "5% 50%",
  },
  // The Ninth Wave
  "ivan-aivazovsky": {
    id: "collection-of-beauty-hovhannes-aivazovsky-the-ninth-wave-google-art-project",
    position: "25% 50%",
  },
  // On the Terrasse
  "pierre-auguste-renoir": {
    id: "collection-of-beauty-two-sisters-on-the-terrace",
    position: "50% 45%",
  },
  // Benjamin Franklin Drawing Electricity from the Sky
  "benjamin-west": {
    id: "collection-of-beauty-benjamin-west-english-born-america-benjamin-franklin-drawing-electricity-from-the-sky-google-art-pr",
    position: "50% 10%",
  },
  // Tänzerinnen in Blau
  "edgar-degas": { id: "collection-of-beauty-edgar-germain-hilaire-degas-076" },
  // Nafea Faa Ipoipo (When Will You Marry?)
  "paul-gauguin": {
    id: "collection-of-beauty-paul-gauguin-nafea-faa-ipoipo-1892-oil-on-canvas-101-x-77-cm",
    position: "50% 10%",
  },
  // Portrait of Paul Revere
  "john-singleton-copley": {
    id: "collection-of-beauty-j-s-copley-paul-revere-cropped",
    position: "50% 25%",
  },
  // Mr. and Mrs. Andrews
  "thomas-gainsborough": {
    id: "collection-of-beauty-thomas-gainsborough-mr-and-mrs-andrews",
    position: "12% 50%",
  },
  // The Card Players
  "paul-cezanne": {
    id: "collection-of-beauty-paul-cezanne-1892-95-les-joueurs-de-carte-the-card-players-60-x-73-cm-oil-on-canvas-courtauld-insti",
  },
  // Apotheosis of War
  "vasily-vereshchagin": {
    id: "collection-of-beauty-1871-vereshchagin-apotheose-des-krieges-anagoria",
    position: "62% 50%",
  },
  // Portrait of George Washington
  "gilbert-stuart": { id: "collection-of-beauty-george-washington-1795", position: "50% 10%" },
  // Napoleon Crossing the Alps
  "jacques-louis-david": {
    id: "collection-of-beauty-david-napoleon-crossing-the-alps-malmaison2",
    position: "50% 3%",
  },
  // Breezing Up
  "winslow-homer": {
    id: "collection-of-beauty-winslow-homer-breezing-up-a-fair-wind-google-art-project",
    position: "10% 50%",
  },
  // Elisabeth Louise Vigée-Lebrun
  "elisabeth-louise-vigee-le-brun": {
    id: "collection-of-beauty-self-portrait-with-her-daughter-by-elisabeth-louise-vigee-le-brun",
    position: "50% 20%",
  },
  // Young Hare
  "albrecht-durer": { id: "collection-of-beauty-albrecht-durer-hare-1502-google-art-project" },
  // Carnation
  "john-singer-sargent": {
    id: "collection-of-beauty-john-singer-sargent-carnation-lily-lily-rose-google-art-project",
    position: "50% 30%",
  },
  // Self portrait of Louis-Leopold Boilly
  "louis-leopold-boilly": {
    id: "collection-of-beauty-versailles-boilly-autoportrait",
    position: "50% 25%",
  },
  // The Adoration of the Shepherds
  "gerard-van-honthorst": {
    id: "collection-of-beauty-gerard-van-honthorst-adoration-of-the-shepherds-wga11657",
    position: "60% 50%",
  },
  // Portrait of Henry VIII
  "hans-holbein-the-younger": {
    id: "collection-of-beauty-henry-viii-of-england-by-hans-holbein",
    position: "50% 10%",
  },
  // Ivan the Terrible and His Son Ivan on November 16th
  "ilya-repin": {
    id: "collection-of-beauty-ivan-el-terrible-y-su-hijo-por-ilia-repin",
    position: "45% 50%",
  },
  // Salisbury Cathedral from the Bishop's Grounds
  "john-constable": {
    id: "collection-of-beauty-john-constable-salisbury-cathedral-from-the-bishop-s-grounds",
    position: "60% 50%",
  },
  // A Merchant's Wife's Teatime
  "boris-kustodiev": { id: "collection-of-beauty-kustodiev-merchants-wife" },
  // Liberty Leading the People
  "eugene-delacroix": {
    id: "collection-of-beauty-la-liberte-guidant-le-peuple-eugene-delacroix-musee-du-louvre-peintures-rf-129-apres-restauration-2",
  },
  // Portrait of the Artist's Mother
  "james-mcneill-whistler": {
    id: "collection-of-beauty-whistlers-mother-high-res",
    position: "100% 50%",
  },
  // Summer Scene
  "frederic-bazille": {
    id: "collection-of-beauty-bazille-frederic-summer-scene-1869-oil-on-canvas-fogg-art-museum-cambridge-massachusetts",
  },
  // Kumoi-Zakura (Kumoi Cherry Trees)
  "hiroshi-yoshida": {
    id: "collection-of-beauty-hiroshi-yoshida-kumoi-zakura-kumoi-cherry-trees-google-art-project",
    position: "100% 50%",
  },
  // The Happy Accidents of the Swing
  "jean-honore-fragonard": { id: "collection-of-beauty-fragonard-swing", position: "50% 60%" },
  // View of Toledo
  "el-greco": { id: "collection-of-beauty-el-greco-view-of-toledo" },
  // Portrait of Madame de Pompadour
  "francois-boucher": {
    id: "collection-of-beauty-boucher-marquise-de-pompadour-1756",
    position: "50% 5%",
  },
  // Judith Beheading Holofernes
  "artemisia-gentileschi": {
    id: "collection-of-beauty-judit-decapitando-a-holofernes-por-artemisia-gentileschi",
    position: "50% 55%",
  },
  // Dinner
  "leon-bakst": { id: "collection-of-beauty-bakst-uhzin1902", position: "50% 0%" },
  // Flaming June
  "frederic-leighton": {
    id: "collection-of-beauty-flaming-june-by-frederic-lord-leighton-1830-1896",
  },
  // Golden autumn. Slobodka
  "isaac-levitan": { id: "collection-of-beauty-levitan-zolotaya-osen", position: "55% 50%" },
  // Champs de Mars: The Red Tower
  "robert-delaunay": { id: "collection-of-beauty-delaunay-champdemars", position: "50% 35%" },
  // A Bar at the Folies-Bergère
  "edouard-manet": {
    id: "collection-of-beauty-un-bar-aux-folies-bergere-by-edouard-manet-1882",
    position: "35% 50%",
  },
  // Judith with the head of Holofernes
  "lucas-cranach-the-elder": {
    id: "collection-of-beauty-lucas-cranach-d-a-judith-victorious-wga05720",
    position: "50% 15%",
  },
  // The Birth of Venus
  "sandro-botticelli": {
    id: "collection-of-beauty-sandro-botticelli-la-nascita-di-venere-google-art-project-edited",
  },
  // Girl with peaches
  "valentin-serov": { id: "collection-of-beauty-serov-devochka-s-persikami", position: "50% 80%" },
  // Ivan Zarevitch on the grey Wolf
  "viktor-vasnetsov": {
    id: "collection-of-beauty-wiktor-michajlowitsch-wassnezow-004",
    position: "50% 60%",
  },
  // L'Homme en hamac
  "albert-gleizes": {
    id: "collection-of-beauty-albert-gleizes-1913-l-homme-au-hamac-oil-on-canvas-130-x-155-5-cm-albright-knox-art-gallery-buffalo",
    position: "20% 50%",
  },
  // Street
  "ernst-ludwig-kirchner": {
    id: "collection-of-beauty-kirchner-1913-street-berlin",
    position: "50% 5%",
  },
  // The Kiss
  "francesco-hayez": {
    id: "collection-of-beauty-el-beso-pinacoteca-de-brera-milan-1859",
    position: "50% 45%",
  },
  // Portrait of Comtesse d'Haussonville
  "jean-auguste-dominique-ingres": {
    id: "collection-of-beauty-jean-auguste-dominique-ingres-comtesse-d-haussonville-google-art-project",
    position: "50% 15%",
  },
  // Portrait of Dora Wheeler
  "william-merritt-chase": {
    id: "collection-of-beauty-chase-william-merritt-portrait-of-miss-dora-wheeler-1883",
  },
  // Medusa
  caravaggio: { id: "collection-of-beauty-caravaggio-medusa-google-art-project" },
  // Anger, from the Méthode pour apprendre à dessiner les passions
  "charles-le-brun": { id: "collection-of-beauty-charles-le-brun-la-colere" },
  // Inness George Early Morning Tarpon Springs
  "george-inness": {
    id: "collection-of-beauty-inness-george-early-morning-tarpon-springs",
    position: "50% 20%",
  },
  // Destruction of Leviathan
  "gustave-dore": { id: "collection-of-beauty-destruction-of-leviathan", position: "50% 90%" },
  // The Gleaners
  "jean-francois-millet": {
    id: "collection-of-beauty-jean-francois-millet-gleaners-google-art-project-2",
    position: "55% 50%",
  },
  // The Temptation of Saint Anthony
  "martin-schongauer": { id: "collection-of-beauty-schongauer-anthony", position: "50% 55%" },
  // Portrait of Baldassare Castiglione
  raphael: {
    id: "collection-of-beauty-baldassare-castiglione-by-raffaello-sanzio-from-c2rmf-retouched",
    position: "50% 25%",
  },
  // Überschwemmung in Port Marly
  "alfred-sisley": { id: "collection-of-beauty-alfred-sisley-062", position: "25% 50%" },
  // The poor poet
  "carl-spitzweg": {
    id: "collection-of-beauty-carl-spitzweg-der-arme-poet-neue-pinakothek",
    position: "60% 50%",
  },
  // Vertumnus
  "giuseppe-arcimboldo": {
    id: "collection-of-beauty-vertumnus-arstidernas-gud-malad-av-giuseppe-arcimboldo-1591-skoklosters-slott-91503",
    position: "50% 45%",
  },
  // Le Désespéré (The Desperate Man)
  "gustave-courbet": {
    id: "collection-of-beauty-gustave-courbet-le-desespere-1843",
    position: "45% 50%",
  },
  // View from Mount Holyoke
  "thomas-cole": {
    id: "collection-of-beauty-cole-thomas-the-oxbow-the-connecticut-river-near-northampton-1836",
    position: "100% 50%",
  },
  // Equestrian Portrait of Charles V
  titian: {
    id: "collection-of-beauty-carlos-v-en-muhlberg-by-titian-from-prado-in-google-earth",
    position: "50% 30%",
  },
  // Dance
  "alphonse-mucha": { id: "collection-of-beauty-alfons-mucha-1898-dance", position: "50% 12%" },
  // God Speed
  "edmund-blair-leighton": { id: "collection-of-beauty-leighton-god-speed", position: "50% 35%" },
  // Parochialstrasse in Berlin
  "eduard-gaertner": {
    id: "collection-of-beauty-eduard-gaertner-die-parochialstra-e-google-art-project",
    position: "50% 40%",
  },
  // The Flirtation
  "eugene-de-blaas": {
    id: "collection-of-beauty-eugen-de-blaas-the-flirtation",
    position: "45% 50%",
  },
  // Paris Street in Rainy Weather
  "gustave-caillebotte": {
    id: "collection-of-beauty-gustave-caillebotte-paris-street-rainy-day-google-art-project",
    position: "72% 50%",
  },
  // Perseus Releases Andromeda
  "joachim-wtewael": {
    id: "collection-of-beauty-persus-and-andromeda-by-joachim-wtewael",
    position: "50% 5%",
  },
  // The Black Brunswicker
  "john-everett-millais": {
    id: "collection-of-beauty-john-everett-millais-the-black-brunswicker",
    position: "50% 30%",
  },
  // The moon through a crumbling window
  "tsukioka-yoshitoshi": {
    id: "collection-of-beauty-bodhidharmayoshitoshi1887",
    position: "50% 12%",
  },
  // Hope
  "george-frederic-watts": {
    id: "collection-of-beauty-assistants-and-george-frederic-watts-hope-google-art-project",
    position: "50% 35%",
  },
  // Girl with a Pearl Earring
  "johannes-vermeer": {
    id: "collection-of-beauty-1665-girl-with-a-pearl-earring",
    position: "50% 15%",
  },
  // Danwon-Ssireum
  "kim-hong-do": { id: "collection-of-beauty-danwon-ssireum", position: "50% 40%" },
  // Charles I
  "anthony-van-dyck": {
    id: "collection-of-beauty-sir-anthony-van-dyck-charles-i-1600-49-google-art-project",
    position: "55% 50%",
  },
  // The scream of nature
  "edvard-munch": {
    id: "collection-of-beauty-edvard-munch-1893-the-scream-oil-tempera-and-pastel-on-cardboard-91-x-73-cm-national-gallery-of-nor",
    position: "50% 60%",
  },
  // Udnie
  "francis-picabia": {
    id: "collection-of-beauty-francis-picabia-1913-udnie-young-american-girl-the-dance-oil-on-canvas-290-x-300-cm-musee-national-",
  },
  // The Fall of Man
  "hendrick-goltzius": {
    id: "collection-of-beauty-the-fall-of-man-1616-hendrik-goltzius",
    position: "5% 50%",
  },
  // Horsewoman
  "karl-bryullov": { id: "collection-of-beauty-1832-brullov-vsadnica1", position: "50% 45%" },
  // Takiyasha the Witch and the Skeleton Spectre
  "utagawa-kuniyoshi": {
    id: "collection-of-beauty-takiyasha-the-witch-and-the-skeleton-spectre",
    position: "60% 50%",
  },
  // El Tres de Mayo
  "francisco-goya": {
    id: "collection-of-beauty-el-tres-de-mayo-by-francisco-de-goya-from-prado-thin-black-margin",
    position: "25% 50%",
  },
  // A Sunday on La Grande Jatte
  "georges-seurat": {
    id: "collection-of-beauty-a-sunday-on-la-grande-jatte-georges-seurat-1884",
    position: "85% 50%",
  },
  // Madonna and Child with Saints John the Baptist and Elizabeth
  "giovanni-bellini": {
    id: "collection-of-beauty-bellini-madonna-mit-kind-johannes-dem-taufer-und-der-heiligen-elisabeth",
  },
  // Portrait of Cornelia Vetterlein
  "joseph-karl-stieler": { id: "collection-of-beauty-cornelia-vetterlein", position: "50% 5%" },
  // Stage Set for The Magic Flute: The Hall of Stars (Queen of the Night)
  "karl-friedrich-schinkel": {
    id: "collection-of-beauty-karl-friedrich-schinkel-die-sternenhalle-der-konigin-der-nacht-buhnenbild-zauberflote-mozart",
  },
  // Prayers at Sunset
  "charles-w-bartlett": {
    id: "collection-of-beauty-prayers-at-sunset-udaipur-india-woodblock-print-by-charles-w-bartlett-1919-honolulu-academy-of-arts",
    position: "45% 50%",
  },
  // The Tempest
  giorgione: { id: "collection-of-beauty-giorgione-the-tempest", position: "50% 60%" },
  // The Garden of Earthly Delights
  "hieronymus-bosch": { id: "collection-of-beauty-el-jardin-de-las-delicias-de-el-bosco" },
  // As the Old Sing
  "jacob-jordaens": {
    id: "collection-of-beauty-as-the-old-sing-so-the-young-pipe-by-jacob-jordaens",
    position: "80% 50%",
  },
  // Scops Owl
  "ohara-koson": {
    id: "collection-of-beauty-scops-owl-cherry-blossoms-and-moon-by-shoson",
    position: "50% 45%",
  },
  // Hunters in the Snow
  "pieter-bruegel-the-elder": {
    id: "collection-of-beauty-2560px-pieter-bruegel-the-elder-hunters-in-the-snow-winter-google-art-project",
    position: "0% 50%",
  },
  // Wanderer above the Sea of Fog
  "caspar-david-friedrich": {
    id: "collection-of-beauty-caspar-david-friedrich-wanderer-above-the-sea-of-fog",
    position: "50% 70%",
  },
  // Cook at a Kitchen Table with Dead Game
  "frans-snyders": {
    id: "collection-of-beauty-frans-snyders-cook-at-a-kitchen-table-with-dead-game",
  },
  // The Magdalen with the Smoking Flame
  "georges-de-la-tour": {
    id: "collection-of-beauty-georges-de-la-tour-the-magdalen-with-the-smoking-flame-google-art-project",
    position: "50% 15%",
  },
  // Vase of Flowers with a Coffee Cup
  "henri-fantin-latour": {
    id: "collection-of-beauty-henri-fantin-latour-vase-of-flowers-with-a-coffee-cup-13648335833",
    position: "50% 5%",
  },
  // Suprematist Composition
  "kazimir-malevich": {
    id: "collection-of-beauty-suprematist-composition-kazimir-malevich",
    position: "50% 30%",
  },
  // Leda and the Swan
  "paolo-veronese": {
    id: "collection-of-beauty-leda-et-le-cygne-par-paolo-veronese-1",
    position: "50% 60%",
  },
  // Portrait of Dr. Samuel D. Gross
  "thomas-eakins": {
    id: "collection-of-beauty-thomas-eakins-american-portrait-of-dr-samuel-d-gross-the-gross-clinic-google-art-project",
    position: "50% 85%",
  },
  // Frederick the Great Playing the Flute at Sanssouci
  "adolph-von-menzel": {
    id: "collection-of-beauty-adolph-menzel-flotenkonzert-friedrichs-des-gro-en-in-sanssouci-google-art-project",
    position: "40% 50%",
  },
  // At the Entrance to the Temple Mount
  "gustav-bauernfeind": {
    id: "collection-of-beauty-bauernfeind-gustav-at-the-entrance-to-the-temple-mount-jerusalem-1886",
    position: "50% 75%",
  },
  // An Armenian Lady, Cairo – The Love Missive
  "john-frederick-lewis": {
    id: "collection-of-beauty-arabian-nights-3-by-john-frederick-lewis",
    position: "50% 60%",
  },
  // The Resurrection, from the Isenheim Altarpiece
  "matthias-grunewald": {
    id: "collection-of-beauty-matthias-grunewald-resurrection",
    position: "50% 20%",
  },
  // The Hülsenbeck Children
  "philipp-otto-runge": {
    id: "collection-of-beauty-philipp-otto-runge-die-hulsenbeckschen-kinder",
    position: "60% 50%",
  },
  // The Last Supper
  tintoretto: {
    id: "collection-of-beauty-jacopo-tintoretto-the-last-supper-wga22649",
    position: "35% 50%",
  },
  // « Menshikov in Berezovo» by Wassilij Iwanowitsch Surikov
  "vasily-surikov": { id: "collection-of-beauty-surikovmenshikovberezovo", position: "25% 50%" },
  // Portrait of François Boucher
  "gustaf-lundberg": {
    id: "collection-of-beauty-boucher-par-gustav-lundberg-1741",
    position: "50% 25%",
  },
  // 1522 Holbein d.Ä. Angehöriger der Augsburger Familie Weiss anagoria
  "hans-holbein-the-elder": {
    id: "collection-of-beauty-1522-holbein-d-a-angehoriger-der-augsburger-familie-weiss-anagoria",
    position: "50% 30%",
  },
  // Crossing the River Styx
  "joachim-patinir": { id: "collection-of-beauty-crossing-the-river-styx" },
  // Portrait of Pablo Picasso
  "juan-gris": {
    id: "collection-of-beauty-juan-gris-portrait-of-pablo-picasso-google-art-project",
    position: "50% 0%",
  },
  // Yamamoto 1904
  "kanae-yamamoto": { id: "collection-of-beauty-yamamoto-1904", position: "50% 10%" },
  // Massacre of the Innocents
  "nicolas-poussin": {
    id: "collection-of-beauty-nicolas-poussin-le-massacre-des-innocents-google-art-project",
  },
  // The Moneylender and his Wife
  "quinten-metsys": {
    id: "collection-of-beauty-massysm-quentin-the-moneylender-and-his-wife-1514",
  },
  // Portrait of a Young woman with a Winged Bonnet
  "rogier-van-der-weyden": {
    id: "collection-of-beauty-rogier-van-der-weyden-1399-1464-portrait-of-a-young-woman-with-a-white-headdress-545d-gemaldegaleri",
    position: "50% 24%",
  },
  // Portrait of a Man
  "andrea-del-sarto": {
    id: "collection-of-beauty-andrea-del-sarto-portrait-of-a-man",
    position: "50% 25%",
  },
  // The Bean Eater
  "annibale-carracci": {
    id: "collection-of-beauty-carracci-der-bohnenesser-jpeg",
    position: "10% 50%",
  },
  // Chelsea Pensioners Reading the Waterloo Dispatch
  "david-wilkie": {
    id: "collection-of-beauty-david-wilkie-chelsea-pensioners-reading-the-waterloo-dispatch",
    position: "20% 50%",
  },
  // Portrait of Innocent X
  "diego-velazquez": {
    id: "collection-of-beauty-retrato-del-papa-inocencio-x-roma-by-diego-velazquez",
    position: "50% 30%",
  },
  // Salome
  "franz-von-stuck": {
    id: "collection-of-beauty-stuck-franz-von-salome-google-art-project",
    position: "50% 20%",
  },
  // American Gothic
  "grant-wood": {
    id: "collection-of-beauty-grant-wood-american-gothic-google-art-project",
    position: "50% 15%",
  },
  // Tiger in a Tropical Storm
  "henri-rousseau": { id: "collection-of-beauty-surprised-rousseau", position: "10% 50%" },
  // Titania and Bottom
  "henry-fuseli": {
    id: "collection-of-beauty-henry-fuseli-titania-and-bottom-google-art-project",
    position: "45% 50%",
  },
  // Woman with a Pearl Necklace in a Loge
  "mary-cassatt": {
    id: "collection-of-beauty-mary-stevenson-cassatt-american-woman-with-a-pearl-necklace-in-a-loge-google-art-project",
    position: "50% 10%",
  },
  // The Creation of Adam
  "michelangelo-buonarroti": { id: "collection-of-beauty-creacion-de-adan", position: "45% 50%" },
  // Bull subdued by dogs
  "paul-de-vos": {
    id: "collection-of-beauty-paul-de-vos-bull-subdued-by-dogs",
    position: "30% 50%",
  },
  // Senecio
  "paul-klee": {
    id: "collection-of-beauty-paul-klee-1922-senecio-oil-on-gauze-40-3-37-4-cm-kunstmuseum-basel",
    position: "50% 20%",
  },
  // The Floating Pavilion at Katada in the Snow (Yuki no Katada Ukimidō)
  "tsuchiya-koitsu": {
    id: "collection-of-beauty-het-drijvende-paviljoen-te-katada-in-de-sneeuw-yuki-no-katada-ukimido-titel-op-object-ak-mak-1636",
    position: "50% 10%",
  },
  // The Awakening Conscience
  "william-holman-hunt": {
    id: "collection-of-beauty-hunt-awakeningconscience1853",
    position: "50% 15%",
  },
  // Fourth muscle man
  "andreas-vesalius": {
    id: "collection-of-beauty-fourth-muscle-man-by-vesalius-wellcome-l0001647",
    position: "50% 8%",
  },
  // The Holy Family with a Bird
  "bartolome-esteban-murillo": {
    id: "collection-of-beauty-bartolome-esteban-perez-murillo-008",
    position: "25% 50%",
  },
  // Farinelli
  "bartolomeo-nazari": {
    id: "collection-of-beauty-bartolomeo-nazari-portrait-of-farinelli-1734-royal-college-of-music-london",
    position: "50% 45%",
  },
  // Saint Luke as a painter
  "francisco-de-zurbaran": {
    id: "collection-of-beauty-francisco-de-zurbaran-046",
    position: "50% 0%",
  },
  // Богоматерь с младенцем
  "fyodor-bruni": {
    id: "collection-of-beauty-bruni-f-a-bogomater-s-mladentsem-1858",
    position: "50% 20%",
  },
  // Portrait of Louis XIV
  "hyacinthe-rigaud": { id: "collection-of-beauty-louis-xiv-of-france", position: "50% 15%" },
  // An Experiment on a Bird in the Air Pump
  "joseph-wright-of-derby": {
    id: "collection-of-beauty-an-experiment-on-a-bird-in-an-air-pump-by-joseph-wright-of-derby-1768",
    position: "65% 50%",
  },
  // Portrait of Painter Peder Severin Kröyer
  "laurits-tuxen": {
    id: "collection-of-beauty-portrait-of-peder-severin-kr-yer-by-laurits-tuxen",
    position: "50% 15%",
  },
  // Gathering Bamboo Shoots
  "suzuki-harunobu": {
    id: "collection-of-beauty-gathering-bamboo-shoots-by-suzuki-harunobu-1765",
    position: "50% 95%",
  },
  // Democritus
  "antoine-coypel": { id: "collection-of-beauty-coypel-democritus", position: "50% 15%" },
  // John Liston Byam Shaw Boer War
  "john-byam-liston-shaw": {
    id: "collection-of-beauty-john-liston-byam-shaw-boer-war",
    position: "50% 0%",
  },
  // The Nubian Palace Guard
  "ludwig-deutsch": {
    id: "collection-of-beauty-ludwig-deutsch-the-nubian-palace-guard",
    position: "50% 5%",
  },
  // Vision of Youth Bartholomew
  "mikhail-nesterov": { id: "collection-of-beauty-mikhail-nesterov-001", position: "100% 50%" },
  // Self-portrait
  "sarah-goodridge": {
    id: "collection-of-beauty-miniature-painting-sarah-goodridge-self-portrait",
    position: "50% 20%",
  },
  // Junks in Inatori Bay, Izu
  "takahashi-shotei": {
    id: "collection-of-beauty-junks-in-inatori-bay-izu-by-takahashi-shotei-1",
    position: "60% 50%",
  },
  // Snow Scene
  "utagawa-kunisada": {
    id: "collection-of-beauty-brooklyn-museum-snow-scene-utagawa-toyokuni-iii-kunisada",
    position: "50% 30%",
  },
  // The lamentation over the dead Christ
  "andrea-mantegna": {
    id: "collection-of-beauty-andrea-mantegna-the-lamentation-over-the-dead-christ-wga13981",
    position: "25% 50%",
  },
  // Promenade
  "august-macke": {
    id: "collection-of-beauty-macke-august-promenade-google-art-project",
    position: "60% 50%",
  },
  // Wilhelmine Begas
  "carl-joseph-begas": {
    id: "collection-of-beauty-carl-joseph-begas-frau-wilhelmine-begas-die-gattin-des-kunstlers",
    position: "50% 10%",
  },
  // The Rebuke of Adam and Eve
  "charles-joseph-natoire": {
    id: "collection-of-beauty-natoire-adam-et-eve-chasses-du-paradis-terrestre",
    position: "50% 90%",
  },
  // The Fall of the Titans
  "cornelis-van-haarlem": {
    id: "collection-of-beauty-cornelis-cornelisz-van-haarlem-the-fall-of-the-titans-google-art-project",
    position: "45% 50%",
  },
  // Peaceable Kingdom
  "edward-hicks": {
    id: "collection-of-beauty-edward-hicks-peaceable-kingdom",
    position: "90% 50%",
  },
  // Suzanne et les vieillards
  "giambattista-pittoni": {
    id: "collection-of-beauty-suzanne-et-les-vieillards-giovanni-battista-pittoni-q18573893",
    position: "50% 40%",
  },
  // The Open Window
  "henri-matisse": { id: "collection-of-beauty-matisse-open-window", position: "50% 60%" },
  // Skeletal Figure with Superficial Muscles (Tabula II, after Albinus)
  "jan-wandelaar": {
    id: "collection-of-beauty-albinus-skeleton-w-less-muscles",
    position: "50% 5%",
  },
  // Pilgrimage to Cythera
  "jean-antoine-watteau": {
    id: "collection-of-beauty-l-embarquement-pour-cythere-by-antoine-watteau-from-c2rmf-retouched",
    position: "45% 50%",
  },
  // Parting Spring (left panel)
  "kawai-gyokudo": {
    id: "collection-of-beauty-parting-spring-by-kawai-gyokudo-national-museum-of-modern-art-tokyo-l",
    position: "25% 50%",
  },
  // The Madonna with the Long Neck
  parmigianino: {
    id: "collection-of-beauty-parmigianino-madonna-and-child-with-angels-known-as-the-madonna-with-the-long-neck",
    position: "50% 12%",
  },
  // The poor fisherman
  "pierre-puvis-de-chavannes": {
    id: "collection-of-beauty-pierre-puvis-de-chavannes-the-poor-fisherman-google-art-project",
    position: "30% 50%",
  },
  // Venus and Satyr
  "sebastiano-ricci": {
    id: "collection-of-beauty-sebastiano-ricci-venus-and-satyr-google-art-project",
  },
  // The Charging Chasseur
  "theodore-gericault": { id: "collection-of-beauty-gericaulthorseman", position: "50% 15%" },
  // Riders at the Tegernsee
  "wilhelm-von-kobell": {
    id: "collection-of-beauty-1280px-wilhelm-von-kobell-reiter-am-tegernsee-google-art-project",
    position: "50% 75%",
  },
  // Leda and the Swan
  "antonio-da-correggio": {
    id: "collection-of-beauty-correggio-leda-and-the-swan-google-art-project",
    position: "60% 50%",
  },
  // Xiao and Xiang Rivers
  "dong-yuan": { id: "collection-of-beauty-dong-yuan-rivers-detail", position: "50% 60%" },
  // George Washington
  "edward-savage": {
    id: "collection-of-beauty-edward-savage-george-washington-c-1796-nga-46007",
    position: "50% 20%",
  },
  // Portrait of Marguerite Khnopff
  "fernand-khnopff": { id: "collection-of-beauty-fernand-khnopff013", position: "50% 5%" },
  // The Painter Caspar David Friedrich
  "gerhard-von-kugelgen": {
    id: "collection-of-beauty-gerhard-von-kugelgen-portrait-of-friedrich",
    position: "50% 10%",
  },
  // Woman in Blue Combing Her Hair
  "hashiguchi-goyo": {
    id: "collection-of-beauty-hashiguchi-goyo-woman-in-blue-combing-her-hair-walters-95880",
    position: "50% 10%",
  },
  // The Skating Minister
  "henry-raeburn": {
    id: "collection-of-beauty-reverend-robert-walker-1755-1808-skating-on-duddingston-loch",
    position: "50% 90%",
  },
  // Wasserdrachen
  "keisai-eisen": { id: "collection-of-beauty-keisai-eisen-wasserdrachen", position: "50% 55%" },
  // Hairdresser
  "kitagawa-utamaro": {
    id: "collection-of-beauty-kitagawa-utamaro-hairdresser-kamiyui-from-the-series-twelve-types-of-women-s-handicraft-fujin-tewaz",
    position: "50% 12%",
  },
  // Mona Lisa
  "leonardo-da-vinci": {
    id: "collection-of-beauty-mona-lisa-by-leonardo-da-vinci-from-c2rmf-retouched",
    position: "50% 10%",
  },
  // Snowscape
  "ma-yuan": { id: "collection-of-beauty-snowscape", position: "50% 40%" },
  // Saint George and the Dragon
  "paolo-uccello": {
    id: "collection-of-beauty-paolo-uccello-heiliger-georg-und-der-drachen-1-470",
    position: "95% 50%",
  },
  // Eight Flowers
  "qian-xuan": {
    id: "collection-of-beauty-15-qian-xuan-eight-flowers-national-palace-museum-beijing",
    position: "0% 50%",
  },
  // Winter Landscape
  "sesshu-toyo": { id: "collection-of-beauty-sesshushuutoutou" },
  // Wind God and Thunder God Screens by Tawaraya Sotatsu hi-res
  "tawaraya-sotatsu": {
    id: "collection-of-beauty-wind-god-and-thunder-god-screens-by-tawaraya-sotatsu-hi-res",
    position: "0% 50%",
  },
  // The Battle of Alexander at Issus
  "albrecht-altdorfer": {
    id: "collection-of-beauty-albrecht-altdorfer-schlacht-bei-issus-alte-pinakothek-munchen-google-art-project",
    position: "50% 0%",
  },
  // Shurygin Levitan 1889
  "alexander-shurygin": { id: "collection-of-beauty-shurygin-levitan-1889", position: "50% 20%" },
  // Ibrahim 'Adil Shah II holding instruments
  "ali-riza": { id: "collection-of-beauty-indischer-maler-um-1615-i-001", position: "50% 20%" },
  // Seated Nude
  "amedeo-modigliani": { id: "collection-of-beauty-2895-1-modigliani-0007", position: "50% 0%" },
  // Portrait of Fyodor Bruni
  "apollinary-goravsky": {
    id: "collection-of-beauty-portret-khudozhnika-fedora-antonovicha-bruni",
    position: "50% 20%",
  },
  // The muscles of the human body
  "arnauld-eloi-gautier-d-agoty": {
    id: "collection-of-beauty-the-muscles-of-the-human-body-fourth-layer-seen-from-the-f-wellcome-v0007799",
    position: "50% 0%",
  },
  // The Peacock Skirt
  "aubrey-beardsley": { id: "collection-of-beauty-beardsley-peacockskirt", position: "50% 0%" },
  // Mystic Marriage of Saint Catherine
  "biagio-pupini": {
    id: "collection-of-beauty-ca-rezzonico-matrimonio-mistico-di-santa-caterina-inv-236-biagio-pupini-detto-dalle-lame",
    position: "50% 20%",
  },
  // The Blue Grotto on Capri
  "carl-friedrich-seiffert": {
    id: "collection-of-beauty-carl-friedrich-seiffert-die-blaue-grotte-auf-capri-1860",
    position: "70% 50%",
  },
  // A skeleton
  "charles-grignion-the-younger": {
    id: "collection-of-beauty-anatomy-wellcome-l0021852",
    position: "50% 15%",
  },
  // Nine Dragons
  "chen-rong": { id: "collection-of-beauty-chen-rong-nine-dragons", position: "82% 50%" },
  // Study of Mules
  "claude-lorrain": {
    id: "collection-of-beauty-drawing-of-mules-by-claude-lorrain",
    position: "5% 50%",
  },
  // The Triumph of Bacchus
  "cornelis-de-vos": {
    id: "collection-of-beauty-cornelis-de-vos-el-triunfo-de-baco",
    position: "45% 50%",
  },
  // House Once Inhabited by Rembrandt on the Jodenbreestraat, Amsterdam
  "cornelis-springer": {
    id: "collection-of-beauty-cornelis-springer-afb-010001000785",
    position: "50% 45%",
  },
  // Carlyle Maclise Original
  "daniel-maclise": { id: "collection-of-beauty-carlyle-maclise-original", position: "50% 5%" },
  // Aivazovsky by Bolotov
  "dmitry-mikhailovich-bolotov": {
    id: "collection-of-beauty-aivazovsky-by-bolotov-1876",
    position: "50% 15%",
  },
  // The Old Adam and Eve
  "edmund-joseph-sullivan": {
    id: "collection-of-beauty-the-old-adam-and-eve",
    position: "50% 15%",
  },
  // Palikare Return Home
  "eduard-magnus": {
    id: "collection-of-beauty-1836-heimkehr-des-palikaren-anagoria",
    position: "45% 50%",
  },
  // A View of Delft after the Explosion of 1654
  "egbert-van-der-poel": { id: "collection-of-beauty-delftsedonderslag", position: "30% 50%" },
  // Finches and Bamboo
  "emperor-huizong-of-song": {
    id: "collection-of-beauty-finches-and-bamboo-met-dp151504",
    position: "20% 50%",
  },
  // The rape of Europa
  "erasmus-quellinus-ii": {
    id: "collection-of-beauty-erasmus-quellinus-ii-the-rape-of-europe",
    position: "50% 5%",
  },
  // Portrait of Pierre Puvis de Chavannes
  "etienne-carjat": {
    id: "collection-of-beauty-pierre-cecile-puvis-de-chavannes-003",
    position: "25% 50%",
  },
  // Travelers Among Mountains and Streams
  "fan-kuan": { id: "collection-of-beauty-xsxlt-fankuan", position: "50% 10%" },
  // Pornokratès
  "felicien-rops": {
    id: "collection-of-beauty-felicien-rops-pornokrates-1878-2",
    position: "50% 3%",
  },
  // Les deux perles
  "fernand-le-quesne": {
    id: "collection-of-beauty-fernand-le-quesne-les-deux-perles-the-two-pearls-1889",
  },
  // The Deposition
  "follower-of-rogier-van-der-weyden": {
    id: "collection-of-beauty-follower-of-rogier-van-der-weyden-netherlandish-the-deposition-google-art-project",
  },
  // Portrait of Louis David
  "francois-joseph-navez": {
    id: "collection-of-beauty-francois-joseph-navez-louis-david-mg-3031",
    position: "50% 15%",
  },
  // Parade on Opernplatz in 1822
  "franz-kruger": {
    id: "collection-of-beauty-alte-nationalgalerie-kruger-parade-auf-dem-opernplatz-im-jahre-1822-dsc8028",
  },
  // The Tiger
  "franz-marc": {
    id: "collection-of-beauty-marc-franz-the-tiger-google-art-project",
    position: "50% 40%",
  },
  // Cliff Dwellers
  "george-bellows": { id: "collection-of-beauty-bellows-cliffdwellers" },
  // Sacred and Profane Love
  "giovanni-baglione": { id: "collection-of-beauty-baglione", position: "50% 30%" },
  // View of the Brenta
  "giovanni-battista-cimaroli": {
    id: "collection-of-beauty-view-of-the-brenta-near-dolo-met-lc-1975-1-091-001",
    position: "75% 50%",
  },
  // Susannah and the Elders
  "giuseppe-bartolomeo-chiari": {
    id: "collection-of-beauty-giuseppe-bartolomeo-chiari-susannah-and-the-elders-walters-371880",
    position: "25% 50%",
  },
  // Martyrdom of Saints John and Paul
  guercino: { id: "collection-of-beauty-guercino-martirio-dei-santi-giovanni-e-paolo" },
  // Traveling on the River in Snow
  "guo-zhongshu": {
    id: "collection-of-beauty-guo-zhongshu-traveling-on-the-river-in-snow",
    position: "50% 55%",
  },
  // Death and the Maiden
  "hans-baldung": { id: "collection-of-beauty-death-and-the-maiden-baldung", position: "50% 8%" },
  // Guanyin riding the dragon
  "harada-naojiro": {
    id: "collection-of-beauty-kannon-riding-a-dragon-by-harada-naojiro-national-museum-of-modern-art-tokyo",
    position: "50% 15%",
  },
  // Pine Trees (Shōrin-zu byōbu) - right hand screen
  "hasegawa-tohaku": {
    id: "collection-of-beauty-hasegawa-tohaku-pine-trees-shorin-zu-byobu-right-hand-screen",
    position: "34% 50%",
  },
  // Dance
  "hayami-gyoshu": { id: "collection-of-beauty-enbu-by-hayami-gyoshu", position: "50% 55%" },
  // Winter Scene on a Canal
  "hendrick-avercamp": {
    id: "collection-of-beauty-hendrik-avercamp-winter-scene-on-a-canal-google-art-project",
    position: "65% 50%",
  },
  // The Lute Player
  "hendrik-martenszoon-sorgh": {
    id: "collection-of-beauty-hendrick-martensz-sorgh-001",
    position: "50% 85%",
  },
  // Henri Meunier04
  "henri-meunier": { id: "collection-of-beauty-henri-meunier04", position: "50% 5%" },
  // Carnival Evening
  "henri-julien-felix-rousseau": {
    id: "collection-of-beauty-henri-julien-felix-rousseau-french-carnival-evening-google-art-project",
    position: "50% 80%",
  },
  // Lady Hamilton as Nature
  "henry-hoppner-meyer": {
    id: "collection-of-beauty-henry-hoppner-meyer-lady-hamilton-as-nature-b1970-3-335-yale-center-for-british-art",
    position: "50% 40%",
  },
  // Landscape Scroll
  "huang-binhong": { id: "collection-of-beauty-huang-binhong-landscape", position: "50% 60%" },
  // Vienna Diptych
  "hugo-van-der-goes": {
    id: "collection-of-beauty-hugo-van-der-goes-vienna-diptych",
    position: "0% 50%",
  },
  // Joseon-Kang Huian-Gosagwansudo
  "huian-kang": { id: "collection-of-beauty-joseon-kang-huian-gosagwansudo", position: "50% 60%" },
  // Orchids
  "ike-no-taiga": {
    id: "collection-of-beauty-ike-taiga-orchids-1975-268-94-metropolitan-museum-of-art",
    position: "50% 60%",
  },
  // Benjamin West
  "james-smith": {
    id: "collection-of-beauty-james-smith-benjamin-west-google-art-project",
    position: "50% 30%",
  },
  // Narcissus
  "jan-cossiers": { id: "collection-of-beauty-jan-cossiers-narciso" },
  // The Kloveniersdoelen on the Amstel, with the Tower 'Swijgh Utrecht'
  "jan-ekels-the-elder": {
    id: "collection-of-beauty-sa-8422-de-kloveniersdoelen-aan-de-amstel-de-kloveniersburgwal-op-de-hoek-van-de-amstel-met-de-tore",
    position: "40% 50%",
  },
  // The Ill-matched Pair
  "jan-matsys": {
    id: "collection-of-beauty-the-ill-matched-pair-jan-massys-nationalmuseum-17511",
    position: "25% 50%",
  },
  // The Battle of Nördlingen
  "jan-van-der-hoecke": {
    id: "collection-of-beauty-jan-van-der-hoecke-antwerp-1611-antwerp-or-brussels-1651-the-battle-of-nordlingen-1634-rcin-400100-",
    position: "5% 50%",
  },
  // Madonna of Chancellor Rolin
  "jan-van-eyck": {
    id: "collection-of-beauty-the-virgin-with-chancellor-rolin-by-jan-van-eyck-louvre-webp",
  },
  // Portrait of Quinten Massijs *
  "johannes-wierix": { id: "collection-of-beauty-jan-wierix-002", position: "50% 5%" },
  // Boar Lane
  "john-atkinson-grimshaw": {
    id: "collection-of-beauty-john-atkinson-grimshaw-boar-lane-leeds",
    position: "60% 50%",
  },
  // Man in a Black Cap
  "john-bettes-the-elder": {
    id: "collection-of-beauty-man-in-a-black-cap-by-john-bettes-the-elder",
    position: "50% 10%",
  },
  // Painter David drawing Marie-Antoinette led to her execution
  "joseph-emmanuel-van-den-bussche": {
    id: "collection-of-beauty-david-dessinant-marie-antoinette-van-den-bussche-img-2385",
    position: "50% 5%",
  },
  // December
  "julie-de-graag": { id: "collection-of-beauty-julie-de-graag-december-1917" },
  // Standing Portrait of a Courtesan
  "kaigetsudo-ando": {
    id: "collection-of-beauty-kaigetsudo-ando-standing-portrait-of-a-courtesan-c-1705-1710-hanging-scroll-ink-color-and-gold-on-p",
    position: "50% 35%",
  },
  // Scenes in and around the Capital (Uesugi) - left screen
  "kano-eitoku": { id: "collection-of-beauty-kano-eitoku-rakuchu-rakugai-zu-uesugi-left-screen" },
  // Google Art Project
  "kano-hideyori": {
    id: "collection-of-beauty-kano-hideyori-maple-viewers-google-art-project",
    position: "20% 50%",
  },
  // Frolicking Birds in Plum and Willow Trees
  "kano-sansetsu": {
    id: "collection-of-beauty-kano-sansetsu-frolicking-birds-in-plum-and-willow-trees",
  },
  // Enji Banshō (from Eight Views of Xiaoxiang)
  "kenko-shokei": {
    id: "collection-of-beauty-kenko-shokei-shosho-hakkei-enji-bansho",
    position: "50% 55%",
  },
  // Saint Christopher
  "konrad-witz": { id: "collection-of-beauty-konrad-witz-004", position: "50% 55%" },
  // Lakeside
  "kuroda-seiki": { id: "collection-of-beauty-kuroda-seiki-kohan00-6-1b", position: "15% 50%" },
  // Christ at the Sea of Galilee
  "lambert-sustris": {
    id: "collection-of-beauty-tintoretto-jacopo-christ-at-the-sea-of-galilee",
    position: "0% 50%",
  },
  // Spring Tide with Rain (Li Di, Song dynasty)
  "li-di": { id: "collection-of-beauty-9", position: "10% 50%" },
  // Imaginary tour through Xiao-xiang
  "li-shi": { id: "collection-of-beauty-imaginary-tour-through-xiao-xiang", position: "55% 50%" },
  // Famille de paysans dans un intérieur
  "louis-le-nain": {
    id: "collection-of-beauty-famille-de-paysans-dans-un-interieur",
    position: "65% 50%",
  },
  // George Frederic Watts
  "louis-reid-deuchars": {
    id: "collection-of-beauty-george-frederic-watts-by-george-andrews",
    position: "50% 35%",
  },
  // Portrait of a Man
  "luca-signorelli": {
    id: "collection-of-beauty-luca-signorelli-portrait-of-an-old-man-gemaldegalerie-berlin",
    position: "50% 5%",
  },
  // Raimondi Lucretia's suicide
  "marcantonio-raimondi": {
    id: "collection-of-beauty-raimondi-lucretia-s-suicide",
    position: "50% 20%",
  },
  // Morning Glow on the Western Ridge, from Thirty-six Views of the Imperial Summer Resort at
  "matteo-ripa": { id: "collection-of-beauty-matteo-ripa001-morning-glow-on-the-western-ridge" },
  // Dance of Death, from the Nuremberg Chronicle
  "michael-wolgemut": {
    id: "collection-of-beauty-nuremberg-chronicles-dance-of-death-cclxiiiiv",
    position: "65% 50%",
  },
  // Handrolle »Acht Ansichten der Gegend von Hsiao-Hsiang«
  "muqi-fachang": { id: "collection-of-beauty-mu-ch-i-001", position: "40% 50%" },
  // Portrait of Charles Le Brun
  "nicolas-de-largilliere": {
    id: "collection-of-beauty-nicolas-de-largilliere-portrait-of-charles-le-brun-wga12471",
    position: "50% 45%",
  },
  // Im warmen Land
  "nikolai-yaroshenko": {
    id: "collection-of-beauty-nikolaj-alexandrowitsch-jaroschenko-004",
    position: "50% 70%",
  },
  // Ehon Asakayama (Picture Book of Mount Asaka), Page 16
  "nishikawa-sukenobu": {
    id: "collection-of-beauty-nishikawa-sukenobu-1739-ehon-asakayama-16-gris",
    position: "50% 25%",
  },
  // KorinsScreen
  "ogata-korin": { id: "collection-of-beauty-korinsscreen", position: "0% 50%" },
  // L'Ermitage par Paul Berthon 2
  "paul-berthon": { id: "collection-of-beauty-l-ermitage-par-paul-berthon-2", position: "50% 45%" },
  // Nude Against the Light
  "pierre-bonnard": { id: "collection-of-beauty-nude-against-the-light-pierre-bonnard" },
  // Winter Landscape with a Bird Trap
  "pieter-brueghel-the-younger": {
    id: "collection-of-beauty-circle-of-pieter-bruegel-the-elder-winter-landscape-with-a-bird-trap",
    position: "70% 50%",
  },
  // Portrait of Gerard van Honthorst
  "pieter-de-jode-ii": {
    id: "collection-of-beauty-gerard-honthorst-gulden-cabinet",
    position: "50% 15%",
  },
  // Susanna and the elders
  "pieter-van-hanselaere": {
    id: "collection-of-beauty-suzanna-en-de-ouderlingen-rijksmuseum-sk-a-1042",
    position: "50% 45%",
  },
  // Summer Study from the Bingzi Year
  "pu-xian": { id: "collection-of-beauty-summer-study-from-the-bingzi-year", position: "50% 80%" },
  // Portrait of John Constable
  "ramsay-richard-reinagle": {
    id: "collection-of-beauty-john-constable-by-ramsay-richard-reinagle",
    position: "50% 20%",
  },
  // After Prayers
  "rudolf-ernst": { id: "collection-of-beauty-rudolf-ernst-after-prayers", position: "50% 90%" },
  // The Antiques Seller
  "rudolf-weisse": {
    id: "collection-of-beauty-the-antiques-seller-by-rudolf-weisse-1887",
    position: "50% 60%",
  },
  // Self-portrait
  "sabine-lepsius": {
    id: "collection-of-beauty-self-portrait-by-sabine-lepsius",
    position: "50% 5%",
  },
  // Viktor Vasnetsov by S.Malyutin
  "sergey-malyutin": {
    id: "collection-of-beauty-viktor-vasnetsov-by-s-malyutin-1915-vyatka",
    position: "50% 8%",
  },
  // Along the River During the Qingming Festival
  "shen-yuan": {
    id: "collection-of-beauty-along-the-river-during-the-qingming-festival-by-shen-yuan",
    position: "65% 50%",
  },
  // Searching for Immortals - Album Leaf
  shitao: { id: "collection-of-beauty-searching-for-immortals-met-dp162813", position: "60% 50%" },
  // Portrait of Edward Hicks Painting the Peaceable Kingdom
  "thomas-hicks": {
    id: "collection-of-beauty-edward-hicks-painting-the-peaceable-kingdom",
    position: "50% 15%",
  },
  // Kiyonaga bathhouse women-2
  "torii-kiyonaga": { id: "collection-of-beauty-kiyonaga-bathhouse-women-2", position: "60% 50%" },
  // The Actors Yamanaka Heikurō and Ichikawa Danjūrō II
  "torii-kiyonobu": {
    id: "collection-of-beauty-kiyonobu-yamanaka-ichikawa-1714",
    position: "50% 15%",
  },
  // Ebisu
  "toshusai-sharaku": { id: "collection-of-beauty-sharaku-1794-ebisu", position: "50% 35%" },
  // Hunting on the Lagoon (recto); Letter Rack (verso)
  "vittore-carpaccio": {
    id: "collection-of-beauty-1280px-vittore-carpaccio-hunting-on-the-lagoon-recto-letter-rack-verso-79-pb-72-j-paul-getty-museum",
    position: "50% 20%",
  },
  // Mt. Heng, after Juran, from the Mustard Seed Garden Manual of Painting
  "wang-gai": {
    id: "collection-of-beauty-mt-heng-after-juran-active-ca-960-965-from-the-mustard-seed-garden-manual-of-painting-met-dp-14004-",
    position: "25% 50%",
  },
  // Dwelling in the Qingbian Mountains
  "wang-meng": {
    id: "collection-of-beauty-wang-meng-dwelling-in-the-qingbian-mountains-ink-on-paper-1366-141x42-2-cm-shanghai-museum",
    position: "50% 70%",
  },
  // Einzug des Kronprinzen Friedrich Wilhelm von Preußen in Jerusalem 1869
  "wilhelm-gentz": {
    id: "collection-of-beauty-alte-nationalgalerie-gentz-einzug-des-kronprinzen-friedrich-wilhelm-von-preu-en-in-jerusalem-1869-d",
    position: "55% 50%",
  },
  // Schmetterlinge
  "wilhelm-von-kaulbach": {
    id: "collection-of-beauty-wilhelm-von-kaulbach-004",
    position: "50% 30%",
  },
  // Newton
  "william-blake": { id: "collection-of-beauty-newton-williamblake", position: "75% 50%" },
  // Sir David Wilkie's residence in Kensington London
  "william-collins": {
    id: "collection-of-beauty-sir-david-wilkie-s-residence-in-kensington-london-by-william-collins-1841-painted-just-after-wilkie",
    position: "45% 50%",
  },
  // Myriad Miles of the Yangtze River
  "xia-gui": {
    id: "collection-of-beauty-anonymous-ten-thousand-miles-of-the-yangtze-river",
    position: "36% 50%",
  },
  // Three Sisters
  "yamakawa-shuho": {
    id: "collection-of-beauty-three-sisters-by-yamakawa-shuho-1898-1944-painted-screen-1936-honolulu-museum-of-art-02",
    position: "55% 50%",
  },
  // Indefinite Divisibility
  "yves-tanguy": {
    id: "collection-of-beauty-yves-tanguy-divisibilite-indefinie-1942",
    position: "50% 55%",
  },
  // Three Friends of Winter
  "zhao-mengjian": {
    id: "collection-of-beauty-three-friends-of-winter-by-zhao-mengjian",
    position: "40% 50%",
  },
};
