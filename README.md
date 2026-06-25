<div align="center">

# Fuze

**Self-hosted music streaming platform that unifies Spotify, YouTube Music, Yandex Music, and other sources into one place.**

[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.136+-009688.svg)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

---

## About

Fuze is a self-hosted music streaming service. Search via Yandex Music, pull audio
from YouTube, store it in MinIO — one interface for all of it.

**Key features:**

- **Unified search** — find tracks across multiple platforms from one search bar
- **Smart caching** — Redis-backed caching for search results and YouTube URLs
- **S3 storage** — MinIO integration for self-hosted audio storage
- **Modular backend** — auth, users, tracks: each is an independent module you can
  toggle on or off
- **Frontend** — Next.js 16 + React 19 + Tailwind CSS with a full player UI
- **CLI tooling** — manage Docker, modules, database migrations, and integrations
  from the terminal
  
---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand |
| **Database** | PostgreSQL 18 |
| **Cache** | Redis 7 |
| **Object Storage** | MinIO (S3-compatible) |
| **Auth** | JWT via AuthX, Argon2 password hashing |
| **Integrations** | Yandex Music API, yt-dlp / asyncyt |
| **Infra** | Docker Compose, uv (Python package manager) |

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python package manager)
- [Node.js 18+](https://nodejs.org/) (for frontend dev)
- [Python 3.12+](https://www.python.org/downloads/)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/fuze.git
cd fuze

# Install Python dependencies
uv sync

# Activate venv
Windows:
  .venv/Scripts/activate.ps1
Linux:
  source .venv/bin/activate

# Create your .env from the example
project env init
```

### Configuration

Edit `.env` and set the required values:

```env.example
# Your API public URL
API_PUBLIC_URL="example.com"

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=database
TEST_DB_HOST=localhost

REDIS_URL=redis://localhost:6379/0

# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
JWT_SECURITY_KEY="CHANGE-THIS-PLEASE"

# Yandex Music (get token via CLI: project env setup yandex)
YANDEX_ACCESS_TOKEN=

# CORS settings
# change example.com to your public frontend domain
CORS_ORIGINS=["https://example.com","http://localhost:3000"]
CORS_ALLOW_CREDENTIALS=true
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]

# Tokens configuration
ACCESS_TOKEN_EXPIRES=15
REFRESH_TOKEN_EXPIRES=30

# MinIO S3 configuration
MINIO_ENDPOINT=localhost:9000
MINIO_EXTERNAL_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=tracks
MINIO_SECURE=false

# DEBUG
DEBUG=true
```

### Running

**With Docker (recommended):**

```bash
docker compose up -d
```

This starts all services: PostgreSQL, Redis, MinIO, backend, and frontend.

**Local development:**

```bash
# Start infrastructure services only
docker compose up -d db redis minio

# Run database migrations
cd src/backend
alembic upgrade head

# Start the backend
uvicorn main:app --host 0.0.0.0 --port 8000

# In another terminal, start the frontend
cd src/frontend
npm run dev
```

### Access

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger Docs | http://localhost:8000/docs |
| MinIO Console | http://localhost:9001 |

---

## CLI

The project ships with a CLI tool for managing infrastructure, modules, and integrations.

```bash
# Show project info, container status, and active modules
project info

# Manage Docker services
project docker up
project docker down
project docker logs

# Manage database migrations
project db migrate
project db rollback

# Toggle backend modules
project module toggle tracks

# Manage users
project users create # use to create admin user

# Initialize .env from .env.example
project env init

# Set up Yandex Music integration (device auth flow)
project env setup yandex
```

---

## Project Structure

```
fuze/
├── src/
│   ├── backend/
│   │   ├── core/              # Framework: settings, modules, security, exceptions
│   │   ├── database/          # SQLAlchemy engine, session, base model
│   │   ├── integrations/      # External services: Yandex, YouTube, Redis cache, MinIO storage
│   │   ├── modules/
│   │   │   ├── auth/          # JWT authentication
│   │   │   ├── users/         # User management
│   │   │   └── tracks/        # Track search, download, streaming
│   │   ├── alembic/           # Database migrations
│   │   └── main.py            # FastAPI application entry point
│   ├── cli/                   # Project CLI tool (Typer + Rich)
│   └── frontend/              # Next.js application
├── docker-compose.yml
├── pyproject.toml
└── uv.lock
```

---

## Modules

The backend uses a modular architecture. Each module lives in `src/backend/modules/` and can be independently enabled or disabled via `module.py`:

| Module | Description |
|--------|-------------|
| `auth` | JWT authentication, login, registration, token refresh |
| `users` | User profiles and role-based access control |
| `tracks` | Search across Yandex Music, download via YouTube, stream from MinIO |

---

## WARNING
The frontend was completely vibecoded, I'm a backend developer, not a frontend developer.

## License

MIT
