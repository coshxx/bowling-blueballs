# 🎳 Bowling

Bowling-Abende einer Gruppe: Ergebnis-Fotos hochladen (lokales Vision-Modell liest die Punkte aus), Statistik und Abrechnung.

NestJS + Prisma (SQLite) · Vue 3 + Vite · Python-Parser mit Ollama · Tailscale Funnel

## Entwicklung

```sh
docker compose up -d
```

- App: `http://<rechner>:8000`, mit Live-Reload für Frontend und API
- Daten liegen in `./data`, Registrierung ohne Einladungscode
- Parser-Änderungen: `docker compose up -d --build parser`
- Einzelbild parsen: `IMAGE=./bild.jpg docker compose run --rm parser-cli` → `./out.json`

## Produktion

Läuft als eigenes Compose-Projekt `bowling` mit eigenen Daten (Volume `bowling_data`), parallel zur Dev-Umgebung möglich. Die Ollama-Modelle werden mit Dev geteilt (Volume `bowling2_ollama-models`). Läuft Dev noch nie, vorher einmal `docker volume create bowling2_ollama-models`.

Einmalig:

1. `cp .env.example .env` und ausfüllen (Tailscale-Auth-Key, `SESSION_SECRET` per `openssl rand -hex 32`, `REGISTER_CODE`)
2. Tailscale-Admin-Konsole: HTTPS aktiviert, Funnel in der Policy erlaubt (`nodeAttrs` mit `funnel`)

Starten bzw. aktualisieren:

```sh
docker compose -f compose.prod.yaml up -d --build
```

Danach:

- URL: `https://bowling.<tailnet>.ts.net` (steht unter *Machines* in der Tailscale-Konsole)
- Sofort als `cosh` registrieren (wird über `ADMIN_USERS` Admin), dann den Einladungscode an die Gruppe geben
- In der Konsole beim Gerät `bowling` → „…“ → **Disable key expiry**, sonst fliegt der Node nach 180 Tagen raus
- Logs: `docker compose -f compose.prod.yaml logs -f app`

Am Host wird kein Port geöffnet: Die App lauscht nur auf `127.0.0.1:8000` im Netzwerk-Namespace des Tailscale-Containers, erreichbar ist sie ausschließlich über den Funnel.

### Backup

`scripts/backup.sh` legt einen konsistenten DB-Snapshot und die Bilder unter `~/backups/bowling/<datum>/` ab und löscht Backups, die älter als 14 Tage sind. Einrichten:

```sh
mkdir -p ~/backups/bowling
crontab -e
# 30 3 * * * /home/cosh/projects/bowling2/scripts/backup.sh >> ~/backups/bowling/backup.log 2>&1
```

Wiederherstellen: Prod stoppen, dann Snapshot und Bilder zurück ins Volume kopieren:

```sh
docker compose -f compose.prod.yaml stop app
docker run --rm -v bowling_data:/data -v ~/backups/bowling/<datum>:/backup alpine \
  sh -c 'cp /backup/bowling.db /data/ && cp -r /backup/images /data/ && chown -R 1000:1000 /data'
docker compose -f compose.prod.yaml start app
```
