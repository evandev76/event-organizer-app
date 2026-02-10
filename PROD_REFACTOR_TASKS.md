# Refactoring "Production Ready" (Postgres + React + Auth)

Ce fichier est une **liste de taches a valider** avant de commencer les changements.
Une fois approuve, on executera les phases dans l'ordre.

## Decisions a valider (bloquantes)

- Auth:
  - [x] Auth par **email + mot de passe** (sans verification email) pour V1
  - [ ] Ajout verification email (V2) ou pas
  - [ ] Mot de passe oublie (reset) en V1 ou V2
- Sessions:
  - [x] Sessions **cookie httpOnly** (recommande) et stockage DB
  - [ ] JWT (non recommande pour ce cas, mais possible)
- Stack DB/ORM:
  - [x] Postgres + Prisma (recommande)
  - [ ] Postgres + Drizzle
- Acces via lien:
  - [x] Ouvrir un lien d'invitation redirige vers login/signup puis acceptance de l'invite
  - [ ] Autoriser lecture sans compte (read-only) puis login requis pour ecrire
- Model "amis":
  - [ ] "Amis" = utilisateurs membres d'un groupe (pas une liste globale)
  - [x] Ajout d'une vraie liste d'amis globale (V2 -> on l'inclut dans V1)

## Decisions restantes (a trancher rapidement)

- Verification email:
  - [x] Non (V1) / Oui (V2)
  - [ ] Oui des le V1
- Mot de passe oublie:
  - [ ] Non (V1) / Oui (V2)
  - [x] Oui des le V1

## Phase 0: Etat des lieux + spec

- [ ] Lister toutes les features actuelles (groupes, events, chats, reactions, sondage, notes, meteo, hub).
- [ ] Definir les exigences "prod" minimales:
  - [ ] environnement (dev/staging/prod)
  - [ ] securite (cookies, CSRF, rate limit, hashing)
  - [ ] perfs (pagination, index)
  - [ ] observabilite (logs, health, metrics optionnel)
- [ ] Fixer les flows UX:
  - [ ] signup
  - [ ] login
  - [ ] onboarding (pseudo, notification, ville meteo, rejoindre/creer)
  - [ ] acceptance d'invitation de groupe

## Phase 1: Base backend "prod" (Postgres + migrations)

- [ ] Ajouter infra dev: `docker-compose.yml` (postgres) + `.env.example`.
- [ ] Ajouter ORM + migrations:
  - [ ] Initialiser Prisma/Drizzle
  - [ ] Creer migration initiale
- [ ] Ajouter scaffolding serveur "prod" (side-by-side):
  - [ ] `server_prod/` avec routes auth + groupes + amis (base)
  - [ ] Script `npm run dev:prod`
- [ ] Creer un schema DB (tables + indexes) couvrant:
  - [ ] users
  - [ ] sessions
  - [ ] groups
  - [ ] group_memberships (role: owner/admin/member)
  - [ ] group_invites (token, expiry)
  - [ ] friends (relation globale)
  - [ ] friend_requests (pending/accepted/declined/cancelled)
  - [ ] blocks (optionnel, mais recommande)
  - [ ] events
  - [ ] event_comments
  - [ ] reactions (event_comment_reactions, group_message_reactions)
  - [ ] group_chat_messages
  - [ ] pins
  - [ ] event_ratings
  - [ ] polls (event_poll, poll_options, poll_votes) (ou table votes)
  - [ ] preferences (notification, weather)
- [ ] Ajouter indexes importants (ex: `group_code`, `event_start`, `created_at`).
- [ ] Conserver un endpoint `/api/health` + ajout `/api/version`.

## Phase 2: Auth complete (signup/login/logout) + securite

- [ ] Endpoints auth:
  - [ ] `POST /api/auth/signup`
  - [ ] `POST /api/auth/login`
  - [ ] `POST /api/auth/logout`
  - [ ] `GET /api/me`
- [ ] Password reset (V1):
  - [ ] `POST /api/auth/password/reset/request`
  - [ ] `POST /api/auth/password/reset/confirm`
  - [ ] Table tokens reset + expiration + usage unique
  - [ ] Integration mailer:
    - [ ] Dev: mailer console (log lien)
    - [ ] Prod: provider (Resend/Postmark/Sendgrid) + templates
- [ ] Hash password (bcrypt/argon2) + policy minimale (longueur, anti-trivial).
- [ ] Sessions:
  - [ ] cookie httpOnly, secure en prod, sameSite
  - [ ] rotation session a login
  - [ ] expiration et revoke
- [ ] Protections:
  - [ ] validation input (Zod)
  - [ ] rate limiting sur auth
  - [ ] helmet / headers
  - [ ] CSRF (si cookies cross-site; sinon sameSite strict/lax + double submit si besoin)
- [ ] RBAC:
  - [ ] seuls membres peuvent voir un groupe
  - [ ] createur event peut modifier/supprimer event
  - [ ] droits moderation messages event: owner event (ou owner groupe) selon spec

## Phase 3: API refactor "resource oriented" + pagination

- [ ] Normaliser routes et payloads (versions si besoin).
- [ ] Ajouter pagination/limites:
  - [ ] chat groupe (cursor ou limit/offset)
  - [ ] commentaires event
- [ ] Ajouter endpoints invites:
  - [ ] creer invite (owner/admin)
  - [ ] accepter invite via token (apres login)
- [ ] Ajouter endpoints "hub":
  - [ ] lister groupes de l'utilisateur
  - [ ] lister membres (amis) d'un groupe
  - [ ] lister amis globaux
  - [ ] rechercher un ami (par email ou pseudo) + envoyer demande
  - [ ] accepter/refuser/annuler demande d'ami
  - [ ] supprimer un ami
  - [ ] bloquer/debloquer (si retenu)

## Phase 4: Migration data (db.json -> Postgres)

- [ ] Ecrire script de migration:
  - [ ] importer groupes/events/messages/commentaires/reactions/pins/ratings/polls
  - [ ] strategie pour auteurs legacy (pseudo) -> users:
    - [ ] option A: creer users "ghost" (non login)
    - [ ] option B: stocker legacy author string sans user
- [ ] Tester migration sur une copie du fichier.
- [ ] Documenter rollback.

## Phase 5: Frontend React (Vite) + design system leger

- [ ] Creer app React (Vite) dans `client/` ou `web/`.
- [ ] Routing:
  - [ ] `/login`
  - [ ] `/signup`
  - [ ] `/onboarding`
  - [ ] `/app` (hub)
  - [ ] `/g/:code` (groupe + calendrier)
- [ ] Data fetching:
  - [ ] React Query (recommande) + cache invalidation
- [ ] UI:
  - [ ] conserver theme violet/jaune + glow
  - [ ] composants: Calendar, EventModal, ChatThread, Poll, HubGroups, FriendsList
  - [ ] composants amis globaux: FriendsPage, FriendRequests, AddFriendDialog
- [ ] Gestion erreurs + toasts (au lieu `alert`)
- [ ] Accessibilite basique (focus, aria).

## Phase 6: Onboarding complet (adapte a Kifekoi)

- [ ] Ecran 1: choisir pseudo (displayName) + avatar optionnel.
- [ ] Ecran 2: rejoindre un groupe via lien/code OU creer.
- [ ] Ecran 3: preferences:
  - [ ] notifications (expliquer limites web)
  - [ ] ville meteo pour le groupe (si conserve)
- [ ] Re-entrance: si utilisateur deja configure, sauter onboarding.

## Phase 7: Tests + CI + qualite

- [ ] Tests backend (unit + integration):
  - [ ] auth
  - [ ] permissions (RBAC)
  - [ ] events CRUD
  - [ ] chat + reactions + polls
- [ ] Tests frontend (smoke) + e2e Playwright:
  - [ ] signup -> onboarding -> creer event -> chat -> sondage
- [ ] Lint/format:
  - [ ] eslint + prettier
- [ ] CI (GitHub Actions):
  - [ ] tests
  - [ ] build
  - [ ] migrations check

## Phase 8: Deploiement (staging/prod)

- [ ] Dockerfile(s):
  - [ ] backend
  - [ ] frontend build (static)
- [ ] `docker-compose.prod.yml` (ou instructions plateforme)
- [ ] Secrets/env:
  - [ ] `DATABASE_URL`
  - [ ] `SESSION_SECRET`
  - [ ] `PUBLIC_BASE_URL`
- [ ] Run migrations on deploy.
- [ ] Monitoring basique:
  - [ ] request logging
  - [ ] health checks

## Definition of Done (V1 prod)

- [ ] Donnees en Postgres, aucune dependance a `data/db.json`.
- [ ] Auth login/signup + sessions securisees.
- [ ] Onboarding complet (pseudo + join/create group).
- [ ] React app remplace `index.html`/vanilla UI.
- [ ] Permissions ok (membres, createur event, edition/suppression messages).
- [ ] Tests critiques passent.
- [ ] Deploiement documente.
