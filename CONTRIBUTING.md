# Contributing to Stationarr

Thanks for your interest in contributing!

## Ways to contribute

- **Bug reports** — open an issue with steps to reproduce
- **Feature requests** — open an issue describing the use case
- **Pull requests** — bug fixes and small improvements welcome

## Before opening a PR

- Open an issue first for large changes so we can discuss the approach
- Keep PRs focused — one feature or fix per PR
- Test your changes with Docker before submitting

## Development setup

```bash
git clone https://github.com/YOUR_USERNAME/Stationarr.git
cd Stationarr
cp .env.example .env

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && npm run dev
```

The frontend dev server runs on port 5173 with hot reload.
The backend runs on port 3000 (set in .env).

## Stack

- **Backend**: Node.js, Express, better-sqlite3
- **Frontend**: React, Vite, no component library
- **Database**: SQLite (single file, zero config)
- **Deployment**: Docker + Docker Compose

## Code style

- No linter configured — match the existing style
- Keep components focused and small
- Backend routes follow REST conventions

## Reporting security issues

Please do not open public issues for security vulnerabilities.
Email the maintainer directly instead.
