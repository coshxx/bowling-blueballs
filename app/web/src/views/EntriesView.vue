<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from '../api';
import EntryCard from '../components/EntryCard.vue';
import { dateFromFilename, todayYmd } from '../format';
import { currentGroup, session } from '../session';
import type { Entry } from '../types';

const entries = ref<Entry[]>([]);
const filter = ref<'all' | 'review'>('all');
const loadError = ref<string | null>(null);

const fileInput = ref<HTMLInputElement | null>(null);
const playedOn = ref(todayYmd());
const uploading = ref(false);
const uploadMessage = ref<string | null>(null);
const uploadError = ref<string | null>(null);

async function load() {
  if (!currentGroup.value) {
    entries.value = [];
    return;
  }
  try {
    entries.value = await api.listEntries(currentGroup.value.id, filter.value === 'review' ? 'review' : undefined);
    loadError.value = null;
  } catch (e) {
    loadError.value = (e as Error).message;
  }
}

function onFileChange() {
  const file = fileInput.value?.files?.[0];
  if (file) {
    playedOn.value = dateFromFilename(file.name) ?? todayYmd();
  }
}

const MAX_EDGE = 2000;

/** Handy-Fotos (oft 5–12 MB) vor dem Upload verkleinern; bei jedem Problem geht das Original raus */
async function shrink(file: File): Promise<File> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/png' && file.type !== 'image/webp') return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024) {
      bmp.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

async function upload() {
  const file = fileInput.value?.files?.[0];
  if (!file || !currentGroup.value) {
    uploadError.value = 'Bitte zuerst ein Bild auswählen.';
    return;
  }
  uploading.value = true;
  uploadMessage.value = null;
  uploadError.value = null;
  try {
    await api.upload(currentGroup.value.id, await shrink(file), playedOn.value);
    uploadMessage.value = 'Hochgeladen. Das Bild wird im Hintergrund verarbeitet – mit F5 aktualisieren.';
    fileInput.value!.value = '';
    playedOn.value = todayYmd();
    await load();
  } catch (e) {
    uploadError.value = (e as Error).message;
  } finally {
    uploading.value = false;
  }
}

watch([() => session.groupId, filter], load, { immediate: true });
</script>

<template>
  <template v-if="!currentGroup">
    <article v-if="session.me?.user.isAdmin">
      Es gibt noch keine Gruppe. Lege in der <RouterLink :to="{ name: 'admin' }">Verwaltung</RouterLink> eine an.
    </article>
    <article v-else>Du bist noch in keiner Gruppe. Ein Admin muss dich aufnehmen.</article>
  </template>

  <template v-else>
    <article v-if="currentGroup.canUpload">
      <form @submit.prevent="upload">
        <div class="grid">
          <label>
            Foto der Anzeige
            <input
              ref="fileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              :disabled="uploading"
              @change="onFileChange"
            />
            <small>JPG, PNG oder WebP, maximal 20 MB. Hochladen in „{{ currentGroup.name }}“.</small>
          </label>
          <label>
            Spieldatum
            <input v-model="playedOn" type="date" required :disabled="uploading" />
            <small>Wird aus dem Dateinamen übernommen, wenn möglich.</small>
          </label>
        </div>
        <button type="submit" :aria-busy="uploading" :disabled="uploading">Hochladen</button>
      </form>
      <p v-if="uploadMessage" class="msg-ok">{{ uploadMessage }}</p>
      <p v-if="uploadError" class="msg-error">{{ uploadError }}</p>
    </article>

    <div class="filter" role="group">
      <button type="button" :class="{ outline: filter !== 'all' }" @click="filter = 'all'">Alle</button>
      <button type="button" :class="{ outline: filter !== 'review' }" @click="filter = 'review'">Zu prüfen</button>
    </div>

    <p v-if="loadError" class="msg-error">Einträge konnten nicht geladen werden: {{ loadError }}</p>
    <p v-else-if="entries.length === 0">{{ filter === 'review' ? 'Nichts zu prüfen.' : 'Noch keine Einträge.' }}</p>
    <EntryCard v-for="entry in entries" :key="entry.id" :entry="entry" @changed="load" />
  </template>
</template>

<style scoped>
.filter {
  max-width: 20rem;
}
</style>
