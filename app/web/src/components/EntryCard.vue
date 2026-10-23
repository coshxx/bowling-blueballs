<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '../api';
import { formatDate, formatDateTime } from '../format';
import type { Entry, EntryStatus } from '../types';
import ScoreTable from './ScoreTable.vue';

const props = defineProps<{ entry: Entry }>();
const emit = defineEmits<{ changed: [] }>();

const STATUS_LABELS: Record<EntryStatus, string> = {
  pending: 'Wartet',
  running: 'Wird verarbeitet',
  review: 'Zu prüfen',
  approved: 'Freigegeben',
  failed: 'Fehlgeschlagen',
};

const busy = ref(false);
const error = ref<string | null>(null);

/** Freigegeben: Spiele mit Spielernamen; sonst das Rohergebnis des Modells */
const rows = computed(() =>
  props.entry.status === 'approved'
    ? props.entry.games.map((g) => ({ name: g.playerName, frames: g.frames, avatar: { name: g.playerName, url: g.avatarUrl } }))
    : (props.entry.result?.players ?? []),
);

async function run(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = null;
  try {
    await action();
    emit('changed');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function reprocess() {
  void run(() => api.reprocess(props.entry.id));
}

function remove() {
  if (confirm('Eintrag mit Foto endgültig löschen?')) {
    void run(() => api.deleteEntry(props.entry.id));
  }
}
</script>

<template>
  <article class="entry" :class="`status-${entry.status}`">
    <div class="head">
      <a v-if="entry.imageUrl" :href="entry.imageUrl" target="_blank" rel="noopener" title="Bild in voller Größe öffnen">
        <img :src="entry.imageUrl" alt="Foto der Anzeige" class="thumb" loading="lazy" />
      </a>
      <div v-else class="thumb no-photo" aria-hidden="true">🎳</div>
      <div class="meta">
        <strong>Spiel vom {{ formatDate(entry.playedOn) }}</strong>
        <span class="badge">
          {{ STATUS_LABELS[entry.status] }}<template v-if="entry.status === 'review' && entry.uncertain"> · unsicher</template>
          <template v-if="entry.isTeamGame"> · Teamspiel</template>
          <template v-if="entry.source"> · Import</template>
        </span>
        <small>
          Hochgeladen {{ formatDateTime(entry.createdAt) }}<template v-if="entry.uploader"> von {{ entry.uploader }}</template>
          <template v-if="entry.status === 'approved' && entry.approvedBy"> · freigegeben von {{ entry.approvedBy }}</template>
        </small>
      </div>
      <div class="actions">
        <RouterLink
          v-if="entry.status === 'review' || entry.status === 'approved'"
          :to="{ name: 'entry', params: { id: entry.id } }"
          role="button"
          class="small"
          :class="{ outline: !entry.can.approve }"
        >
          {{ entry.can.approve ? 'Prüfen' : 'Ansehen' }}
        </RouterLink>
        <button v-if="entry.can.reprocess" type="button" class="small secondary outline" :disabled="busy" @click="reprocess">
          Neu analysieren
        </button>
        <button v-if="entry.can.delete" type="button" class="small secondary outline" :disabled="busy" @click="remove">
          Löschen
        </button>
      </div>
    </div>

    <ScoreTable v-if="rows.length" :players="rows" />
    <p v-if="entry.status === 'failed'" class="msg-error">{{ entry.error }}</p>
    <p v-if="error" class="msg-error">{{ error }}</p>
  </article>
</template>

<style scoped>
.entry {
  border-left: 0.35rem solid var(--status-color);
}
.status-pending { --status-color: var(--status-pending); }
.status-running { --status-color: var(--status-running); }
.status-review { --status-color: var(--status-review); }
.status-approved { --status-color: var(--status-approved); }
.status-failed { --status-color: var(--status-failed); }

.head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
}
.head:last-child {
  margin-bottom: 0;
}
.meta {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 12rem;
}
.thumb {
  width: 120px;
  height: 90px;
  object-fit: cover;
  border-radius: var(--pico-border-radius);
}
.no-photo {
  display: grid;
  place-items: center;
  font-size: 2rem;
  background: var(--pico-card-sectioning-background-color);
}
.badge {
  color: var(--status-color);
  font-weight: 600;
}
</style>
