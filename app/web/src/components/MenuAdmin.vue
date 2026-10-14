<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { api } from '../api';
import { centsToInput, formatEuro, parseEuro } from '../format';
import type { Location, MenuItem } from '../types';

/** Kartenpflege für Admins: Artikel umbenennen, Preis ändern, aus- und einblenden, löschen. */
const locations = ref<Location[]>([]);
const locationId = ref<number | null>(null);
const items = ref<MenuItem[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);

async function loadItems() {
  items.value = locationId.value ? await api.menu(locationId.value, true) : [];
}

async function run(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = null;
  try {
    await action();
    await loadItems();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function rename(item: MenuItem) {
  const name = prompt('Neuer Name des Artikels:', item.name)?.trim();
  if (name && name !== item.name) void run(() => api.updateMenuItem(item.id, { name }));
}

function setPrice(item: MenuItem) {
  const text = prompt(`Preisvorschlag für ${item.name}:`, centsToInput(item.priceCents));
  if (text === null) return;
  const priceCents = parseEuro(text);
  if (priceCents === null) {
    error.value = 'Bitte einen Preis wie 4,80 eingeben.';
    return;
  }
  void run(() => api.updateMenuItem(item.id, { priceCents }));
}

function toggleHidden(item: MenuItem) {
  void run(() => api.updateMenuItem(item.id, { hidden: !item.hidden }));
}

function remove(item: MenuItem) {
  const text = item.uses
    ? `„${item.name}“ wurde schon ${item.uses}× eingetragen und wird deshalb nur ausgeblendet. Fortfahren?`
    : `„${item.name}“ von der Karte löschen?`;
  if (confirm(text)) void run(() => api.deleteMenuItem(item.id));
}

onMounted(async () => {
  try {
    locations.value = await api.listLocations();
    locationId.value = locations.value[0]?.id ?? null;
  } catch (e) {
    error.value = (e as Error).message;
  }
});
watch(locationId, async () => {
  error.value = null;
  try {
    await loadItems();
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<template>
  <p v-if="error" class="msg-error">{{ error }}</p>
  <p v-if="locations.length === 0">Noch keine Locations. Sie entstehen beim Anlegen eines Abends.</p>
  <template v-else>
    <label class="location">
      Location
      <select v-model="locationId">
        <option v-for="l in locations" :key="l.id" :value="l.id">{{ l.name }}</option>
      </select>
    </label>

    <p v-if="items.length === 0" class="muted">Die Karte ist leer. Artikel entstehen beim Eintragen von Verzehr.</p>
    <div v-else class="overflow-auto">
      <table>
        <thead>
          <tr>
            <th>Artikel</th>
            <th class="num">Preis</th>
            <th class="num">Eingetragen</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" :class="{ hidden: item.hidden }">
            <th scope="row">
              {{ item.name }}<small v-if="item.hidden" class="muted"> (ausgeblendet)</small>
            </th>
            <td class="num">{{ formatEuro(item.priceCents) }}</td>
            <td class="num">{{ item.uses }}×</td>
            <td class="actions">
              <button type="button" class="small secondary outline" :disabled="busy" @click="rename(item)">Umbenennen</button>
              <button type="button" class="small secondary outline" :disabled="busy" @click="setPrice(item)">Preis</button>
              <button type="button" class="small secondary outline" :disabled="busy" @click="toggleHidden(item)">
                {{ item.hidden ? 'Einblenden' : 'Ausblenden' }}
              </button>
              <button
                v-if="!item.hidden || item.uses === 0"
                type="button"
                class="small secondary outline"
                :disabled="busy"
                @click="remove(item)"
              >
                Löschen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <small class="muted">Karten gelten für alle Gruppen. Preisänderungen wirken nur auf neue Einträge.</small>
  </template>
</template>

<style scoped>
.location {
  max-width: 24rem;
}
.muted {
  color: var(--pico-muted-color);
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
tr.hidden th,
tr.hidden td.num {
  opacity: 0.6;
}
td.actions {
  flex-wrap: nowrap;
}
</style>
