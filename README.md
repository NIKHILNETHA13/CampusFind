# CampusFind

Campus Lost & Found platform for students and administrators.

## Features

- **Report lost/found items** with images, categories, locations, and handover preferences
- **Claim items** — students express interest with messages and availability notes
- **Dashboard** — track your reported items, claims, and mark items as returned
- **Notifications** — see all interest on your items and your submitted claims in one place
- **Admin panel** — manage users, view all items and claims
- **JWT authentication** with role-based access (Student / Admin)
- **Image uploads** (≤5 MB, JPEG/PNG/GIF/WebP) with persistent Docker volume storage

## Technology Stack

- **Frontend**: HTML, CSS, Vanilla JavaScript (served via Nginx)
- **Backend**: Python 3.11, FastAPI, Uvicorn
- **Database**: PostgreSQL 16 (raw SQL via psycopg2, no ORM)
- **Auth**: JWT (HS256), bcrypt password hashing
- **Containerization**: Docker, Docker Compose

## Project Structure

```
CampusFind/
├── backend/           # FastAPI application
│   ├── main.py        # API routes, models, static file serving
│   ├── database.py    # PostgreSQL connection (DATABASE_URL + individual params)
│   ├── auth.py        # Password hashing (bcrypt)
│   ├── tokens.py      # JWT creation/validation
│   └── uploads/       # Runtime upload directory (gitignored)
├── frontend/          # Static HTML/CSS/JS
│   ├── index.html
│   ├── items.html
│   ├── item.html
│   ├── report.html
│   ├── claim.html
│   ├── dashboard.html
│   ├── notifications.html
│   ├── admin.html
│   ├── login.html
│   ├── register.html
│   ├── css/style.css
│   └── js/app.js
├── database/
│   └── schema.sql     # PostgreSQL schema (auto-loaded on first DB init)
├── tests/             # Test scripts
├── Dockerfile         # Backend image
├── Dockerfile.frontend # Frontend (Nginx) image
├── docker-compose.yml # Multi-service orchestration
├── requirements.txt   # Python dependencies
├── .env.example       # Environment variable template
├── .gitignore
└── README.md
```

## Local Development with Docker

### Prerequisites
- Docker & Docker Compose

### Quick Start

```bash
# 1. Copy environment template and edit if needed
cp .env.example .env

# 2. Start all services
docker compose up -d --build

# 3. Open in browser
# Frontend:     http://localhost:3000
# API Docs:     http://localhost:8000/docs
# Adminer (DB): http://localhost:8080
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| frontend | 3000 | Nginx serving static files |
| api | 8000 | FastAPI backend |
| db | internal | PostgreSQL (not exposed to host) |
| adminer | 8080 | Web-based DB admin (optional) |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key (generate: `python -c "import secrets; print(secrets.token_hex(32))"`) | — |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime | `60` |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | PostgreSQL credentials (Docker) | `campususer` / `campuspass` / `campusfind` |
| `DATABASE_URL` | Full Postgres connection string for Docker | auto from above |
| `UPLOAD_DIR` | Upload path inside container | `/app/backend/uploads` |
| `ADMIN_INVITE_CODE` | Code to register as admin | `<set-a-private-admin-invite-code>` |

### Persistence

- **Database**: Named volume `postgres_data` → `/var/lib/postgresql/data`
- **Uploads**: Named volume `uploads_data` → `/app/backend/uploads`

Both survive `docker compose down` / `up` cycles.

## Local Development without Docker

```bash
# Backend
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
python -m http.server 3000
```

Requires local PostgreSQL with credentials matching `.env`.

## Deployment (Ubuntu / Azure VM)

```bash
# On the VM
git clone <your-repo-url>
cd CampusFind
cp .env.example .env
# Edit .env with production secrets
docker compose up -d --build
```

### Security Notes

- **Never commit `.env`** — contains secrets (JWT key, DB passwords)
- **Never commit SSH keys** (`*.pem`, `*.key`)
- PostgreSQL port (5432) is **not exposed** to the host in production compose
- Use strong `SECRET_KEY` in production (32+ random bytes)
- Consider adding a reverse proxy (Traefik/nginx) with HTTPS for production

## Admin Access

Register with `ADMIN_INVITE_CODE` (set in `.env`) to create an admin account. Default: `<set-a-private-admin-invite-code>`.

## License

MIT