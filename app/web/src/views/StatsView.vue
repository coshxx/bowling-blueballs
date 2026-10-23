<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import LineChart, { type Series } from '../components/LineChart.vue';
import UserAvatar from '../components/UserAvatar.vue';
import { formatDate, formatNumber, formatPercent } from '../format';
import { currentGroup, session } from '../session';
import type { GroupStats, StatsSummary } from '../types';

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
function seriesOf(summary: StatsSummary): Series[] {
  const byId = [...summary.players].sort((a, b) => a.playerId - b.playerId).slice(0, MAX_SERIES);
  return byId.map((p, i) => ({
    id: p.playerId,
    name: p.name,
    avatarUrl: p.avatarUrl,
    slot: i + 1,
    points: summary.timeline
      .filter((t) => t.averages[p.playerId] !== undefined)
      .map((t) => ({ date: t.date, value: t.averages[p.playerId] })),
  }));
}

const chartSeries = computed(() => (stats.value ? seriesOf(stats.value) : []));
const hiddenInChart = computed(() => Math.max(0, (stats.value?.players.length ?? 0) - MAX_SERIES));
const dates = computed(() => stats.value?.timeline.map((t) => t.date) ?? []);

const teams = computed(() => stats.value?.teams.players ?? []);
const teamSeries = computed(() => (stats.value ? seriesOf(stats.value.teams) : []));
const hiddenTeams = computed(() => Math.max(0, teams.value.length - MAX_SERIES));
const teamDates = computed(() => stats.value?.teams.timeline.map((t) => t.date) ?? []);

watch(() => session.groupId, load, { immediate: true });
</script>

<template>
  <article v-if="!currentGroup">Du bist noch in keiner Gruppe. Ein Admin muss dich aufnehmen.</article>

  <template v-else>
    <h2>Statistik · {{ currentGroup.name }}</h2>
    <p v-if="error" class="msg-error">{{ error }}</p>
    <p v-else-if="stats && stats.players.length === 0 && teams.length === 0">
      Noch keine freigegebenen, vollständigen Spiele. Sobald Einträge geprüft und freigegeben sind, erscheint hier die Statistik.
    </p>

    <template v-else-if="stats">
      <template v-if="stats.players.length">
        <section>
          <h3>Bestenliste</h3>
          <p v-if="leaderboard.length === 0" class="muted">
            Für die Bestenliste braucht ein Spieler mindestens {{ stats.leaderboardMinGames }} Spiele.
          </p>
          <ol v-else class="leaderboard">
            <li v-for="p in leaderboard" :key="p.playerId">
              <span class="with-avatar">
                <UserAvatar :name="p.name" :url="p.avatarUrl" :size="48" /><strong>{{ p.name }}</strong>
              </span>
              – Schnitt {{ formatNumber(p.average) }}
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
                  <th scope="row">
                    <span class="with-avatar"><UserAvatar :name="p.name" :url="p.avatarUrl" :size="32" />{{ p.name }}</span>
                  </th>
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

      <section v-if="teams.length">
        <h3>Teamspiele</h3>
        <div class="overflow-auto">
          <table class="stats striped">
            <thead>
              <tr>
                <th>Team</th>
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
              <tr v-for="t in teams" :key="t.playerId">
                <th scope="row">
                  <span class="with-avatar"><UserAvatar :name="t.name" :url="t.avatarUrl" :size="32" />{{ t.name }}</span>
                </th>
                <td>{{ t.games }}</td>
                <td><strong>{{ formatNumber(t.average) }}</strong></td>
                <td>{{ t.best }}</td>
                <td>{{ t.worst }}</td>
                <td>{{ formatPercent(t.strikeRate) }}</td>
                <td>{{ formatPercent(t.spareRate) }}</td>
                <td>{{ formatPercent(t.openRate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <article>
          <LineChart :series="teamSeries" :dates="teamDates" />
          <small v-if="hiddenTeams" class="muted">
            {{ hiddenTeams }} weitere Teams sind nur in der Tabelle, das Diagramm zeigt höchstens {{ MAX_SERIES }}.
          </small>
        </article>
        <small class="muted">Teamspiele zählen nur hier, nicht in der Einzelstatistik.</small>
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
  margin-bottom: 0.5rem;
}
</style>
