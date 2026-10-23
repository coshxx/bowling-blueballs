/**
 * Einmaliger Import der Aufzeichnung 2025 (prisma/import/2025.json) in eine Gruppe.
 *
 *   node dist/scripts/import-2025.js --group <id> --dry-run   # nur anzeigen
 *   node dist/scripts/import-2025.js --group <id>             # importieren
 *
 * Pro Spieltag entsteht ein freigegebener Eintrag ohne Foto (Entry.source). Spieler werden über Name oder
 * Alias gefunden, sonst ohne Konto neu angelegt; Zusammenlegen geht danach im Admin-Bereich.
 * Rückgängig: die Einträge mit dieser Herkunft löschen.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isComplete, runningScores, validateFrames } from '../common/bowling';
import { normalizeAlias } from '../players/players.service';

interface ImportFile {
  source: string;
  description: string;
  days: { playedOn: string; games: { player: string; frames: number[][]; score: number }[] }[];
}

function parseArgs(argv: string[]) {
  const groupIdx = argv.indexOf('--group');
  const groupId = groupIdx >= 0 ? Number(argv[groupIdx + 1]) : NaN;
  if (!Number.isInteger(groupId)) {
    throw new Error('Aufruf: import-2025.js --group <id> [--dry-run]');
  }
  return { groupId, dryRun: argv.includes('--dry-run') };
}

async function main() {
  const { groupId, dryRun } = parseArgs(process.argv.slice(2));
  const data = JSON.parse(readFileSync(join(__dirname, '../../prisma/import/2025.json'), 'utf8')) as ImportFile;

  // Datei prüfen, bevor irgendetwas geschrieben wird
  for (const day of data.days) {
    for (const g of day.games) {
      validateFrames(g.frames);
      const score = runningScores(g.frames).at(-1);
      if (!isComplete(g.frames) || score !== g.score) {
        throw new Error(`${day.playedOn} ${g.player}: Frames ergeben ${score}, erwartet ${g.score}.`);
      }
    }
  }

  const prisma = new PrismaClient();
  try {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new Error(`Gruppe ${groupId} gibt es nicht.`);
    }
    if (await prisma.entry.count({ where: { groupId, source: data.source } })) {
      throw new Error(`„${data.source}“ ist in „${group.name}“ schon importiert.`);
    }

    const players = await prisma.player.findMany({ where: { groupId, isTeam: false }, include: { aliases: true } });
    const names = [...new Set(data.days.flatMap((d) => d.games.map((g) => g.player)))];
    const matches = new Map(
      names.map((name) => [
        name,
        players.find(
          (p) => p.name.toLowerCase() === name.toLowerCase() || p.aliases.some((a) => a.alias === normalizeAlias(name)),
        ),
      ]),
    );

    const games = data.days.reduce((n, d) => n + d.games.length, 0);
    console.log(`${data.description}`);
    console.log(`Gruppe „${group.name}“: ${data.days.length} Spieltage, ${games} Spiele`);
    for (const [name, p] of matches) {
      const count = data.days.reduce((n, d) => n + d.games.filter((g) => g.player === name).length, 0);
      console.log(`  ${name.padEnd(12)} → ${p ? `${p.name} (#${p.id})` : 'neu anlegen'}  ${count} Spiele`);
    }
    if (dryRun) {
      console.log('Probelauf, nichts geschrieben.');
      return;
    }

    await prisma.$transaction(async (tx) => {
      const ids = new Map<string, number>();
      for (const [name, p] of matches) {
        ids.set(name, p?.id ?? (await tx.player.create({ data: { groupId, name } })).id);
      }
      for (const day of data.days) {
        await tx.entry.create({
          data: {
            groupId,
            source: data.source,
            playedOn: day.playedOn,
            status: 'approved',
            // Mittags am Spieltag, damit die Fotoliste chronologisch bleibt
            createdAt: new Date(`${day.playedOn}T12:00:00Z`),
            approvedAt: new Date(),
            games: {
              create: day.games.map((g, position) => ({
                playerId: ids.get(g.player)!,
                position,
                displayName: g.player,
                frames: JSON.stringify(g.frames),
                score: g.score,
                complete: true,
                playedOn: day.playedOn,
              })),
            },
          },
        });
      }
    });
    console.log('Importiert.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
