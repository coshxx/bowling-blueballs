<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from './api';
import ScoreTable from './components/ScoreTable.vue';
import { formatDateTime } from './format';
import type { Entry, EntryStatus } from './types';

const STATUS_LABELS: Record<EntryStatus, string> = {
  pending: 'Wartet',
  running: 'Wird verarbeitet',
  done: 'Fertig',
  uncertain: 'Unsicher',
  failed: 'Fehlgeschlagen',
};

const entries = ref<Entry[]>([]);
const loadError = ref<string | null>(null);

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadMessage = ref<string | null>(null);
const uploadError = ref<string | null>(null);

async function load() {
  try {
    entries.value = await api.listEntries();
    loadError.value = null;
  } catch (e) {
    loadError.value = (e as Error).message;
  }
}

const FINISHED: EntryStatus[] = ['done', 'uncertain', 'failed'];
const reprocessing = ref<number | null>(null);
const reprocessError = ref<{ id: number; message: string } | null>(null);

async function reprocess(entry: Entry) {
  reprocessing.value = entry.id;
  reprocessError.value = null;
  try {
    await api.reprocess(entry.id);
    await load();
  } catch (e) {
    reprocessError.value = { id: entry.id, message: (e as Error).message };
  } finally {
    reprocessing.value = null;
  }
}

async function upload() {
  const file = fileInput.value?.files?.[0];
  if (!file) {
    uploadError.value = 'Bitte zuerst ein Bild auswählen.';
    return;
  }
  uploading.value = true;
  uploadMessage.value = null;
  uploadError.value = null;
  try {
    await api.upload(file);
    uploadMessage.value = 'Hochgeladen. Das Bild wird im Hintergrund verarbeitet – mit F5 aktualisieren.';
    fileInput.value!.value = '';
    await load();
  } catch (e) {
    uploadError.value = (e as Error).message;
  } finally {
    uploading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="container">
    <h1>Bowling-Ergebnisse</h1>

    <article>
      <form @submit.prevent="upload">
        <label>
          Foto der Anzeige
          <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" :disabled="uploading" />
          <small>JPG, PNG oder WebP, maximal 20 MB.</small>
        </label>
        <button type="submit" :aria-busy="uploading" :disabled="uploading">Hochladen</button>
      </form>
      <p v-if="uploadMessage" class="msg-ok">{{ uploadMessage }}</p>
      <p v-if="uploadError" class="msg-error">{{ uploadError }}</p>
    </article>

    <p v-if="loadError" class="msg-error">Einträge konnten nicht geladen werden: {{ loadError }}</p>
    <p v-else-if="entries.length === 0">Noch keine Einträge.</p>

    <article v-for="entry in entries" :key="entry.id" class="entry" :class="`status-${entry.status}`">
      <div class="entry-head">
        <a :href="entry.imageUrl" target="_blank" rel="noopener" title="Bild in voller Größe öffnen">
          <img :src="entry.imageUrl" alt="Foto der Anzeige" class="thumb" loading="lazy" />
        </a>
        <div>
          <strong>{{ formatDateTime(entry.createdAt) }}</strong>
          <br />
          <span class="badge">{{ STATUS_LABELS[entry.status] }}</span>
        </div>
        <button
          v-if="FINISHED.includes(entry.status)"
          type="button"
          class="secondary outline reprocess"
          :aria-busy="reprocessing === entry.id"
          :disabled="reprocessing !== null"
          @click="reprocess(entry)"
        >
          Neu analysieren
        </button>
      </div>
      <p v-if="reprocessError?.id === entry.id" class="msg-error">{{ reprocessError.message }}</p>

      <ScoreTable v-if="entry.result" :players="entry.result.players" />

      <div v-if="entry.status === 'uncertain'" class="msg-warn">
        <p>Das Ergebnis passt nicht vollständig zu den Zwischenständen auf der Anzeige:</p>
        <ul>
          <li v-for="(p, i) in entry.problems" :key="i">{{ p }}</li>
        </ul>
      </div>
      <p v-if="entry.status === 'failed'" class="msg-error">{{ entry.error }}</p>
    </article>
  </main>
</template>

<style scoped>
.entry {
  border-left: 0.35rem solid var(--status-color);
}
.status-pending { --status-color: var(--status-pending); }
.status-running { --status-color: var(--status-running); }
.status-done { --status-color: var(--status-done); }
.status-uncertain { --status-color: var(--status-uncertain); }
.status-failed { --status-color: var(--status-failed); }

.entry-head:last-child {
  margin-bottom: 0;
}
.entry-head {
  display: flex;
  margin-bottom: 1rem;
  align-items: center;
  gap: 1rem;
}
.reprocess {
  margin-left: auto;
  width: auto;
  padding: 0.4rem 0.8rem;
  font-size: 0.875rem;
}
.thumb {
  width: 120px;
  height: 90px;
  object-fit: cover;
  border-radius: var(--pico-border-radius);
}
.badge {
  color: var(--status-color);
  font-weight: 600;
}
.msg-ok { color: var(--status-done); }
.msg-error { color: var(--status-failed); }
.msg-warn { color: var(--status-uncertain); margin-top: 1rem; }
.msg-warn ul { margin-bottom: 0; }
.msg-warn li { list-style: disc; }
</style>
