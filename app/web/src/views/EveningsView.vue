<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import LocationSelect from '../components/LocationSelect.vue';
import { EVENING_STATUS_LABELS, formatDate, formatDateTime, formatEuro, todayYmd } from '../format';
import { currentGroup, session } from '../session';
import type { EveningSummary, Location } from '../types';

const router = useRouter();

const evenings = ref<EveningSummary[]>([]);
const locations = ref<Location[]>([]);
const loadError = ref<string | null>(null);

const date = ref(todayYmd());
const locationId = ref<number | null>(null);
const label = ref('');
const busy = ref(false);
const createError = ref<string | null>(null);

async function load() {
  if (!currentGroup.value) {
    evenings.value = [];
    return;
  }
  try {
    [evenings.value, locations.value] = await Promise.all([api.listEvenings(currentGroup.value.id), api.listLocations()]);
    // Gibt es nur eine Location, ist sie vorausgewählt
    if (locationId.value === null && locations.value.length === 1) locationId.value = locations.value[0].id;
    loadError.value = null;
  } catch (e) {
    loadError.value = (e as Error).message;
  }
}

async function create() {
  if (!currentGroup.value) return;
  busy.value = true;
  createError.value = null;
  try {
    const evening = await api.createEvening(currentGroup.value.id, {
      date: date.value,
      ...(locationId.value ? { locationId: locationId.value } : {}),
      ...(label.value.trim() ? { label: label.value.trim() } : {}),
    });
    await router.push({ name: 'evening', params: { id: evening.id } });
  } catch (e) {
    createError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

/** Zwei Abende am selben Tag ohne Bezeichnung unterscheidet die Uhrzeit des Anlegens */
function sameDayCount(e: EveningSummary): number {
  return evenings.value.filter((o) => o.date === e.date).length;
}

watch(() => session.groupId, load, { immediate: true });
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
      <form @submit.prevent="create">
        <div class="grid">
          <label>
            Datum
            <input v-model="date" type="date" required :disabled="busy" />
          </label>
          <label>
            Location
            <LocationSelect v-model="locationId" :locations="locations" :disabled="busy" @created="(l) => locations.push(l)" />
          </label>
          <label>
            Bezeichnung <small class="muted">(optional)</small>
            <input v-model="label" maxlength="60" placeholder="z. B. Firmenfeier" :disabled="busy" />
          </label>
        </div>
        <button type="submit" :aria-busy="busy" :disabled="busy">Neuer Abend</button>
      </form>
      <p v-if="createError" class="msg-error">{{ createError }}</p>
    </article>

    <p v-if="loadError" class="msg-error">Abende konnten nicht geladen werden: {{ loadError }}</p>
    <p v-else-if="evenings.length === 0">Noch keine Abende.</p>
    <div v-else class="overflow-auto">
      <table>
        <thead>
          <tr>
            <th>Abend</th>
            <th>Location</th>
            <th class="num">Personen</th>
            <th class="num">Summe</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in evenings" :key="e.id">
            <th scope="row">
              <RouterLink :to="{ name: 'evening', params: { id: e.id } }">{{ formatDate(e.date) }}</RouterLink>
              <small v-if="e.label" class="muted"> · {{ e.label }}</small>
              <small v-else-if="sameDayCount(e) > 1" class="muted"> · angelegt {{ formatDateTime(e.createdAt) }}</small>
            </th>
            <td>{{ e.location?.name ?? '–' }}</td>
            <td class="num">{{ e.players || '–' }}</td>
            <td class="num">{{ e.positions ? formatEuro(e.totalCents) : '–' }}</td>
            <td>
              <span class="status" :class="`status-${e.status}`">{{ EVENING_STATUS_LABELS[e.status] }}</span>
              <RouterLink v-if="e.myOpenCents" :to="{ name: 'evening', params: { id: e.id } }" class="my-open">
                du zahlst {{ formatEuro(e.myOpenCents) }}
              </RouterLink>
              <small v-else-if="e.status === 'billed'" class="muted"> · {{ formatEuro(e.openCents) }} offen</small>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>

<style scoped>
.muted {
  color: var(--pico-muted-color);
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.status {
  font-size: 0.85em;
  font-weight: 600;
}
.status-open {
  color: var(--status-running);
}
.status-billed {
  color: var(--status-review);
}
.status-settled {
  color: var(--status-approved);
}
.my-open {
  margin-left: 0.4rem;
  color: var(--status-failed);
  font-weight: 600;
}
</style>
