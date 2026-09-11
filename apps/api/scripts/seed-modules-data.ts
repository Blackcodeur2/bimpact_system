import { LessonContentType, PrismaClient } from '@prisma/client';

/**
 * Contenu pédagogique de démarrage : 6 modules, leçons écrites et quiz.
 * À relire et valider par l'équipe programme avant la mise en production.
 *
 * Ce script ne crée AUCUNE donnée de démonstration (projet, dossier d'accident, certificat, offre d'emploi) :
 * ces éléments naissent uniquement des parcours réels des membres, des entreprises et du comité.
 * Les leçons audio seront ajoutées quand des enregistrements réels existeront.
 *
 *   pnpm --filter @benskin/api training:seed
 */
const modules = [
  {
    month: 1,
    title: 'Entrepreneuriat & posture du leader',
    description: 'Développer l’état d’esprit d’un chef d’entreprise et passer du guidon à la gestion.',
    durationMinutes: 45,
    iconName: 'psychology',
    lessons: [
      {
        title: 'Passer de conducteur à entrepreneur',
        description: 'Comprendre la différence entre une recette journalière et une activité rentable.',
        durationMinutes: 12,
        content: `Passer de conducteur à entrepreneur

Une recette encaissée n’est pas un bénéfice. Avant de parler de profit, il faut payer ce que coûte l’activité : carburant, entretien, remboursement ou location de la moto.

Trois principes :
1. Séparer l’argent de l’activité de l’argent personnel. La moto est une petite entreprise : ses recettes paient d’abord ses charges.
2. Mettre de côté un peu chaque jour. La régularité compte plus que le montant.
3. Se fixer un projet. La moto peut être un tremplin : quel commerce, atelier ou service voulez-vous créer ?`,
        keyPoints: ['Recette ≠ bénéfice', 'Séparer caisse et dépenses personnelles', 'Épargner régulièrement', 'Se fixer un projet'],
      },
      {
        title: 'Gérer son temps et sa sécurité',
        description: 'Organiser ses journées sans s’épuiser.',
        durationMinutes: 10,
        content: `Gérer son temps et sa sécurité

Rouler plus longtemps n’augmente pas toujours le revenu net : la fatigue augmente le risque d’accident et l’usure de la moto.

- Repérez vos heures les plus rentables et concentrez-y votre activité.
- Prévoyez des pauses pour rester vigilant.
- Notez chaque soir vos recettes et vos dépenses : vous verrez quelles journées rapportent vraiment.`,
        keyPoints: ['La fatigue coûte cher', 'Repérer ses heures rentables', 'Noter recettes et dépenses'],
      },
    ],
    quiz: {
      title: 'Validation du module 1 — Esprit d’entreprise',
      passScore: 70,
      questions: [
        {
          question: 'Quelle est la première règle de gestion pour un conducteur entrepreneur ?',
          options: ['Dépenser la recette dès le soir', 'Séparer l’argent de l’activité de ses dépenses personnelles', 'Rouler sans pause', 'Reporter l’entretien de la moto'],
          correctIndex: 1,
          explanation: 'Séparer les finances de l’activité et les finances personnelles est la base de toute entreprise durable.',
        },
        {
          question: 'À quoi sert la contribution quotidienne au programme ?',
          options: [
            'À rien de précis',
            'À constituer un historique régulier qui ouvre l’accès aux tirages et au parcours entrepreneurial',
            'À payer une amende',
            'À obtenir automatiquement un financement',
          ],
          correctIndex: 1,
          explanation: 'Les contributions régulières rendent éligible aux tirages du programme ; aucun financement n’est automatique.',
        },
      ],
    },
  },
  {
    month: 2,
    title: 'Étude de marché & clientèle locale',
    description: 'Identifier les besoins réels des clients autour de soi.',
    durationMinutes: 40,
    iconName: 'storefront',
    lessons: [
      {
        title: 'Identifier une opportunité de quartier',
        description: 'Observer la concurrence et les besoins non satisfaits.',
        durationMinutes: 15,
        content: `Identifier une opportunité de quartier

Chaque quartier a ses besoins : un service qui manque le soir, un produit difficile à trouver, un travail mal fait par la concurrence.

Méthode simple :
1. Observez pendant une semaine : qui achète quoi, où, à quelle heure ?
2. Interrogez au moins dix clients potentiels sur leurs vrais problèmes.
3. Notez les prix pratiqués par les concurrents et ce que les clients leur reprochent.`,
        keyPoints: ['Observer avant d’investir', 'Interroger au moins dix clients', 'Étudier les concurrents'],
      },
    ],
    quiz: {
      title: 'Validation du module 2 — Étude de marché',
      passScore: 70,
      questions: [
        {
          question: 'Comment vérifier une idée d’entreprise avant d’investir ?',
          options: ['Emprunter immédiatement', 'Interroger des clients sur leurs vrais besoins', 'Attendre sans rien faire', 'Copier un voisin sans réfléchir'],
          correctIndex: 1,
          explanation: 'Écouter les clients est la manière la plus sûre et la moins coûteuse de vérifier qu’une demande existe.',
        },
      ],
    },
  },
  {
    month: 3,
    title: 'Modèle économique & rentabilité',
    description: 'Construire une offre claire et calculer ses marges.',
    durationMinutes: 40,
    iconName: 'trending_up',
    lessons: [
      {
        title: 'Calculer son seuil de rentabilité',
        description: 'Charges fixes, charges variables et bénéfice.',
        durationMinutes: 18,
        content: `Calculer son seuil de rentabilité

Le seuil de rentabilité est le chiffre d’affaires minimum pour ne pas perdre d’argent.

- Charges fixes : elles ne changent pas avec l’activité (loyer, abonnement).
- Charges variables : elles augmentent avec les ventes (marchandises, carburant).
- Marge = prix de vente − coût variable.

Seuil de rentabilité (en nombre de ventes) = charges fixes du mois ÷ marge par vente.`,
        keyPoints: ['Charges fixes et variables', 'Marge par vente', 'Seuil = charges fixes ÷ marge'],
      },
    ],
    quiz: {
      title: 'Validation du module 3 — Modèle économique',
      passScore: 70,
      questions: [
        {
          question: 'Qu’est-ce qu’une charge fixe ?',
          options: ['Une dépense qui ne varie pas avec le volume d’activité, comme le loyer', 'Le prix de l’essence', 'Un pourboire', 'Une réparation imprévue'],
          correctIndex: 0,
          explanation: 'Le loyer reste dû chaque mois, quel que soit le niveau des ventes.',
        },
      ],
    },
  },
  {
    month: 4,
    title: 'Finance & trésorerie',
    description: 'Tenir un cahier de caisse et sécuriser ses liquidités.',
    durationMinutes: 35,
    iconName: 'account_balance_wallet',
    lessons: [
      {
        title: 'Le cahier de recettes et de dépenses',
        description: 'L’outil de base pour piloter son activité.',
        durationMinutes: 14,
        content: `Le cahier de caisse

Chaque soir, notez :
1. les entrées d’argent (ventes, courses) ;
2. les sorties (achats, carburant, salaires) ;
3. l’argent réellement disponible.

Au bout d’un mois, vous savez si l’activité gagne de l’argent, et vous pouvez le montrer à un partenaire financier.`,
        keyPoints: ['Noter chaque soir', 'Entrées, sorties, solde', 'Prouver sa rentabilité'],
      },
    ],
    quiz: {
      title: 'Validation du module 4 — Gestion financière',
      passScore: 70,
      questions: [
        {
          question: 'Pourquoi tenir un cahier de caisse rigoureux ?',
          options: ['Pour perdre du temps', 'Pour connaître sa rentabilité réelle et pouvoir la justifier', 'Pour payer plus de taxes', 'C’est inutile'],
          correctIndex: 1,
          explanation: 'Un historique chiffré permet de piloter l’activité et de présenter un dossier sérieux.',
        },
      ],
    },
  },
  {
    month: 5,
    title: 'Marketing & vente locale',
    description: 'Fidéliser sa clientèle et utiliser les outils numériques simples.',
    durationMinutes: 35,
    iconName: 'campaign',
    lessons: [
      {
        title: 'Fidéliser ses clients',
        description: 'Transformer un client occasionnel en client régulier.',
        durationMinutes: 15,
        content: `Fidéliser ses clients

Un client satisfait revient et en parle autour de lui.

- Soyez ponctuel et tenez vos promesses.
- Gardez le contact : une messagerie de groupe permet d’annoncer vos produits ou disponibilités.
- Demandez l’avis de vos clients et corrigez ce qui ne va pas.`,
        keyPoints: ['Ponctualité et fiabilité', 'Garder le contact', 'Écouter les avis'],
      },
    ],
    quiz: {
      title: 'Validation du module 5 — Marketing',
      passScore: 70,
      questions: [
        {
          question: 'Quel est le meilleur moyen de faire revenir un client ?',
          options: ['Changer ses prix chaque semaine', 'Tenir ses promesses et garder le contact', 'Ignorer ses remarques', 'Ne jamais répondre aux messages'],
          correctIndex: 1,
          explanation: 'La fiabilité et le suivi créent la confiance, qui fait revenir les clients.',
        },
      ],
    },
  },
  {
    month: 6,
    title: 'Management & recrutement',
    description: 'Créer des emplois et encadrer une équipe.',
    durationMinutes: 40,
    iconName: 'groups',
    lessons: [
      {
        title: 'Recruter et encadrer un collaborateur',
        description: 'Fixer des règles claires et un cadre de confiance.',
        durationMinutes: 20,
        content: `Devenir employeur responsable

Recruter, c’est s’engager envers une personne.

- Décrivez clairement le poste, les horaires et la rémunération.
- Mettez les règles par écrit et respectez la réglementation du travail.
- Faites un point régulier : ce qui va, ce qui doit s’améliorer.`,
        keyPoints: ['Poste clairement décrit', 'Règles écrites et légales', 'Points réguliers'],
      },
    ],
    quiz: {
      title: 'Validation du module 6 — Examen final',
      passScore: 80,
      questions: [
        {
          question: 'Quelle est la clé d’une relation saine avec un collaborateur ?',
          options: ['Ne rien mettre par écrit', 'Des règles claires, écrites et respectées par les deux parties', 'Changer les règles chaque semaine', 'Ne jamais faire de point'],
          correctIndex: 1,
          explanation: 'Un cadre clair et respecté protège l’employeur comme le collaborateur.',
        },
      ],
    },
  },
];

export async function seedTrainingContent(prisma: PrismaClient) {
  for (const [index, module] of modules.entries()) {
    const saved = await prisma.courseModule.upsert({
      where: { month: module.month },
      create: {
        month: module.month,
        title: module.title,
        description: module.description,
        durationMinutes: module.durationMinutes,
        order: index + 1,
        iconName: module.iconName,
      },
      update: { title: module.title, description: module.description, durationMinutes: module.durationMinutes, iconName: module.iconName },
    });

    for (const [lessonIndex, lesson] of module.lessons.entries()) {
      const order = lessonIndex + 1;
      const data = {
        title: lesson.title,
        description: lesson.description,
        durationMinutes: lesson.durationMinutes,
        contentType: LessonContentType.TEXT,
        audioUrl: null,
        markdownContent: lesson.content,
        keyPoints: lesson.keyPoints,
      };
      const existing = await prisma.courseLesson.findFirst({ where: { moduleId: saved.id, order } });
      if (existing) await prisma.courseLesson.update({ where: { id: existing.id }, data });
      else await prisma.courseLesson.create({ data: { ...data, moduleId: saved.id, order } });
    }

    // Un quiz déjà passé par des membres n'est pas réécrit : ses résultats doivent rester interprétables.
    const existingQuiz = await prisma.quiz.findFirst({ where: { moduleId: saved.id } });
    if (!existingQuiz) {
      await prisma.quiz.create({
        data: {
          moduleId: saved.id,
          title: module.quiz.title,
          passScore: module.quiz.passScore,
          questions: {
            create: module.quiz.questions.map((question, questionIndex) => ({
              question: question.question,
              options: question.options,
              correctIndex: question.correctIndex,
              explanation: question.explanation,
              order: questionIndex + 1,
            })),
          },
        },
      });
    }
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedTrainingContent(prisma)
    .then(() => console.log(`Contenu de formation à jour : ${modules.length} modules.`))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
