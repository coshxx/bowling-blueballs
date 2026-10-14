<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import LocationSelect from '../components/LocationSelect.vue';
import { centsToInput, formatDate, formatEuro, parseEuro } from '../format';
import type { Evening, EveningItem, Location, MenuItem, Player } from '../types';

const props = defineProps<{ id: number }>();
const router = useRouter();

const NEW_PLAYER = '__new__';

const evening = ref<Evening | null>(null);
const players = ref<Player[]>([]);
const locations = ref<Location[]>([]);
const menu = ref<MenuItem[]>([]);
const loadError = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

// Formular für neue Positionen
const playerChoice = ref('');
const newPlayerName = ref('');
const itemName = ref('');
const quantity = ref(1);
const priceText = ref('');
/** Preis von Hand geändert? Dann überschreibt die Artikelauswahl ihn nicht mehr */
const priceTouched = ref(false);

const editable = computed(() => evening.value?.can.edit ?? false);

const sortedItems = computed(() =>
  [...(evening.value?.items ?? [])].sort((a, b) => a.playerName.localeCompare(b.playerName) || a.id - b.id),
);

const formError = computed(() => {
  if (!playerChoice.value) return 'Bitte eine Person wählen.';
  if (playerChoice.value === NEW_PLAYER && !newPlayerName.value.trim()) return 'Name der neuen Person fehlt.';
  if (!itemName.value.trim()) return 'Bitte einen Artikel eingeben.';
  if (!Number.isInteger(quantity.value) || quantity.value < 1) return 'Die Menge muss mindestens 1 sein.';
  if (parseEuro(priceText.value) === null) return 'Bitte einen Preis wie 4,80 eingeben.';
  return null;
});

async function loadMenu() {
  menu.value = evening.value?.location ? await api.menu(evening.value.location.id) : [];
}

async function load() {
  try {
    const e = await api.getEvening(props.id);
    [players.value, locations.value] = await Promise.all([api.listPlayers(e.groupId), api.listLocations()]);
    evening.value = e;
    await loadMenu();
    loadError.value = null;
  } catch (err) {
    loadError.value = (err as Error).message;
  }
}

/** Führt eine Änderung aus und übernimmt den zurückgegebenen Abend. */
async function run(action: () => Promise<Evening | void>) {
  busy.value = true;
  error.value = null;
  try {
    const result = await action();
    if (result) evening.value = result;
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

function onItemInput() {
  const known = menu.value.find((m) => m.name.toLowerCase() === itemName.value.trim().toLowerCase());
  if (known && !priceTouched.value) priceText.value = centsToInput(known.priceCents);
}

function onPlayerChange() {
  if (playerChoice.value !== NEW_PLAYER) newPlayerName.value = '';
}

async function addConsumption() {
  if (!evening.value || formError.value) return;
  const isNew = playerChoice.value === NEW_PLAYER;
  await run(async () => {
    const result = await api.addConsumption(evening.value!.id, {
      ...(isNew ? { newPlayerName: newPlayerName.value.trim() } : { playerId: Number(playerChoice.value) }),
      itemName: itemName.value.trim(),
      quantity: quantity.value,
      unitCents: parseEuro(priceText.value)!,
    });
    // Neue Artikel und Preise stehen jetzt auf der Karte, neue Personen in der Gruppe
    await loadMenu();
    if (isNew) {
      players.value = await api.listPlayers(result.groupId);
      const created = players.value.find((p) => p.name.toLowerCase() === newPlayerName.value.trim().toLowerCase());
      playerChoice.value = created ? String(created.id) : '';
      newPlayerName.value = '';
    }
    itemName.value = '';
    quantity.value = 1;
    priceText.value = '';
    priceTouched.value = false;
    return result;
  });
}

/** Mengenänderungen nacheinander senden, damit schnelle Klicks sich nicht überholen */
let quantityQueue: Promise<void> = Promise.resolve();
let pendingQuantity = 0;

/** Ändert die Menge sofort in der Anzeige (ohne die Seite zu sperren) und speichert im Hintergrund. */
function changeQuantity(item: EveningItem, delta: number) {
  const next = item.quantity + delta;
  if (next < 1) {
    removeItem(item);
    return;
  }
  setQuantityLocally(item.id, next);
  pendingQuantity++;
  quantityQueue = quantityQueue.then(async () => {
    try {
      const result = await api.updateConsumption(item.id, { quantity: next });
      // Erst nach der letzten Änderung den Stand vom Server übernehmen, sonst springt die Zahl zurück
      if (--pendingQuantity === 0) evening.value = result;
    } catch (err) {
      pendingQuantity--;
      error.value = (err as Error).message;
      evening.value = await api.getEvening(props.id).catch(() => evening.value);
    }
  });
}

function setQuantityLocally(itemId: number, quantity: number) {
  const e = evening.value;
  const item = e?.items.find((i) => i.id === itemId);
  if (!e || !item) return;
  item.quantity = quantity;
  item.totalCents = quantity * item.unitCents;
  for (const t of e.totals) {
    t.totalCents = e.items.filter((i) => i.playerId === t.playerId).reduce((sum, i) => sum + i.totalCents, 0);
  }
  // Gleiche Reihenfolge wie vom Server
  e.totals.sort((a, b) => b.totalCents - a.totalCents || a.playerName.localeCompare(b.playerName));
  e.totalCents = e.items.reduce((sum, i) => sum + i.totalCents, 0);
}

function changePrice(item: EveningItem) {
  const text = prompt(`Einzelpreis für ${item.itemName}:`, centsToInput(item.unitCents));
  if (text === null) return;
  const cents = parseEuro(text);
  if (cents === null) {
    error.value = 'Bitte einen Preis wie 4,80 eingeben.';
    return;
  }
  if (cents !== item.unitCents) void run(() => api.updateConsumption(item.id, { unitCents: cents }));
}

function removeItem(item: EveningItem) {
  if (confirm(`${item.quantity} × ${item.itemName} von ${item.playerName} entfernen?`)) {
    void run(() => api.deleteConsumption(item.id));
  }
}

function saveDate(e: Event) {
  const date = (e.target as HTMLInputElement).value;
  if (date && date !== evening.value?.date) void run(() => api.updateEvening(props.id, { date }));
}

function saveLabel(e: Event) {
  const label = (e.target as HTMLInputElement).value.trim();
  if (label !== (evening.value?.label ?? '')) void run(() => api.updateEvening(props.id, { label: label || null }));
}

function saveLocation(locationId: number | null) {
  void run(async () => {
    const result = await api.updateEvening(props.id, { locationId });
    evening.value = result;
    await loadMenu();
    return result;
  });
}

async function deleteEvening() {
  if (!evening.value || !confirm('Diesen Abend löschen?')) return;
  await run(async () => {
    await api.deleteEvening(props.id);
    await router.push({ name: 'evenings' });
  });
}

void load();
</script>

<template>
  <p><RouterLink :to="{ name: 'evenings' }">← Zurück zu den Abenden</RouterLink></p>
  <p v-if="loadError" class="msg-error">{{ loadError }}</p>

  <template v-if="evening">
    <h2>
      Abend vom {{ formatDate(evening.date) }}
      <small v-if="evening.label" class="muted">· {{ evening.label }}</small>
    </h2>

    <article>
      <div class="grid">
        <label>
          Datum
          <input type="date" :value="evening.date" required :disabled="!editable || busy" @change="saveDate" />
        </label>
        <label>
          Location
          <LocationSelect
            :model-value="evening.location?.id ?? null"
            :locations="locations"
            :disabled="!editable || busy || evening.items.length > 0"
            @update:model-value="saveLocation"
            @created="(l) => locations.push(l)"
          />
          <small v-if="editable && evening.items.length > 0" class="muted">
            Lässt sich nur ändern, solange kein Verzehr eingetragen ist.
          </small>
        </label>
        <label>
          Bezeichnung <small class="muted">(optional)</small>
          <input
            :value="evening.label ?? ''"
            maxlength="60"
            placeholder="z. B. Firmenfeier"
            :disabled="!editable || busy"
            @change="saveLabel"
          />
        </label>
      </div>
      <small v-if="evening.createdBy" class="muted">Angelegt von {{ evening.createdBy }}</small>
    </article>

    <p v-if="error" class="msg-error">{{ error }}</p>

    <article v-if="editable">
      <header>Verzehr eintragen</header>
      <p v-if="!evening.location" class="msg-warn">Bitte zuerst oben eine Location wählen – die Karte gehört zur Location.</p>
      <form v-else class="add-form" @submit.prevent="addConsumption">
        <label>
          Person
          <select v-model="playerChoice" :disabled="busy" @change="onPlayerChange">
            <option value="">– bitte wählen –</option>
            <option v-for="p in players" :key="p.id" :value="String(p.id)">{{ p.name }}</option>
            <option :value="NEW_PLAYER">+ Neue Person …</option>
          </select>
        </label>
        <label v-if="playerChoice === NEW_PLAYER">
          Name
          <input v-model="newPlayerName" maxlength="40" :disabled="busy" />
        </label>
        <label class="item">
          Artikel
          <input
            v-model="itemName"
            list="menu-items"
            maxlength="60"
            autocomplete="off"
            placeholder="z. B. Pils 0,5"
            :disabled="busy"
            @input="onItemInput"
          />
          <datalist id="menu-items">
            <option v-for="m in menu" :key="m.id" :value="m.name">{{ formatEuro(m.priceCents) }}</option>
          </datalist>
        </label>
        <label class="qty">
          Menge
          <input v-model.number="quantity" type="number" min="1" max="99" :disabled="busy" />
        </label>
        <label class="price">
          Einzelpreis €
          <input v-model="priceText" inputmode="decimal" placeholder="4,80" :disabled="busy" @input="priceTouched = true" />
        </label>
        <button type="submit" :aria-busy="busy" :disabled="busy || !!formError" :title="formError ?? ''">Eintragen</button>
      </form>
      <small class="muted">Neue Artikel landen automatisch auf der Karte von {{ evening.location?.name }}.</small>
    </article>

    <article>
      <header>Positionen</header>
      <p v-if="sortedItems.length === 0" class="muted">Noch nichts eingetragen.</p>
      <div v-else class="overflow-auto">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Artikel</th>
              <th class="num">Menge</th>
              <th class="num">Einzelpreis</th>
              <th class="num">Summe</th>
              <th v-if="editable"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in sortedItems" :key="item.id">
              <td>{{ item.playerName }}</td>
              <td>{{ item.itemName }}</td>
              <td class="num qty-cell">
                <button
                  v-if="editable"
                  type="button"
                  class="small secondary outline"
                  :disabled="busy"
                  :aria-label="`${item.itemName} eins weniger`"
                  @click="changeQuantity(item, -1)"
                >
                  −
                </button>
                <span>{{ item.quantity }}</span>
                <button
                  v-if="editable"
                  type="button"
                  class="small secondary outline"
                  :disabled="busy || item.quantity >= 99"
                  :aria-label="`${item.itemName} eins mehr`"
                  @click="changeQuantity(item, 1)"
                >
                  +
                </button>
              </td>
              <td class="num">
                <a v-if="editable" href="#" title="Preis ändern" @click.prevent="changePrice(item)">{{ formatEuro(item.unitCents) }}</a>
                <template v-else>{{ formatEuro(item.unitCents) }}</template>
              </td>
              <td class="num">{{ formatEuro(item.totalCents) }}</td>
              <td v-if="editable">
                <button type="button" class="small secondary outline" :disabled="busy" @click="removeItem(item)">Entfernen</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <article v-if="evening.totals.length">
      <header>Summe pro Person</header>
      <table class="totals">
        <tbody>
          <tr v-for="t in evening.totals" :key="t.playerId">
            <td>{{ t.playerName }}</td>
            <td class="num">{{ formatEuro(t.totalCents) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Gesamt</th>
            <th class="num">{{ formatEuro(evening.totalCents) }}</th>
          </tr>
        </tfoot>
      </table>
    </article>

    <button
      v-if="evening.can.delete"
      type="button"
      class="secondary outline small"
      :disabled="busy"
      @click="deleteEvening"
    >
      Abend löschen
    </button>
  </template>
</template>

<style scoped>
.muted {
  color: var(--pico-muted-color);
}
.add-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0 1rem;
  align-items: flex-end;
}
.add-form label {
  flex: 1;
  min-width: 9rem;
}
.add-form .item {
  flex: 2;
  min-width: 12rem;
}
.add-form .qty {
  flex: 0 0 5.5rem;
  min-width: 0;
}
.add-form .price {
  flex: 0 0 7.5rem;
  min-width: 0;
}
.add-form button {
  width: auto;
  margin-bottom: var(--pico-spacing);
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.qty-cell {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  justify-content: flex-end;
}
.qty-cell span {
  min-width: 1.5em;
  text-align: center;
}
.totals {
  max-width: 24rem;
  margin-bottom: 0;
}
</style>
