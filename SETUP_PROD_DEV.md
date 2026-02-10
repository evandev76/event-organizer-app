# Setup dev "prod refactor" (Postgres + Prisma + server_prod)

## Prerequis
- Node >= 18
- Internet (pour `npm install`)

## 1) Installer deps
```bash
npm install
```

Si tu as une erreur DNS (`ENOTFOUND registry.npmjs.org`), verifie ta connexion/proxy/DNS.

## 2) Lancer Postgres

### Option A (recommandee sur Mac): Postgres via Homebrew
Tu as deja fait:
```bash
brew install postgresql
brew services start postgresql
```

Ensuite, cree un user + une DB (exemple):
```bash
createuser -s kifekoi 2>/dev/null || true
createdb kifekoi 2>/dev/null || true
psql -d postgres -c "ALTER USER kifekoi WITH PASSWORD 'kifekoi';" || true
```

### Option B: Postgres via Docker
```bash
docker compose up -d db
```

## 3) Config env
Copie `.env.example` en `.env` puis:
- mettre `DATABASE_URL`:
  - brew/homebrew: `postgresql://kifekoi:kifekoi@localhost:5432/kifekoi?schema=public`
  - docker compose: `postgresql://kifekoi:kifekoi@localhost:5432/kifekoi?schema=public`
- mettre `SESSION_SECRET` (random long)
- laisser `MAILER_MODE=console` pour dev

## 4) Migrations Prisma
```bash
npm install
npx prisma migrate dev
```

## 5) Lancer le backend "prod"
```bash
npm run dev:prod
```

Endpoints utiles:
- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/password/reset/request` (log lien en console)
