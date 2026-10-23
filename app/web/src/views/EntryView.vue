<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { frameError, frameSymbols, isComplete, normalizeAlias, parseFrame, runningScores } from '../bowling';
import ScoreTable from '../components/ScoreTable.vue';
import { formatDate } from '../format';
import { session } from '../session';
import type { ApprovePlayer, Entry, FrameMark, Player, ResultPlayer } from '../types';

const props = defineProps<{ id: number }>();
const router = useRouter();

const NEW_PLAYER = '__new__';

interface EditorRow {
  displayName: string;
  frameTexts: string[];
  /** Markierungen des Parsers; fällt weg, sobald der Frame von Hand geändert wird */
  marks: FrameMark[];
  /** Vom Modell gelesene Zwischenstände (leer bei manuell hinzugefügten Zeilen) */
  readScores: number[];
  /** Spieler-ID als String, NEW_PLAYER oder '' (noch nicht zugeordnet) */
  mapping: string;
  newPlayerName: string;
}

const entry = ref<Entry | null>(null);
const players = ref<Player[]>([]);
const rows = ref<EditorRow[]>([]);
const playedOn = ref('');
const loadError = ref<string | null>(null);
const busy = ref(false);
const submitError = ref<string | null>(null);

const editable = computed(() => entry.value?.status === 'review' && entry.value.can.approve);

function playerForAlias(displayName: string): Player | undefined {
  const alias = normalizeAlias(displayName);
  return players.value.find((p) => p.aliases.some((a) => a.alias === alias));
}

function makeRow(displayName: string, frames: number[][], readScores: number[], texts?: string[], marks?: FrameMark[]): EditorRow {
  const known = playerForAlias(displayName);
  return {
    displayName,
    frameTexts: Array.from({ length: 10 }, (_, i) => texts?.[i] ?? (frames[i] ? frameSymbols(frames[i]).join('') : '')),
    marks: Array.from({ length: 10 }, (_, i) => marks?.[i] ?? null),
    readScores,
    mapping: known ? String(known.id) : '',
    newPlayerName: '',
  };
}

function resultRows(e: Entry): EditorRow[] {
  return (e.result?.players ?? []).map((p: ResultPlayer, i) => makeRow(p.name, p.frames, e.scores[i] ?? [], p.texts, p.marks));
}

async function load() {
  try {
    const e = await api.getEntry(props.id);
    players.value = await api.listPlayers(e.groupId);
    entry.value = e;
    playedOn.value = e.playedOn;
    rows.value = resultRows(e);
    loadError.value = null;
  } catch (err) {
    loadError.value = (err as Error).message;
  }
}

/** Auswertung pro Zeile: Frames einlesen, Regeln prüfen, Zwischenstände berechnen */
const evaluated = computed(() =>
  rows.value.map((row) => {
    const frames: number[][] = [];
    let error: string | null = null;
    let errorFrame: number | null = null;
    const lastFilled = row.frameTexts.reduce((last, t, i) => (t.trim() ? i : last), -1);
    for (let i = 0; i <= lastFilled && !error; i++) {
      const text = row.frameTexts[i].trim();
      if (!text) {
        error = `Frame ${i + 1} fehlt.`;
        errorFrame = i;
        break;
      }
      try {
        frames.push(parseFrame(text));
      } catch (e) {
        error = `Frame ${i + 1}: ${(e as Error).message}`;
        errorFrame = i;
      }
    }
    error ??= frameError(frames);
    const running = error ? [] : runningScores(frames);
    let mappingError: string | null = null;
    if (!row.displayName.trim()) mappingError = 'Anzeigename fehlt.';
    else if (row.mapping === '') mappingError = 'Bitte einen Spieler zuordnen.';
    else if (row.mapping === NEW_PLAYER && !row.newPlayerName.trim()) mappingError = 'Name für den neuen Spieler fehlt.';
    return {
      frames,
      error,
      errorFrame,
      mappingError,
      running,
      complete: !error && isComplete(frames),
      mismatch: running.map((s, i) => row.readScores[i] !== undefined && row.readScores[i] !== s),
    };
  }),
);

const canSubmit = computed(
  () => editable.value && rows.value.length > 0 && evaluated.value.every((r) => !r.error && !r.mappingError) && !!playedOn.value,
);

function markTitle(mark: FrameMark): string | undefined {
  if (mark === 'error') return 'Passt nicht zu den Zwischenständen – bitte korrigieren';
  if (mark === 'unsure') return 'Nicht eindeutig lesbar – bitte mit dem Foto vergleichen';
  return undefined;
}

function onMappingChange(row: EditorRow) {
  if (row.mapping === NEW_PLAYER && !row.newPlayerName) {
    row.newPlayerName = row.displayName.trim();
  }
}

function onDisplayNameChange(row: EditorRow) {
  // Bekannten Alias automatisch zuordnen, solange noch nichts gewählt ist
  const known = playerForAlias(row.displayName);
  if (known && row.mapping === '') row.mapping = String(known.id);
}

function addRow() {
  rows.value.push(makeRow('', [], []));
}

function removeRow(idx: number) {
  rows.value.splice(idx, 1);
}

async function approve() {
  if (!entry.value || !canSubmit.value) return;
  const payload: ApprovePlayer[] = rows.value.map((row, i) => ({
    displayName: row.displayName.trim(),
    frames: evaluated.value[i].frames,
    ...(row.mapping === NEW_PLAYER ? { newPlayerName: row.newPlayerName.trim() } : { playerId: Number(row.mapping) }),
  }));
  busy.value = true;
  submitError.value = null;
  try {
    await api.approve(entry.value.id, playedOn.value, payload);
    await router.push({ name: 'entries' });
  } catch (e) {
    submitError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function unapprove() {
  if (!entry.value || !confirm('Freigabe zurückziehen? Die Spiele fallen aus der Statistik, bis erneut freigegeben wird.')) return;
  busy.value = true;
  submitError.value = null;
  try {
    entry.value = await api.unapprove(entry.value.id);
    rows.value = resultRows(entry.value);
  } catch (e) {
    submitError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

void load();
</script>

<template>
  <p><RouterLink :to="{ name: 'entries' }">← Zurück zu den Fotos</RouterLink></p>
  <p v-if="loadError" class="msg-error">{{ loadError }}</p>

  <template v-if="entry">
    <h2>
      Spiel vom {{ formatDate(entry.playedOn) }}
      <small v-if="entry.uploader" class="muted">· hochgeladen von {{ entry.uploader }}</small>
    </h2>

    <a :href="entry.imageUrl" target="_blank" rel="noopener" title="Bild in voller Größe öffnen">
      <img :src="entry.imageUrl" alt="Foto der Anzeige" class="photo" />
    </a>

    <!-- Freigegeben: nur ansehen -->
    <article v-if="entry.status === 'approved'">
      <header>
        Freigegeben<template v-if="entry.approvedBy"> von {{ entry.approvedBy }}</template>
      </header>
      <ScoreTable
        :players="
          entry.games.map((g) => ({
            name: `${g.playerName} (${g.displayName})`,
            frames: g.frames,
            avatar: { name: g.playerName, url: g.avatarUrl },
          }))
        "
      />
      <p class="muted">
        In der Statistik:
        {{ entry.games.filter((g) => g.complete).map((g) => g.playerName).join(', ') || 'keine vollständigen Spiele' }}
      </p>
      <button v-if="entry.can.unapprove" type="button" class="secondary outline small" :disabled="busy" @click="unapprove">
        Freigabe zurückziehen
      </button>
    </article>

    <template v-else-if="entry.status === 'review'">
      <p v-if="!entry.can.approve" class="msg-warn">
        <template v-if="entry.uploader === session.me?.user.username">Dein eigenes Foto muss jemand anderes freigeben.</template>
        <template v-else>Du kannst diesen Eintrag nicht freigeben.</template>
      </p>
      <div v-if="entry.uncertain" class="msg-warn">
        <p>Die Analyse ist unsicher – die gelesenen Frames passen nicht vollständig zu den Zwischenständen:</p>
        <ul>
          <li v-for="(p, i) in entry.problems" :key="i">{{ p }}</li>
        </ul>
      </div>

      <form @submit.prevent="approve">
        <label class="date">
          Spieldatum
          <input v-model="playedOn" type="date" required :disabled="!editable" />
        </label>

        <article v-for="(row, idx) in rows" :key="idx" class="row-card">
          <div class="row-head">
            <label>
              Name auf der Anzeige
              <input v-model="row.displayName" :disabled="!editable" @change="onDisplayNameChange(row)" />
            </label>
            <label>
              Spieler
              <select v-model="row.mapping" :disabled="!editable" @change="onMappingChange(row)">
                <option value="">– bitte wählen –</option>
                <option v-for="p in players" :key="p.id" :value="String(p.id)">{{ p.name }}</option>
                <option :value="NEW_PLAYER">+ Neuer Spieler …</option>
              </select>
            </label>
            <label v-if="row.mapping === NEW_PLAYER">
              Name des neuen Spielers
              <input v-model="row.newPlayerName" :disabled="!editable" />
            </label>
            <button
              v-if="editable"
              type="button"
              class="secondary outline small remove"
              title="Zeile entfernen"
              @click="removeRow(idx)"
            >
              Entfernen
            </button>
          </div>

          <div class="overflow-auto">
            <table class="frames">
              <thead>
                <tr>
                  <th></th>
                  <th v-for="n in 10" :key="n">{{ n }}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Würfe</th>
                  <td v-for="i in 10" :key="i">
                    <input
                      v-model="row.frameTexts[i - 1]"
                      class="frame-input"
                      :class="{
                        'mark-error': row.marks[i - 1] === 'error' || evaluated[idx].errorFrame === i - 1,
                        'mark-unsure': row.marks[i - 1] === 'unsure',
                      }"
                      :title="markTitle(row.marks[i - 1])"
                      @input="row.marks[i - 1] = null"
                      :maxlength="i === 10 ? 3 : 2"
                      :disabled="!editable"
                      :aria-label="`Frame ${i}`"
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">Berechnet</th>
                  <td
                    v-for="i in 10"
                    :key="i"
                    class="num"
                    :class="{ mismatch: evaluated[idx].mismatch[i - 1] }"
                  >
                    {{ evaluated[idx].running[i - 1] ?? '' }}
                  </td>
                </tr>
                <tr v-if="row.readScores.length">
                  <th scope="row">Gelesen</th>
                  <td v-for="i in 10" :key="i" class="num muted">{{ row.readScores[i - 1] ?? '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <small v-if="row.marks.some(Boolean)" class="marks-legend muted">
            <span class="mark-error">rot</span> = passt nicht zu den Zwischenständen,
            <span class="mark-unsure">gelb</span> = nicht eindeutig lesbar, bitte mit dem Foto vergleichen.
            Die Markierung verschwindet, sobald du den Frame änderst.
          </small>
          <small v-if="evaluated[idx].error" class="msg-error">{{ evaluated[idx].error }}</small>
          <small v-else-if="evaluated[idx].mappingError" class="msg-warn">{{ evaluated[idx].mappingError }}</small>
          <small v-else-if="!evaluated[idx].complete" class="muted">Unvollständiges Spiel – zählt nicht in die Statistik.</small>
          <small v-else-if="evaluated[idx].mismatch.some(Boolean)" class="msg-warn">
            Berechnete und gelesene Zwischenstände weichen ab – bitte mit dem Foto vergleichen.
          </small>
        </article>

        <p v-if="editable" class="hint muted">
          Schreibweise wie auf der Anzeige: <code>X</code> Strike, <code>/</code> Spare, <code>-</code> kein Pin, z. B.
          <code>9/</code>, <code>-7</code>, <code>XX9</code>. Nicht gespielte Frames leer lassen.
        </p>

        <div v-if="editable" class="actions">
          <button type="button" class="secondary outline" @click="addRow">Spieler hinzufügen</button>
          <button type="submit" :aria-busy="busy" :disabled="!canSubmit || busy">Freigeben</button>
        </div>
      </form>
    </template>

    <p v-else class="muted">Dieser Eintrag ist noch nicht analysiert oder fehlgeschlagen.</p>
    <p v-if="submitError" class="msg-error">{{ submitError }}</p>
  </template>
</template>

<style scoped>
.muted {
  color: var(--pico-muted-color);
}
.photo {
  display: block;
  max-width: 100%;
  max-height: 60vh;
  margin: 0 auto 1.5rem;
  border-radius: var(--pico-border-radius);
}
.date {
  max-width: 14rem;
}
.row-head {
  display: flex;
  flex-wrap: wrap;
  gap: 0 1rem;
  align-items: flex-end;
}
.row-head label {
  flex: 1;
  min-width: 10rem;
}
.row-head .remove {
  margin-bottom: var(--pico-spacing);
}
.frames {
  margin-bottom: 0.5rem;
  font-variant-numeric: tabular-nums;
}
.frames th,
.frames td {
  padding: 0.2rem;
  text-align: center;
  white-space: nowrap;
}
.frames tbody th {
  text-align: left;
  font-weight: 400;
  color: var(--pico-muted-color);
}
input.frame-input {
  width: 3.2rem;
  margin: 0;
  padding: 0.3rem;
  text-align: center;
  text-transform: uppercase;
}
input.frame-input.mark-error {
  border-color: var(--status-failed);
  box-shadow: 0 0 0 2px var(--status-failed);
}
input.frame-input.mark-unsure {
  border-color: var(--status-review);
  box-shadow: 0 0 0 2px var(--status-review);
}
.marks-legend {
  display: block;
}
.marks-legend .mark-error {
  color: var(--status-failed);
  font-weight: 600;
}
.marks-legend .mark-unsure {
  color: var(--status-review);
  font-weight: 600;
}
.num {
  font-weight: 600;
}
.num.muted {
  font-weight: 400;
}
.mismatch {
  color: var(--status-failed);
  text-decoration: underline wavy;
}
.hint code {
  font-size: 0.9em;
}
</style>
