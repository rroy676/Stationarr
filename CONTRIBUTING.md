# Contributing to Stationarr

Thanks for your interest in contributing!

Stationarr uses a dual-license model:

- community/open-source use under the GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`); and
- separate commercial licenses for users or organizations that need different terms.

Before contributing code, documentation, examples, designs, or other materials, please read [CONTRIBUTOR_TERMS.md](CONTRIBUTOR_TERMS.md).

By opening a pull request or otherwise submitting a contribution, you confirm that you agree to the contributor terms. These terms allow the project to keep accepting community contributions while preserving the ability to offer commercial licenses.

## Ways to contribute

- **Bug reports** — open an issue with steps to reproduce
- **Feature requests** — open an issue describing the use case
- **Pull requests** — bug fixes and small improvements welcome
- **Documentation** — setup guides, examples, troubleshooting notes, and screenshots are welcome

## Before opening a PR

- Read and agree to [CONTRIBUTOR_TERMS.md](CONTRIBUTOR_TERMS.md)
- Open an issue first for large changes so we can discuss the approach
- Keep PRs focused — one feature or fix per PR
- Test your changes with Docker before submitting
- Do not include real provider credentials, private playlist URLs, M3U URLs, EPG URLs, JWT secrets, database files, or copyrighted channel lists
- Do not include unauthorized IPTV streams, paid channel lists, or piracy-related resources

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

## Licensing of contributions

Contributions are accepted under the terms described in [CONTRIBUTOR_TERMS.md](CONTRIBUTOR_TERMS.md).

In summary:

- contributions are licensed for open-source use under `AGPL-3.0-or-later`; and
- contributors also grant permission for their contributions to be used and relicensed as part of Stationarr under separate commercial license terms.

This helps keep Stationarr open source while allowing commercial licenses for businesses that need terms other than AGPL.

## Reporting security issues

Please do not open public issues for security vulnerabilities.

Read [SECURITY.md](SECURITY.md) and email the maintainer directly instead.