// French catalog for the static privacy / data-flow page (namespace
// "privacy"). Typed Record<PrivacyKey, string> against privacy.en.ts so a
// missing key fails the typecheck.

import type { PrivacyKey } from "./privacy.en";

const privacyFr: Record<PrivacyKey, string> = {
  "privacy.docTitle": "Plöttr · comment vos données sont traitées",
  "privacy.breadcrumb": "← Plöttr",
  "privacy.h1": "Comment Plöttr traite vos données, en un schéma",

  "privacy.theme.toLight": "Passer en mode clair",
  "privacy.theme.toDark": "Passer en mode sombre",

  "privacy.diagram.cardLabel": "Schéma de circulation des données",
  "privacy.diagram.title": "Circulation des données dans Plöttr",
  "privacy.diagram.desc":
    "Un hébergeur de fichiers statiques (par ex. GitHub Pages) envoie une seule fois le HTML, le CSS et le JavaScript de Plöttr à votre navigateur au chargement de la page. À partir de là, la frontière de confiance est votre propre ordinateur : vous déposez un fichier CSV ou collez des cellules depuis Excel / Sheets, Plöttr exécute l’analyse localement, et les fichiers SVG / PNG / CSV / script R produits sont téléchargés sur la même machine. Aucune connexion sortante ne transporte jamais vos données. Deux gardes de sécurité veillent sur le chemin des données : chaque contenu importé est analysé à la recherche de cellules hostiles (injection de formules CSV / Excel, noms de colonnes hostiles visant l’export du script R) et signalé dans une bannière d’avertissement ; chaque CSV / script R téléchargé est assaini afin que tout caractère déclencheur résiduel reste inerte à la réouverture dans Excel ou RStudio.",
  "privacy.diagram.hostSub": "(ou tout hébergeur statique)",
  "privacy.diagram.pageLoad": "chargement",
  "privacy.diagram.yourComputer": "VOTRE ORDINATEUR",
  "privacy.diagram.boundaryNote": "— rien dans ce cadre n’en sort jamais",
  "privacy.diagram.csvLabel": "votre CSV / TSV",
  "privacy.diagram.csvSub": "disque ou presse-papiers",
  "privacy.diagram.dropOrPaste": "déposer ou coller",
  "privacy.diagram.appProcesses": "analyse · calcule · trace",
  "privacy.diagram.appWhere": "tout dans le navigateur",
  "privacy.diagram.youDownload": "vous téléchargez",
  "privacy.diagram.scanned": "✓ analysé",
  "privacy.diagram.sanitised": "✓ assaini",
  "privacy.diagram.ingressAria":
    "Plöttr analyse chaque fichier importé à la recherche de cellules hostiles avant de tracer le moindre graphique",
  "privacy.diagram.egressAria":
    "Plöttr assainit chaque téléchargement CSV et script R contre l’injection de formules",
  "privacy.diagram.outputsSub": "sur votre disque local",

  "privacy.trust.safe.h": "Vos données sont en sécurité",
  "privacy.trust.safe.p":
    "Lorsque vous déposez un fichier ou collez des cellules, le graphique et les statistiques sont construits sur place, dans l’onglet de votre navigateur. Plöttr n’a aucun serveur.",
  "privacy.trust.noMonitoring.h": "Aucun suivi",
  "privacy.trust.noMonitoring.p":
    "Pas d’analytique, pas de cookies, pas de traceurs. La page n’enregistre ni ce que vous cliquez, ni ce que vous importez, ni combien de temps vous restez.",
  "privacy.trust.openScrutiny.h": "Ouvert à l’examen",
  "privacy.trust.openScrutiny.p":
    'Plöttr est open source. Tout le code — y compris cette page — est sur <a href="https://github.com/evompmi/plottr">GitHub</a>. Lisez-le, forkez-le, ou faites-en tourner une copie locale.',

  "privacy.inspect.html":
    '<strong>Vous voulez zéro réseau du tout ?</strong> Plöttr est un site statique : vous pouvez le cloner une fois et le servir localement pour le reste de sa vie — chaque requête reste sur votre machine :<br/><br/><code>git clone https://github.com/evompmi/plottr.git</code><br/><code>cd plottr &amp;&amp; python3 -m http.server</code> &nbsp;·&nbsp; <span style="color: var(--text-faint)">puis ouvrez <code>http://localhost:8000</code> dans n’importe quel navigateur</span><br/><br/>N’importe quel serveur de fichiers statiques convient (Python, <code>npx serve</code>, nginx, …) ; le JS compilé est versionné dans <code>tools/</code>, donc aucune étape de build n’est nécessaire.',

  "privacy.footer.back": "← Retour à Plöttr",
  "privacy.footer.benchmark": "benchmark statistique vs R 4.5",
  "privacy.footer.source": "code source sur GitHub",
};

export default privacyFr;
