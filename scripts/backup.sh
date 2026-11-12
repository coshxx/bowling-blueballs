#!/usr/bin/env bash
# Backup der Prod-Daten (Volume bowling_data): konsistenter DB-Snapshot + Bilder + Avatare → ~/backups/bowling/<datum>/
# Cron, z. B. nachts um 3:30:  30 3 * * * <repo>/scripts/backup.sh >> ~/backups/bowling/backup.log 2>&1
set -euo pipefail

VOLUME=${VOLUME:-bowling_data}
DEST_ROOT=${DEST_ROOT:-$HOME/backups/bowling}
KEEP_DAYS=${KEEP_DAYS:-14}
# Irgendein Image mit Python reicht; das Parser-Image ist ohnehin lokal vorhanden
IMAGE=${IMAGE:-bowling-parser:local}

dest="$DEST_ROOT/$(date +%F)"
mkdir -p "$dest"

# VACUUM INTO liefert einen konsistenten Snapshot, auch wenn die App gerade schreibt
docker run --rm --network none --user "$(id -u):$(id -g)" \
  -v "$VOLUME:/data:ro" -v "$dest:/backup" \
  "$IMAGE" python -c "
import os, shutil, sqlite3
if os.path.exists('/backup/bowling.db'):
    os.remove('/backup/bowling.db')
sqlite3.connect('file:/data/bowling.db?mode=ro', uri=True).execute(\"VACUUM INTO '/backup/bowling.db'\")
for d in ('images', 'avatars'):
    if os.path.isdir(f'/data/{d}'):
        shutil.copytree(f'/data/{d}', f'/backup/{d}', dirs_exist_ok=True)
"

# Weitere Ziele (Samba, rclone, …) hier anhängen, z. B.: rsync -a "$dest" /mnt/nas/bowling/

find "$DEST_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +
echo "$(date -Is) Backup nach $dest"
