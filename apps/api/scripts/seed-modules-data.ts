import { PrismaClient, LessonContentType, AccidentSeverity, AccidentClaimStatus, ProjectStatus } from '@prisma/client';

export async function seedModulesData(prisma: PrismaClient) {
  console.log('--- Initialisation des données des modules métier ---');

  // 1. MODULES DE FORMATION (6 MOIS)
  const modulesData = [
    {
      month: 1,
      title: 'Entrepreneuriat & Posture du Leader',
      description: 'Développer l’état d’esprit d’un chef d’entreprise et transitionner du guidon à la gestion.',
      durationMinutes: 90,
      order: 1,
      iconName: 'psychology',
      lessons: [
        {
          title: 'Passer de conducteur à entrepreneur',
          description: 'Comprendre la différence entre générer une recette journalière et bâtir un actif rentable.',
          durationMinutes: 12,
          contentType: LessonContentType.AUDIO,
          audioUrl: 'https://assets.benskinimpact.cm/audio/m1_lesson1.mp3',
          markdownContent: `### Passer de conducteur à entrepreneur\n\nChaque jour au Cameroun, des milliers de conducteurs génèrent entre 5 000 et 15 000 FCFA de recettes brutes. Pourtant, à la fin du mois, beaucoup se retrouvent sans épargne.\n\n#### 3 principes essentiels :\n1. **Séparer l'argent de la moto de son argent personnel** : Votre moto est une micro-entreprise. Les recettes doivent d'abord payer l'amortissement, le carburant et l'entretien avant tout prélèvement.\n2. **La discipline de la cotisation quotidienne** : Mettre de côté 200 FCFA par jour crée la base de solidarité et d'accès au capital de demain.\n3. **Visualiser son projet futur** : La moto est un tremplin, pas une fin en soi. Quel atelier, quel commerce ou quelle flotte voulez-vous créer dans 1 an ?`,
          order: 1,
        },
        {
          title: 'Gestion du temps et productivité urbaine',
          description: 'Optimiser ses heures de pointe à Yaoundé et Douala sans s’épuiser physiquement.',
          durationMinutes: 15,
          contentType: LessonContentType.TEXT,
          audioUrl: null,
          markdownContent: `### Gestion du temps et rentabilité par heure\n\nÊtre sur la route 14h par jour augmente les risques d'accident et d'usure mécanique sans doubler le revenu net.\n\n* **Heures chaudes** : 06h30-09h00 (trajets domicile-travail) et 17h00-20h30 (retours des marchés et bureaux).\n* **Heures creuses rentables** : Livraisons programmées de colis et contrats réguliers avec commerçants.\n* **Repos stratégique** : 1h de pause aux heures mortes (13h-14h) permet de maintenir la vigilance.`,
          order: 2,
        },
      ],
      quiz: {
        title: 'Validation Mois 1 — Esprit d’Entreprise',
        passScore: 70,
        questions: [
          {
            question: 'Quelle est la première règle de gestion pour un conducteur entrepreneur ?',
            options: ['Dépenser la recette dès le soir', 'Séparer la caisse de l’activité de ses dépenses personnelles', 'Rouler 18h sans pause', 'Ne jamais entretenir sa moto'],
            correctIndex: 1,
            explanation: 'La séparation des finances personnelles et professionnelles est le socle de toute entreprise pérenne.',
            order: 1,
          },
          {
            question: 'À quoi sert la contribution de 200 FCFA / jour ?',
            options: ['À enrichir une banque', 'À financer les projets des conducteurs, la solidarité et les tirages', 'À payer une amende', 'À rien'],
            correctIndex: 1,
            explanation: 'La contribution quotidienne alimente le fonds de solidarité accident et les dotations entrepreneuriales vérifiables.',
            order: 2,
          },
        ],
      },
    },
    {
      month: 2,
      title: 'Étude de marché & Clientèle locale',
      description: 'Identifier les besoins non satisfaits à Akwa, Bonabéri, Mokolo ou Bastos.',
      durationMinutes: 110,
      order: 2,
      iconName: 'storefront',
      lessons: [
        {
          title: 'Identifier une opportunité de quartier',
          description: 'Analyser la concurrence et les manques criants autour de votre carrefour.',
          durationMinutes: 15,
          contentType: LessonContentType.AUDIO,
          audioUrl: 'https://assets.benskinimpact.cm/audio/m2_lesson1.mp3',
          markdownContent: `### Identifier une opportunité de quartier\n\nChaque carrefour a ses besoins spécifiques : manque d'un réparateur de confiance ouvert tard, pénurie de pièces d'usure rapide de qualité (câbles d'embrayage, chambres à air HD), ou absence de service de livraison frigorifique locale.`,
          order: 1,
        },
      ],
      quiz: {
        title: 'Validation Mois 2 — Étude de marché',
        passScore: 70,
        questions: [
          {
            question: 'Comment valider une idée d’entreprise avant d’investir ?',
            options: ['Emprunter immédiatement au taux fort', 'Interroger ses clients réguliers sur leurs réels problèmes', 'Attendre sans rien faire', 'Copier sans réfléchir'],
            correctIndex: 1,
            explanation: 'L’écoute client est la méthode la plus sûre et la moins coûteuse pour vérifier la demande.',
            order: 1,
          },
        ],
      },
    },
    {
      month: 3,
      title: 'Business Model & Rentabilité',
      description: 'Construire une offre claire et calculer ses marges bénéficiaires.',
      durationMinutes: 120,
      order: 3,
      iconName: 'trending_up',
      lessons: [
        {
          title: 'Calculer son seuil de rentabilité',
          description: 'Charges fixes, charges variables et bénéfice net mensuel.',
          durationMinutes: 18,
          contentType: LessonContentType.AUDIO,
          audioUrl: 'https://assets.benskinimpact.cm/audio/m3_lesson1.mp3',
          markdownContent: `### Calculer son seuil de rentabilité\n\nLe seuil de rentabilité est le chiffre d'affaires minimum nécessaire pour ne pas perdre d'argent. Dès que ce seuil est franchi, chaque franc supplémentaire devient un profit net.`,
          order: 1,
        },
      ],
      quiz: {
        title: 'Validation Mois 3 — Modèle Économique',
        passScore: 70,
        questions: [
          {
            question: 'Qu’est-ce qu’une charge fixe ?',
            options: ['Une dépense qui ne varie pas avec le volume d’activité (ex: loyer du local)', 'Le prix de l’essence', 'Un pourboire', 'Une réparation imprévue'],
            correctIndex: 0,
            explanation: 'Le loyer ou l’assurance restent dus chaque mois, quel que soit le niveau des ventes.',
            order: 1,
          },
        ],
      },
    },
    {
      month: 4,
      title: 'Finance & Trésorerie',
      description: 'Tenir un livre de caisse simple et sécuriser ses liquidités.',
      durationMinutes: 90,
      order: 4,
      iconName: 'account_balance_wallet',
      lessons: [
        {
          title: 'Le cahier de recettes et dépenses',
          description: 'L’outil indispensable pour obtenir un financement Benskin.',
          durationMinutes: 14,
          contentType: LessonContentType.TEXT,
          audioUrl: null,
          markdownContent: `### Le cahier de caisse\n\nNotez chaque soir : 1. Entrées de trésorerie (recettes clients), 2. Sorties (achats de stocks, carburant, salaires), 3. Solde réel en poche.`,
          order: 1,
        },
      ],
      quiz: {
        title: 'Validation Mois 4 — Gestion Financière',
        passScore: 70,
        questions: [
          {
            question: 'Pourquoi tenir un cahier de caisse rigoureux ?',
            options: ['Pour payer plus de taxes', 'Pour prouver sa rentabilité lors de la demande de subvention Benskin', 'Pour perdre du temps', 'C’est inutile'],
            correctIndex: 1,
            explanation: 'Un historique financier vérifiable prouve le sérieux du porteur de projet.',
            order: 1,
          },
        ],
      },
    },
    {
      month: 5,
      title: 'Marketing & Vente Locale',
      description: 'Fidéliser sa clientèle et utiliser les canaux numériques (WhatsApp Business).',
      durationMinutes: 80,
      order: 5,
      iconName: 'campaign',
      lessons: [
        {
          title: 'WhatsApp Business pour commerçants et transporteurs',
          description: 'Créer son catalogue et gérer les commandes clients.',
          durationMinutes: 15,
          contentType: LessonContentType.AUDIO,
          audioUrl: 'https://assets.benskinimpact.cm/audio/m5_lesson1.mp3',
          markdownContent: `### Vendre grâce au numérique\n\nUn groupe de diffusion WhatsApp bien géré permet de sécuriser des courses régulières et des livraisons de colis récurrentes.`,
          order: 1,
        },
      ],
      quiz: {
        title: 'Validation Mois 5 — Marketing',
        passScore: 70,
        questions: [
          {
            question: 'Quel est le meilleur outil de communication direct pour une PME au Cameroun ?',
            options: ['Un panneau d’autoroute très cher', 'WhatsApp Business avec catalogue produit', 'Un fax', 'La télévision'],
            correctIndex: 1,
            explanation: 'WhatsApp est le canal universel et instantané pour échanger avec ses clients au Cameroun.',
            order: 1,
          },
        ],
      },
    },
    {
      month: 6,
      title: 'Management & Recrutement',
      description: 'Créer des emplois et recruter d’autres conducteurs ou assistants.',
      durationMinutes: 100,
      order: 6,
      iconName: 'groups',
      lessons: [
        {
          title: 'Déléguer et recruter un collaborateur',
          description: 'Fixer des règles claires et un contrat de confiance.',
          durationMinutes: 20,
          contentType: LessonContentType.AUDIO,
          audioUrl: 'https://assets.benskinimpact.cm/audio/m6_lesson1.mp3',
          markdownContent: `### Devenir employeur responsable\n\nLe passage à une flotte de 3 ou 5 motos exige des contrats écrits, un suivi de maintenance préventive et le respect mutuel.`,
          order: 1,
        },
      ],
      quiz: {
        title: 'Validation Mois 6 — Examen Final Certification',
        passScore: 80,
        questions: [
          {
            question: 'Quelle est la clé d’une relation saine avec un conducteur employé ?',
            options: ['Ne rien signer', 'Fixer des objectifs de versement clairs et assurer la maintenance de la moto', 'Garder la moto sans vidange', 'Changer les règles chaque semaine'],
            correctIndex: 1,
            explanation: 'La clarté contractuelle et un engin bien entretenu garantissent la fidélité et la sécurité de l’employé.',
            order: 1,
          },
        ],
      },
    },
  ];

  for (const m of modulesData) {
    const savedModule = await prisma.courseModule.upsert({
      where: { month: m.month },
      create: {
        month: m.month,
        title: m.title,
        description: m.description,
        durationMinutes: m.durationMinutes,
        order: m.order,
        iconName: m.iconName,
      },
      update: {
        title: m.title,
        description: m.description,
        durationMinutes: m.durationMinutes,
      },
    });

    for (const l of m.lessons) {
      const existingLesson = await prisma.courseLesson.findFirst({
        where: { moduleId: savedModule.id, order: l.order },
      });
      if (!existingLesson) {
        await prisma.courseLesson.create({
          data: {
            moduleId: savedModule.id,
            title: l.title,
            description: l.description,
            durationMinutes: l.durationMinutes,
            contentType: l.contentType,
            audioUrl: l.audioUrl,
            markdownContent: l.markdownContent,
            order: l.order,
          },
        });
      }
    }

    const existingQuiz = await prisma.quiz.findFirst({ where: { moduleId: savedModule.id } });
    if (!existingQuiz) {
      const quiz = await prisma.quiz.create({
        data: {
          moduleId: savedModule.id,
          title: m.quiz.title,
          passScore: m.quiz.passScore,
        },
      });

      for (const q of m.quiz.questions) {
        await prisma.quizQuestion.create({
          data: {
            quizId: quiz.id,
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            explanation: q.explanation,
            order: q.order,
          },
        });
      }
    }
  }
  console.log('[OK] 6 modules de formation, leçons et quiz initialisés');

  // 2. OFFRES DE RECRUTEMENT PARTENAIRES
  const jobsData = [
    {
      title: 'Conducteur de livraison express (E-Commerce)',
      company: 'Jumia / Logistique Cameroun',
      sector: 'Livraison Urbaine',
      location: 'Douala (Akwa, Bonapriso, Deido)',
      salaryHint: '120 000 - 180 000 FCFA / mois',
      requirements: 'Permis A valide, CNI, téléphone smartphone Android, bonne connaissance de Douala.',
      description: 'Prise en charge de tournées quotidiennes de distribution de colis pour des clients e-commerce. Carburant et entretien partiel pris en charge par le partenaire.',
    },
    {
      title: 'Chef d’équipe flotte 5 motos',
      company: 'Transport Express Sud',
      sector: 'Gestion de Flotte',
      location: 'Yaoundé (Mvan, Nsam)',
      salaryHint: '150 000 FCFA + primes sur objectifs',
      requirements: 'Conducteur certifié Benskin Impact, minimum 3 ans d’expérience, rigueur financière.',
      description: 'Supervision des vérifications techniques quotidiennes, encadrement des conducteurs juniors et transmission des états de versement journaliers.',
    },
    {
      title: 'Livreur courses alimentaires & restaurants',
      company: 'Glotelho Quick Express',
      sector: 'Restauration & Retail',
      location: 'Yaoundé (Bastos, Omnisports, Melen)',
      salaryHint: '4 000 à 7 000 FCFA / jour garanti',
      requirements: 'Moto en excellent état avec top-case isotherme (fourni sous caution), ponctualité exemplaire.',
      description: 'Livraison de commandes express en moins de 35 minutes au cœur de Yaoundé. Horaires flexibles.',
    },
  ];

  for (const j of jobsData) {
    const existing = await prisma.jobOffer.findFirst({ where: { title: j.title } });
    if (!existing) {
      await prisma.jobOffer.create({ data: j });
    }
  }
  console.log('[OK] Offres de recrutement partenaires initialisées');

  // 3. PROJET TEST & SINISTRE ACCIDENT POUR L'UTILISATEUR TEST
  const testUser = await prisma.user.findUnique({ where: { phone: '+237690000001' } });
  if (testUser) {
    // Projet d'entreprise
    const existingProject = await prisma.project.findFirst({ where: { userId: testUser.id } });
    if (!existingProject) {
      const proj = await prisma.project.create({
        data: {
          userId: testUser.id,
          title: 'Atelier mécanique moderne & Pièces détachées d’origine',
          sector: 'Mécanique & Commerce',
          city: 'Yaoundé',
          locationDetail: 'Carrefour Emombo, Rue Principale',
          estimatedBudget: 1500000,
          personalContribution: 300000,
          grantRequested: 1200000,
          status: ProjectStatus.UNDER_REVIEW,
          description: 'Création d’un atelier équipé avec outillage professionnel pneumatique et stock de pièces certifiées (bougies NGK, kits chaînes renforcés, pneus tubeless). L’atelier permettra de former 2 apprentis conducteurs dès la première année.',
          businessPlan: {
            monthlyRevenueEstimate: 450000,
            monthlyCostsEstimate: 210000,
            netMonthlyMargin: 240000,
            jobsCreated: 3,
          },
          reviewFeedback: 'Dossier bien documenté. En cours d’instruction par le comité de dotation.',
        },
      });

      await prisma.projectMilestone.createMany({
        data: [
          { projectId: proj.id, title: 'Validation du bail commercial et aménagement de l’atelier', amount: 400000, isCompleted: true, completedAt: new Date() },
          { projectId: proj.id, title: 'Acquisition du stock initial de pièces motos', amount: 500000, isCompleted: false },
          { projectId: proj.id, title: 'Recrutement et formation des 2 apprentis', amount: 300000, isCompleted: false },
        ],
      });
      console.log('[OK] Projet d’entreprise test initialisé avec jalons');
    }

    // Dossier d'accident / solidarité
    const existingClaim = await prisma.accidentClaim.findFirst({ where: { userId: testUser.id } });
    if (!existingClaim) {
      const claimDate = new Date();
      claimDate.setDate(claimDate.getDate() - 10);

      await prisma.accidentClaim.create({
        data: {
          userId: testUser.id,
          reference: 'ACC-2026-YDE-042',
          date: claimDate,
          location: 'Yaoundé, Axe Carrefour Nlongkak',
          severity: AccidentSeverity.LIGHT,
          thirdPartyInvolved: true,
          hospitalName: 'Hôpital Central de Yaoundé (Urgences)',
          description: 'Accrochage avec un véhicule particulier à faible allure. Entorse de la cheville droite et dégâts sur le rétroviseur et le guidon. Soins d’urgence et radiographie réalisés le jour même.',
          status: AccidentClaimStatus.APPROVED,
          requestedAmount: 45000,
          approvedAmount: 45000,
          reviewNotes: 'Dossier complet, factures validées par le médecin conseil de la mutuelle. Prise en charge 100% accordée.',
        },
      });
      console.log('[OK] Dossier d’assistance accident test initialisé (APPROVED, 45 000 FCFA)');
    }

    // Certificat test
    const existingCert = await prisma.certification.findFirst({ where: { userId: testUser.id } });
    if (!existingCert) {
      await prisma.certification.create({
        data: {
          userId: testUser.id,
          certificateNumber: 'CERT-BENSKIN-2026-0892',
          title: 'Certificat d’Entrepreneur Responsable & Sécurité Routière',
          issuedAt: new Date(),
          verificationHash: 'b4a89f92e31c4b778a6234f9a0c7e2b1',
        },
      });
      console.log('[OK] Certificat d’entrepreneur test initialisé');
    }
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedModulesData(prisma)
    .then(() => console.log('Seed des modules terminé avec succès.'))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
