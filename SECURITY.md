# Security Policy

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Report security issues by emailing the maintainer directly:

**rroy676@gmail.com**

Please include as much detail as possible:

- a clear description of the issue;
- steps to reproduce the issue;
- affected version, branch, or commit if known;
- deployment type, such as Docker, Docker Compose, or bare metal;
- potential impact;
- logs, screenshots, or proof-of-concept details if safe to share;
- any suggested fix, if known.

## Supported versions

Until Stationarr reaches a stable release, only the latest version on the `main` branch is supported.

## Public playlist and EPG URLs

Stationarr serves playlist and EPG outputs through bearer-style URLs. Anyone with access to a served URL may be able to access that playlist or EPG output. Keep these URLs private and regenerate credentials if you believe they were exposed.

Do not post screenshots or logs that reveal:

- provider URLs;
- M3U playlist URLs;
- XMLTV/EPG URLs;
- Xtream usernames or passwords;
- served Stationarr playlist URLs;
- JWT secrets;
- database files or backups.

## Docker socket warning

Some optional scraper-management workflows may require access to the Docker socket.

Mounting `/var/run/docker.sock` into a container can give that container broad control over Docker on the host. Only enable Docker socket access on trusted self-hosted systems, and avoid exposing Stationarr to untrusted networks when this feature is enabled.

If you do not need UI-managed scraper control, remove or comment out the Docker socket mount in `docker-compose.yml`.