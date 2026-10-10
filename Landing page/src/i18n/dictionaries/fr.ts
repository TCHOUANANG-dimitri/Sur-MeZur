import type { Dictionary } from "../types";

/*
 * Textes de la page d'accueil, en français (langue par défaut).
 *
 * Règles d'écriture, issues des études sur les pages qui convertissent :
 * phrases courtes, un seul objectif (prendre ses mesures), la même action
 * répétée, aucun chiffre ni témoignage inventé, aucun prix.
 */
const fr: Dictionary = {
  meta: {
    title: "Sur-MeZur — Vos mesures de couture en 2 photos, gratuitement",
    description:
      "Prenez deux photos avec votre téléphone et obtenez vos 12 mesures de couture, prêtes pour votre tailleur. Gratuit, sans mètre ruban. Tailleurs : mesurez et gérez vos clients au même endroit.",
    ogTitle: "Vos mesures de couture en 2 photos",
    ogSub: "Gratuit · Sans mètre ruban · Pensé pour le Cameroun",
  },

  nav: {
    how: "Comment ça marche",
    clients: "Clients",
    tailors: "Tailleurs",
    pattern: "Patron",
    faq: "Questions",
    cta: "Mesurer gratuitement",
    login: "Se connecter",
    download: "Application Android",
    lang: "Langue",
    skip: "Aller au contenu",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
  },

  hero: {
    eyebrow: "Gratuit · Sans mètre ruban",
    h1a: "Vos mesures de couture",
    h1b: "en 2 photos.",
    sub: "Une photo de face, une de profil, avec votre téléphone. Sur-MeZur calcule vos 12 mesures et vous donne une fiche prête pour votre tailleur.",
    ctaPrimary: "Prendre mes mesures",
    ctaSecondary: "Je suis tailleur",
    reassure1: "Essai sans inscription",
    reassure2: "Environ 2 minutes",
    reassure3: "Photos supprimables",
    cardTitle: "Fiche de mesures",
    cardExample: "Exemple",
    cardFooter: "12 mesures · prête à imprimer ou partager",
    photoAlt: "Les mains d'un tailleur posent un patron en papier sur la table de coupe, à côté d'un téléphone.",
  },

  proof: {
    p1t: "12 mesures",
    p1b: "Celles dont un tailleur a besoin",
    p2t: "2 photos",
    p2b: "Avec un téléphone ordinaire",
    p3t: "Gratuit",
    p3b: "Pendant toute la phase de lancement",
    p4t: "Vos données",
    p4b: "Vous supprimez vos photos quand vous voulez",
  },

  testimonials: {
    eyebrow: "Ils l'utilisent",
    title: "Ce qu'en disent nos premiers utilisateurs",
  },

  how: {
    eyebrow: "Comment ça marche",
    title: "Trois étapes, deux minutes.",
    s1t: "Vos infos",
    s1b: "Votre taille, votre poids et votre sexe. C'est tout.",
    s2t: "Deux photos",
    s2b: "De face puis de profil, contre un mur clair. L'application vous guide pour la posture.",
    s3t: "Vos mesures",
    s3b: "Vos 12 mesures arrivent en quelques secondes. Imprimez la fiche ou envoyez-la à votre tailleur.",
    cta: "Essayer maintenant",
    ctaNote: "Gratuit · sans inscription pour essayer",
    alt1: "Un tailleur photographie un client debout, de face, contre un mur blanc.",
    alt2: "Le même client, de profil, contre le même mur.",
    alt3: "Une main tient un téléphone qui affiche la liste des mesures obtenues.",
  },

  audiences: {
    eyebrow: "Pour qui ?",
    title: "Pour vous, et pour votre tailleur.",
    clientsLabel: "Clients",
    clientsTitle: "Faites-vous mesurer sans rendez-vous.",
    c1: "Vos mesures depuis chez vous, sans mètre ruban",
    c2: "Une fiche claire à donner à votre tailleur",
    c3: "Choisissez un modèle et envoyez votre commande à un tailleur",
    c4: "Vos mesures restent dans votre compte, réutilisables",
    clientsCta: "Prendre mes mesures",
    clientsAlt: "Une jeune femme pose son téléphone sur une pile de livres pour se photographier contre un mur.",
    tailorsLabel: "Tailleurs",
    tailorsTitle: "Votre carnet de clients, enfin dans votre téléphone.",
    t1: "Mesurez vos clients par photo ou au mètre ruban",
    t2: "Toutes les mesures de vos clients au même endroit",
    t3: "Une fiche à imprimer ou à envoyer par WhatsApp",
    t4: "Vos travaux et dates de livraison, sans rien oublier",
    t5: "Les commandes de vos clients arrivent directement chez vous",
    tailorsCta: "Créer mon compte tailleur",
    tailorsAlt: "Un tailleur de Douala consulte des mesures sur son téléphone, à son établi.",
    free: "Gratuit",
  },

  measures: {
    eyebrow: "Les mesures",
    title: "Les 12 mesures dont votre tailleur a besoin.",
    sub: "Rangées par partie du corps, avec les mots du métier.",
    groupTop: "Buste et torse",
    groupArms: "Bras",
    groupLegs: "Hanches et jambes",
    chest: "Tour de poitrine",
    waist: "Tour de taille",
    hips: "Tour de hanches",
    neck: "Tour de cou",
    shoulder: "Carrure",
    back_length: "Longueur du dos",
    biceps: "Tour de bras",
    wrist: "Tour de poignet",
    sleeve_length: "Longueur de manche",
    thigh: "Tour de cuisse",
    inseam: "Longueur de jambe",
    ankle: "Tour de cheville",
    example: "Valeurs d'exemple",
    honest:
      "Mesures estimées à partir des photos. Vous ou votre tailleur pouvez corriger une valeur à tout moment.",
    screenAlt: "Écran de résultat de l'application Sur-MeZur avec la liste des mesures.",
  },

  pattern: {
    badge: "Bientôt",
    eyebrow: "Nouveau pour les tailleurs",
    title: "Du modèle en photo au patron prêt à couper.",
    sub: "Photographiez un modèle, choisissez votre client : Sur-MeZur prépare le patron à ses mesures, à imprimer à l'échelle.",
    s1t: "Une photo du modèle",
    s1b: "Celle que votre cliente vous montre sur son téléphone.",
    s2t: "Les mesures du client",
    s2b: "Tirées de votre carnet, prises par photo ou au mètre.",
    s3t: "Le patron à l'échelle",
    s3b: "Les pièces, les marges et les repères, en A4 à assembler.",
    cta: "Réserver mon accès en avant-première",
    ctaNote: "Créez votre compte tailleur gratuit : vous serez parmi les premiers à l'essayer.",
    photoLabel: "Photo du modèle",
    piecesLabel: "Patron",
    front: "Devant",
    back: "Dos",
    sleeve: "Manche",
    garmentAlt: "Photo d'un modèle de robe en wax, utilisée comme référence pour le patron.",
  },

  privacy: {
    title: "Vos photos vous appartiennent.",
    p1: "Elles servent uniquement à calculer vos mesures.",
    p2: "Vous pouvez les effacer à tout moment depuis votre profil.",
    p3: "Elles ne sont jamais publiées ni vendues.",
  },

  faq: {
    eyebrow: "Questions fréquentes",
    title: "Vos questions, nos réponses.",
    items: [
      {
        q: "C'est vraiment gratuit ?",
        a: "Oui. La prise de mesure et l'espace tailleur sont gratuits pendant toute la phase de lancement, sans carte bancaire ni engagement.",
      },
      {
        q: "Est-ce que c'est précis ?",
        a: "Les mesures sont estimées à partir de vos photos par vision par ordinateur. La précision dépend surtout des photos : vêtements près du corps, mur clair, téléphone à hauteur de taille. Vous ou votre tailleur pouvez corriger une valeur à tout moment, et nous publierons nos chiffres de précision une fois validés.",
      },
      {
        q: "Que deviennent mes photos ?",
        a: "Elles servent uniquement au calcul de vos mesures. Vous pouvez les supprimer à tout moment depuis votre profil. Elles ne sont ni publiées, ni vendues.",
      },
      {
        q: "Dois-je créer un compte ?",
        a: "Pas pour essayer : vous voyez une partie de vos mesures tout de suite. Le compte gratuit, avec votre numéro de téléphone, vous donne toutes vos mesures et la fiche à imprimer.",
      },
      {
        q: "Je suis tailleur : qu'est-ce que j'y gagne ?",
        a: "Un carnet de clients dans votre téléphone : mesures par photo ou au mètre ruban, fiches à envoyer par WhatsApp, suivi de vos travaux et de vos dates de livraison. Et bientôt, le patron à partir d'une photo du modèle.",
      },
      {
        q: "Y a-t-il une application ?",
        a: "Sur-MeZur fonctionne directement dans le navigateur de votre téléphone. Une application Android légère est aussi disponible sur la page de téléchargement.",
      },
    ],
  },

  final: {
    title: "Vos mesures sont à deux photos d'ici.",
    body: "Essayez maintenant : c'est gratuit, et ça prend deux minutes.",
    ctaPrimary: "Prendre mes mesures",
    ctaSecondary: "Je suis tailleur",
    appTitle: "Application Android",
    appBody: "Légère, gratuite, à installer en quelques secondes.",
    appCta: "Télécharger",
  },

  sticky: {
    cta: "Prendre mes mesures — gratuit",
  },

  download: {
    metaTitle: "Télécharger l'application Android",
    metaDescription: "Installez l'application Sur-MeZur sur votre téléphone Android : légère, gratuite, et toujours à jour.",
    eyebrow: "Application Android",
    title: "Sur-MeZur dans votre téléphone.",
    sub: "Une application légère qui s'ouvre en plein écran, sans barre d'adresse, et se met à jour toute seule.",
    cta: "Télécharger l'application",
    sizeLabel: "Taille",
    versionLabel: "Version",
    stepsTitle: "Installer en 3 étapes",
    s1: "Touchez « Télécharger l'application » et ouvrez le fichier téléchargé.",
    s2: "Si Android le demande, autorisez l'installation depuis votre navigateur (« sources inconnues »).",
    s3: "Touchez « Installer », puis ouvrez Sur-MeZur depuis votre écran d'accueil.",
    safety:
      "Téléchargez l'application uniquement depuis cette page. Sur-MeZur ne vous demandera jamais votre mot de passe par message.",
    soonTitle: "L'application arrive très bientôt.",
    soonBody:
      "En attendant, Sur-MeZur fonctionne déjà dans le navigateur de votre téléphone, avec exactement les mêmes fonctions.",
    openWeb: "Ouvrir Sur-MeZur dans le navigateur",
    pwaTitle: "Sans téléchargement",
    pwaBody: "Dans Chrome, ouvrez Sur-MeZur, touchez le menu ⋮ puis « Ajouter à l'écran d'accueil ».",
    iosTitle: "Sur iPhone",
    iosBody: "Dans Safari, ouvrez Sur-MeZur, touchez Partager puis « Sur l'écran d'accueil ».",
    back: "Retour à l'accueil",
  },

  footer: {
    tagline: "Mesurez plus juste. Cousez mieux.",
    blurb: "Les mesures de couture en deux photos, et bientôt le patron. Conçu à Douala pour les tailleurs et leurs clients.",
    product: "Produit",
    help: "Aide",
    company: "Entreprise",
    social: "Réseaux",
    how: "Comment ça marche",
    clients: "Pour les clients",
    tailors: "Pour les tailleurs",
    pattern: "Patron (bientôt)",
    download: "Application Android",
    faq: "Questions fréquentes",
    contact: "Nous contacter",
    privacy: "Confidentialité",
    terms: "Conditions d'utilisation",
    about: "KORAH",
    rights: "Tous droits réservés.",
    built: "Un produit KORAH, conçu à",
  },
};

export default fr;
