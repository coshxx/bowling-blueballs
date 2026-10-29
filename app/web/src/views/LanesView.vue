<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../api';
import UserAvatar from '../components/UserAvatar.vue';
import { formatDateTime } from '../format';
import type { Lane, LanePerson, Lanes } from '../types';

const props = defineProps<{ id: number }>();

const lanes = ref<Lanes | null>(null);
const loadError = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
/** Wer mitspielt; gilt nur für den nächsten Wurf */
const playing = ref<Set<number>>(new Set());

const current = computed(() => lanes.value?.rounds[0] ?? null);
const history = computed(() => lanes.value?.rounds.slice(1) ?? []);

function setLanes(l: Lanes) {
  const first = lanes.value === null;
  lanes.value = l;
  // Beim ersten Laden sind alle Teilnehmer ausgewählt; später bleibt die Auswahl bestehen, soweit es die Leute noch gibt
  const ids = new Set(l.attendees.map((a) => a.playerId));
  playing.value = first ? ids : new Set([...playing.value].filter((p) => ids.has(p)));
}

async function load() {
  try {
    setLanes(await api.getLanes(props.id));
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
}

async function run(action: () => Promise<Lanes>) {
  busy.value = true;
  error.value = null;
  try {
    setLanes(await action());
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

function toggle(playerId: number) {
  const next = new Set(playing.value);
  if (!next.delete(playerId)) next.add(playerId);
  playing.value = next;
}

function roll() {
  if (current.value && !confirm('Die aktuelle Verteilung verwerfen und neu auslosen? Sie bleibt im Verlauf sichtbar.')) return;
  void run(() => api.rollLanes(props.id, [...playing.value]));
}

function moveTo(person: LanePerson, lane: Lane) {
  void run(() => api.assignLane(props.id, person.playerId, lane));
}

void load();
</script>

<template>
  <p><RouterLink :to="{ name: 'evening', params: { id } }">← Zurück zum Abend</RouterLink></p>
  <p v-if="loadError" class="msg-error">{{ loadError }}</p>

  <template v-if="lanes">
    <h2>Bahnen auslosen</h2>
    <p v-if="error" class="msg-error">{{ error }}</p>

    <article v-if="lanes.canRoll">
      <header>Wer spielt mit?</header>
      <div class="players">
        <label v-for="p in lanes.attendees" :key="p.playerId" class="with-avatar">
          <input type="checkbox" :checked="playing.has(p.playerId)" @change="toggle(p.playerId)" />
          <UserAvatar :name="p.playerName" :url="p.avatarUrl" :size="24" />{{ p.playerName }}
        </label>
      </div>
      <button type="button" :disabled="busy || playing.size < 2" @click="roll">
        🎲 {{ current ? 'Neu auslosen' : 'Auslosen' }}
      </button>
      <small v-if="playing.size < 2" class="muted">Mindestens zwei Spieler auswählen.</small>
    </article>
    <p v-else class="muted">
      {{ lanes.open ? 'Auslosen dürfen nur Teilnehmer des Abends mit eigenem Konto.' : 'Der Abend ist abgerechnet, die Bahnen sind gesperrt.' }}
    </p>

    <template v-if="current">
      <h3>
        Runde {{ current.number }}
        <small class="muted">· {{ current.createdBy ?? 'unbekannt' }}, {{ formatDateTime(current.createdAt) }}</small>
      </h3>
      <div class="lanes">
        <article v-for="lane in (['left', 'right'] as const)" :key="lane">
          <header>{{ lane === 'left' ? 'Links' : 'Rechts' }}</header>
          <ul>
            <li v-for="p in current[lane]" :key="p.playerId">
              <span class="with-avatar"><UserAvatar :name="p.playerName" :url="p.avatarUrl" :size="32" />{{ p.playerName }}</span>
              <button
                v-if="lanes.canRoll"
                type="button"
                class="secondary outline small"
                :disabled="busy"
                @click="moveTo(p, lane === 'left' ? 'right' : 'left')"
              >
                {{ lane === 'left' ? '→' : '←' }}
              </button>
            </li>
            <li v-if="!current[lane].length" class="muted">Niemand</li>
          </ul>
        </article>
      </div>

      <article v-if="lanes.unassigned.length">
        <header>Noch ohne Bahn</header>
        <ul>
          <li v-for="p in lanes.unassigned" :key="p.playerId">
            <span class="with-avatar"><UserAvatar :name="p.playerName" :url="p.avatarUrl" :size="32" />{{ p.playerName }}</span>
            <span v-if="lanes.canRoll" class="actions">
              <button type="button" class="secondary outline small" :disabled="busy" @click="moveTo(p, 'left')">Links</button>
              <button type="button" class="secondary outline small" :disabled="busy" @click="moveTo(p, 'right')">Rechts</button>
            </span>
          </li>
        </ul>
      </article>
    </template>

    <template v-if="history.length">
      <h3>Verlauf</h3>
      <article v-for="r in history" :key="r.id">
        <header>
          Runde {{ r.number }}
          <small class="muted">· {{ r.createdBy ?? 'unbekannt' }}, {{ formatDateTime(r.createdAt) }}</small>
        </header>
        <p><strong>Links:</strong> {{ r.left.map((p) => p.playerName).join(', ') || '–' }}</p>
        <p><strong>Rechts:</strong> {{ r.right.map((p) => p.playerName).join(', ') || '–' }}</p>
      </article>
    </template>
  </template>
</template>

<style scoped>
.players {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  margin-bottom: 1rem;
}
.players label {
  margin: 0;
}
.lanes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
@media (max-width: 480px) {
  .lanes {
    gap: 0.5rem;
  }
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.25rem 0;
}
</style>
