# Kifekoi

Application web simple pour fixer des evenements entre amis, avec **groupes via lien d'invitation**.

## Fonctionnalites

- Groupes: creer un groupe -> obtient un **code** + un lien `?g=CODE` a partager
- Rejoindre: entrer un code (ou ouvrir directement le lien)
- Evenements: creation / modification / suppression + description
- Discussion: fil de messages par evenement (pseudo + message)
- Calendrier: vue mois + clic sur une date -> liste du jour + clic sur un evenement -> details
- Notifications: rappel X minutes avant (uniquement tant que la page est ouverte)
- Export `.ics`: ajout dans Google/Apple/Outlook Calendar

## Lancer en local

```bash
cd /Users/stage/kifekoi
npm install
npm run dev
```

Ensuite: `http://localhost:5173`

## Refactor "Production Ready" (en cours)

Docs:
- `PROD_REFACTOR_TASKS.md`: checklist de taches (validee) avant changements majeurs
- `PROD_REFACTOR_SPEC.md`: spec Phase 0 (flows auth/onboarding, schema cible)

Scaffolding:
- Postgres local: `docker compose up -d db`
- Prisma schema: `prisma/schema.prisma`
- Backend "prod" (nouveau, en parallele du legacy): `server_prod/index.js`
  - Start (apres installation deps + DB): `npm run dev:prod`

## Donnees

- Evenements partages: stockes cote serveur dans `data/db.json`
- Cote navigateur: memorisation des groupes deja utilises (localStorage)
