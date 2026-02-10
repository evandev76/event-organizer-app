# Spec "Production Ready" (Kifekoi)

Ce document est la **spec de Phase 0**: il clarifie l'existant, la cible, les flows UX, et les grands choix techniques.
La checklist executable reste dans `PROD_REFACTOR_TASKS.md`.

## 1) Inventaire fonctionnel (app actuelle)

- Groupes:
  - Creation d'un groupe -> code court + lien `?g=CODE`
  - Rejoindre un groupe via code/lien
  - Memorisation locale de groupes (client)
  - Quitter / supprimer de la liste locale
- Evenements:
  - Creation/modification/suppression
  - Calendrier mensuel + liste par jour
  - Export `.ics`
  - Notifications (tant que page ouverte)
  - Createur-only edit/delete
- Discussions:
  - Chat de groupe (thread global)
  - Chat par evenement (commentaires)
  - Reactions emoji sur messages
  - Appui long -> modifier/supprimer (selon droits)
  - Badge createur (event) sur ses messages
- Sondage (evenement):
  - 1 sondage par evenement, creation par createur, vote par membres
- Rating post-event:
  - Pouce up/down par participants (definition actuelle: createur ou personne ayant commente)
- Meteo:
  - Ville par groupe (pref locale) + icones (soleil/pluie)
- Hub:
  - Liste de groupes memorises + "amis" infere (pseudos detectes)

## 2) Objectifs V1 "prod"

- Stockage: Postgres (transactionnel, concurrent, durable), plus de `data/db.json`.
- Auth: email + mot de passe, sessions cookies httpOnly.
- Onboarding: adapte au produit (displayName, rejoindre/creer, prefs utiles).
- Liens d'invitation: fonctionner meme si l'utilisateur n'est pas connecte.
- Amis: vraie liste globale (pas seulement "membres du groupe").
- Qualite: validations, pagination, securite minimale, tests critiques, deploy documente.

## 3) Non-objectifs (V1)

- Verification email (V2).
- Temps reel (websocket/SSE) (V2).
- Multi-tenant enterprise (SAML, SCIM) (hors scope).

## 4) Model utilisateur + identite

- `User`:
  - `id`
  - `email` (unique)
  - `passwordHash`
  - `displayName` (pseudo visible)
  - `createdAt`
- `Session` (cookie httpOnly):
  - `id` (opaque)
  - `userId`
  - `createdAt`, `expiresAt`, `revokedAt?`
  - `ip?`, `userAgent?` (optionnel)

## 5) Groupes + invitations

- `Group`:
  - `id`
  - `code` (unique, court) pour compat avec `?g=CODE`
  - `name`
  - `createdAt`
- `GroupMembership`:
  - `groupId`, `userId`
  - `role`: `owner | admin | member`
  - `createdAt`
- `GroupInvite`:
  - `token` (random, non devinable)
  - `groupId`
  - `createdByUserId`
  - `expiresAt`
  - `maxUses?` + `usedCount` (optionnel)

Flow lien:
- Si un user ouvre `...?g=CODE` ou `/invite/:token`:
  - non connecte: redirect -> login/signup en gardant `returnTo` + info invite
  - connecte: accepter l'invite -> creer membership -> redirect vers page groupe

## 6) Evenements + discussions + droits

- `Event`:
  - `id`, `groupId`
  - `title`, `description`
  - `startAt`, `endAt`
  - `reminderMinutes`
  - `createdByUserId`
  - `createdAt`, `updatedAt`
- Event permissions:
  - edit/delete event: `createdByUserId` uniquement (comme aujourd'hui)
  - moderation messages event: a specifier
    - proposition V1: createur event peut supprimer n'importe quel message dans SON event
    - option V1 bis: owner/admin du groupe peut moderer partout

- `EventComment`:
  - `id`, `eventId`, `userId`
  - `text`
  - `createdAt`, `updatedAt?`

- `GroupChatMessage`:
  - `id`, `groupId`, `userId`
  - `kind`: `text | system | event`
  - `text`, `eventId?`
  - `createdAt`, `updatedAt?`

Reactions:
- Tables `EventCommentReaction` / `GroupMessageReaction`:
  - `(messageId, userId, emoji)` unique

Pins:
- Table `GroupPinnedEvent` ou champ `position`/`pinnedAt`:
  - `(groupId, eventId)` unique

## 7) Sondages

1 sondage par event:
- `EventPoll` (0..1 par event): `question`, `createdByUserId`, `createdAt`
- `EventPollOption`: `text`, order
- `EventPollVote`: `(pollId, userId)` unique -> `optionId`

## 8) Rating post-event

- `EventRating`:
  - `(eventId, userId)` unique
  - `value`: `1 | -1`
  - `createdAt`

Participants:
- V1: meme regle qu'aujourd'hui (createur ou a commente) ou regle "membre du groupe present" ?
  - recommandation: **membre du groupe** peut voter apres fin (simple)
  - alternative: garder la regle actuelle

## 9) Amis globaux (V1)

Objectif: permettre une liste d'amis independante des groupes.

Proposition de model:
- `FriendRequest`:
  - `id`, `fromUserId`, `toUserId`
  - `status`: `pending | accepted | declined | cancelled`
  - `createdAt`, `updatedAt`
- `Friend` (ou vue derivee de FriendRequest accepted):
  - table explicite `(userIdA, userIdB)` unique (ordonnee)

Anti-abus (recommande avec amis globaux):
- `Block`:
  - `(blockerUserId, blockedUserId)` unique
  - empeche requests + cache dans recherche
- Rate limit "add friend"

UX:
- Ajouter ami par email exact (plus simple, moins de fuite)
- Page "Demandes d'amis" (entrantes/sortantes)

## 10) Password reset (V1)

Endpoints:
- `POST /api/auth/password/reset/request` (email)
- `POST /api/auth/password/reset/confirm` (token + nouveau mdp)

DB:
- `PasswordResetToken`: `tokenHash`, `userId`, `expiresAt`, `usedAt?`

Mailer:
- integration a choisir (Resend/Postmark/Sendgrid)
- en dev: "console mailer" (log le lien)

## 11) Frontend React (structure)

Routes:
- `/login`, `/signup`
- `/reset-password` (request) + `/reset-password/:token` (confirm)
- `/onboarding`
- `/app` (hub: groupes + amis globaux)
- `/g/:code` (calendrier + day panel + chat groupe)
- Support query compat `?g=`: redirect vers `/g/:code` ou acceptance d'invite.

Data fetching:
- React Query + fetch wrapper (cookies).

## 12) Securite (V1)

- Cookies sessions: httpOnly, secure en prod, sameSite (Lax/Strict selon deploy).
- CORS: desactive ou strictement limite au domaine frontend.
- Validation: Zod sur toutes les routes.
- Rate limiting: auth + friend requests + geocode/meteo.
- Headers: Helmet.
- CSRF: si SPA et API meme domaine + sameSite strict/lax + origin check, suffisant pour V1.

