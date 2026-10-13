<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import LineChart, { type Series } from '../components/LineChart.vue';
import { formatDate, formatNumber, formatPercent } from '../format';
import { currentGroup, session } from '../session';
import type { GroupStats } from '../types';

const MAX_SERIES = 8;

const stats = ref<GroupStats | null>(null);
const error = ref<string | null>(null);

async function load() {
  stats.value = null;
  if (!currentGroup.value) return;
  try {
    stats.value = await api.stats(currentGroup.value.id);
    error.value = null;
  } catch (e) {
    error.value = (e as Error).message;
  }
}

const leaderboard = computed(() => stats.value?.players.filter((p) => p.games >= stats.value!.leaderboardMinGames) ?? []);

/** Farbe folgt dem Spieler: Slot nach Spieler-ID, nicht nach Rang. Mehr als 8 Spieler passen nicht ins Diagramm. */
const chartSeries = computed<Series[]>(() => {
  if (!stats.value) return [];
  const byId = [...stats.value.players].sort((a, b) => a.playerId - b.playerId).slice(0, MAX_SERIES);
  return byId.map((p, i) => ({
    id: p.playerId,
    name: p.name,
    slot: i + 1,
    points: stats.value!.timeline
      .filter((t) => t.averages[p.playerId] !== undefined)
      .map((t) => ({ date: t.date, value: t.averages[p.playerId] })),
  }));
});
const hiddenInChart = computed(() => Math.max(0, (stats.value?.players.length ?? 0) - MAX_SERIES));
const dates = computed(() => stats.value?.timeline.map((t) => t.date) ?? []);

watch(() => session.groupId, load, { immediate: true });
</script>

<template>
  <article v-if="!currentGroup">Du bist noch in keiner Gruppe. Ein Admin muss dich aufnehmen.</article>

  <template v-else>
    <h2>Statistik · {{ currentGroup.name }}</h2>
    <p v-if="error" class="msg-error">{{ error }}</p>
    <p v-else-if="stats && stats.players.length === 0">
      Noch keine freigegebenen, vollständigen Spiele. Sobald Einträge geprüft und freigegeben sind, erscheint hier die Statistik.
    </p>

    <template v-else-if="stats">
      <section>
        <h3>Bestenliste</h3>
        <p v-if="leaderboard.length === 0" class="muted">
          Für die Bestenliste braucht ein Spieler mindestens {{ stats.leaderboardMinGames }} Spiele.
        </p>
        <ol v-else class="leaderboard">
          <li v-for="p in leaderboard" :key="p.playerId">
            <strong>{{ p.name }}</strong> – Schnitt {{ formatNumber(p.average) }}
            <small class="muted">({{ p.games }} Spiele)</small>
          </li>
        </ol>
        <small class="muted">Sortiert nach Schnitt, ab {{ stats.leaderboardMinGames }} Spielen.</small>
      </section>

      <section>
        <h3>Spieler</h3>
        <div class="overflow-auto">
          <table class="stats striped">
            <thead>
              <tr>
                <th>Spieler</th>
                <th>Spiele</th>
                <th>Schnitt</th>
                <th>Bestes</th>
                <th>Schlechtestes</th>
                <th>Strikes</th>
                <th>Spares</th>
                <th>Offen</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in stats.players" :key="p.playerId">
                <th scope="row">{{ p.name }}</th>
                <td>{{ p.games }}</td>
                <td><strong>{{ formatNumber(p.average) }}</strong></td>
                <td>{{ p.best }}</td>
                <td>{{ p.worst }}</td>
                <td>{{ formatPercent(p.strikeRate) }}</td>
                <td>{{ formatPercent(p.spareRate) }}</td>
                <td>{{ formatPercent(p.openRate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <small class="muted">
          Nur freigegebene, vollständige Spiele. Strikes: Anteil der Frames mit Strike. Spares: Anteil der Frames ohne Strike,
          die per Spare abgeräumt wurden. Offen: Anteil der Frames ohne Strike oder Spare.
        </small>
      </section>

      <section>
        <h3>Verlauf des Schnitts</h3>
        <article>
          <LineChart :series="chartSeries" :dates="dates" />
          <small v-if="hiddenInChart" class="muted">
            {{ hiddenInChart }} weitere Spieler sind nur in der Tabelle, das Diagramm zeigt höchstens {{ MAX_SERIES }}.
          </small>
        </article>
        <details>
          <summary>Verlauf als Tabelle</summary>
          <div class="overflow-auto">
            <table class="stats">
              <thead>
                <tr>
                  <th>Spielabend</th>
                  <th v-for="s in chartSeries" :key="s.id">{{ s.name }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in stats.timeline" :key="t.date">
                  <th scope="row">{{ formatDate(t.date) }}</th>
                  <td v-for="s in chartSeries" :key="s.id">
                    {{ t.averages[s.id] !== undefined ? formatNumber(t.averages[s.id]) : '–' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </template>
  </template>
</template>

<style scoped>
.muted {
  color: var(--pico-muted-color);
}
section {
  margin-bottom: 2rem;
}
.stats {
  font-variant-numeric: tabular-nums;
}
.stats td {
  white-space: nowrap;
}
.leaderboard li {
  margin-bottom: 0.25rem;
}
</style>
