<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import LocationSelect from '../components/LocationSelect.vue';
import UserAvatar from '../components/UserAvatar.vue';
import {
  centsToInput,
  EVENING_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatEuro,
  paypalLink,
  parseEuro,
} from '../format';
import { session } from '../session';
import type { Evening, EveningAttendee, EveningItem, Location, MenuItem, Player } from '../types';

const props = defineProps<{ id: number }>();
const router = useRouter();

const NEW_PLAYER = '__new__';

const evening = ref<Evening | null>(null);
const players = ref<Player[]>([]);
const locations = ref<Location[]>([]);
const menu = ref<MenuItem[]>([]);
/** Namen geteilter Positionen an dieser Location (Vorschläge ohne Preis) */
const sharedNames = ref<string[]>([]);
const loadError = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

// Teilnehmer
const guestName = ref('');

// Formular für neue Positionen
const mode = ref<'single' | 'shared'>('single');
const playerChoice = ref('');
const newPlayerName = ref('');
const shareIds = ref<number[]>([]);
const containedIn = ref('');
const itemName = ref('');
const quantity = ref(1);
const priceText = ref('');
/** Preis von Hand geändert? Dann überschreibt die Artikelauswahl ihn nicht mehr */
const priceTouched = ref(false);

// Anteile einer geteilten Position bearbeiten
const editingSharesOf = ref<number | null>(null);
const editShareIds = ref<number[]>([]);

// Enthaltene Einzelpositionen einer geteilten Position bearbeiten
const editingContainedOf = ref<number | null>(null);
const editContainedIds = ref<number[]>([]);

// Freigabe
const recipientChoice = ref('');

const editable = computed(() => evening.value?.can.edit ?? false);
const attendees = computed(() => evening.value?.attendees ?? []);
/** Teams spielen nur, sie essen und zahlen nicht */
const persons = computed(() => players.value.filter((p) => !p.isTeam));
const attendeeIds = computed(() => new Set(attendees.value.map((a) => a.playerId)));
const sharedItems = computed(() => evening.value?.items.filter((i) => i.shared) ?? []);
const me = computed(() => attendees.value.find((a) => a.isMe) ?? null);

const singleItems = computed(() => evening.value?.items.filter((i) => !i.shared) ?? []);

/** Einzelpositionen nach Person gruppiert, Personen alphabetisch */
const itemsByPerson = computed(() => {
  const groups = new Map<number, { playerId: number; playerName: string; items: EveningItem[] }>();
  for (const item of singleItems.value) {
    const group = groups.get(item.playerId!) ?? { playerId: item.playerId!, playerName: item.playerName!, items: [] };
    group.items.push(item);
    groups.set(item.playerId!, group);
  }
  return [...groups.values()].sort((a, b) => a.playerName.localeCompare(b.playerName));
});

type Row =
  | { kind: 'heading'; key: string; label: string; person?: { name: string; avatarUrl: string | null } }
  | { kind: 'item'; key: string; item: EveningItem }
  | { kind: 'share'; key: string; name: string; cents: number; hint: string }
  | { kind: 'sum'; key: string; label: string; cents: number };

/** Anteile einer Person an geteilten Positionen, gleichnamige (z. B. zwei Mal "Bowling") zusammengefasst */
function sharesOf(playerId: number) {
  const byName = new Map<string, { cents: number; items: EveningItem[] }>();
  for (const item of sharedItems.value) {
    const cents = item.shares.find((s) => s.playerId === playerId)?.cents;
    if (cents == null) continue;
    const sum = byName.get(item.itemName) ?? { cents: 0, items: [] };
    sum.cents += cents;
    sum.items.push(item);
    byName.set(item.itemName, sum);
  }
  return [...byName].map(([name, { cents, items }]) => ({
    name,
    cents,
    hint:
      items.length === 1
        ? `${formatEuro(items[0].netCents ?? items[0].totalCents)} ÷ ${items[0].shares.length}`
        : `aus ${items.length} geteilten Posten`,
  }));
}

/** Erst die geteilten Positionen, dann pro Person deren Anteile, Einzelpositionen und Summe */
const rows = computed<Row[]>(() => [
  ...(sharedItems.value.length ? [{ kind: 'heading' as const, key: 'h-shared', label: 'Geteilt' }] : []),
  ...sharedItems.value.map((item) => ({ kind: 'item' as const, key: `i${item.id}`, item })),
  ...attendees.value.flatMap((a) => {
    const shares = sharesOf(a.playerId);
    const items = itemsByPerson.value.find((g) => g.playerId === a.playerId)?.items ?? [];
    if (shares.length === 0 && items.length === 0) return [];
    return [
      { kind: 'heading' as const, key: `h${a.playerId}`, label: a.playerName, person: { name: a.playerName, avatarUrl: a.avatarUrl } },
      ...shares.map((s) => ({ kind: 'share' as const, key: `s${a.playerId}-${s.name}`, ...s })),
      ...items.map((item) => ({ kind: 'item' as const, key: `i${item.id}`, item })),
      { kind: 'sum' as const, key: `t${a.playerId}`, label: `Summe ${a.playerName}`, cents: a.amountCents },
    ];
  }),
]);

/** Was in einer geteilten Position steckt, nach Artikel zusammengefasst: "Leihschuhe ×3 (12,00 €)" */
function containedSummary(sharedId: number): string {
  const byName = new Map<string, { quantity: number; cents: number }>();
  for (const item of singleItems.value.filter((i) => i.containedInId === sharedId)) {
    const sum = byName.get(item.itemName) ?? { quantity: 0, cents: 0 };
    sum.quantity += item.quantity;
    sum.cents += item.totalCents;
    byName.set(item.itemName, sum);
  }
  return [...byName].map(([name, sum]) => `${name} ×${sum.quantity} (${formatEuro(sum.cents)})`).join(', ');
}

const recipientCandidates = computed(() => attendees.value.filter((a) => a.hasAccount));

const formError = computed(() => {
  if (mode.value === 'single') {
    if (!playerChoice.value) return 'Bitte eine Person wählen.';
    if (playerChoice.value === NEW_PLAYER && !newPlayerName.value.trim()) return 'Name der neuen Person fehlt.';
  } else if (shareIds.value.length === 0) {
    return 'Mindestens eine Person muss mitzahlen.';
  }
  if (!itemName.value.trim()) return 'Bitte einen Artikel eingeben.';
  if (!Number.isInteger(quantity.value) || quantity.value < 1) return 'Die Menge muss mindestens 1 sein.';
  if (parseEuro(priceText.value) === null) return 'Bitte einen Preis wie 4,80 eingeben.';
  return null;
});

async function loadMenu() {
  const location = evening.value?.location;
  [menu.value, sharedNames.value] = location
    ? await Promise.all([api.menu(location.id), api.sharedNames(location.id)])
    : [[], []];
}

function applyEvening(e: Evening) {
  evening.value = e;
  // Vorauswahl für die Freigabe: der Besitzer selbst, sonst der Erste mit Konto
  if (!recipientCandidates.value.some((a) => String(a.playerId) === recipientChoice.value)) {
    const preferred = (e.isOwner && recipientCandidates.value.find((a) => a.isMe)) || recipientCandidates.value[0];
    recipientChoice.value = preferred ? String(preferred.playerId) : '';
  }
}

async function load() {
  try {
    const e = await api.getEvening(props.id);
    [players.value, locations.value] = await Promise.all([api.listPlayers(e.groupId), api.listLocations()]);
    applyEvening(e);
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
    if (result) applyEvening(result);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

// --- Teilnehmer ---

function toggleAttendee(player: Player, checked: boolean) {
  void run(() => (checked ? api.addAttendee(props.id, { playerId: player.id }) : api.removeAttendee(props.id, player.id)));
}

function addGuest() {
  const name = guestName.value.trim();
  if (!name) return;
  void run(async () => {
    const result = await api.addAttendee(props.id, { newPlayerName: name });
    players.value = await api.listPlayers(result.groupId);
    guestName.value = '';
    return result;
  });
}

function attendeeLocked(playerId: number): boolean {
  return attendees.value.find((a) => a.playerId === playerId)?.locked ?? false;
}

// --- Neue Position ---

function setMode(next: 'single' | 'shared') {
  mode.value = next;
  // Geteilt: standardmäßig zahlen alle Teilnehmer mit
  if (next === 'shared') shareIds.value = attendees.value.map((a) => a.playerId);
}

function onItemInput() {
  // Geteilte Positionen kosten jedes Mal anders, dafür gibt es keinen Preisvorschlag
  if (mode.value === 'shared') return;
  const known = menu.value.find((m) => m.name.toLowerCase() === itemName.value.trim().toLowerCase());
  if (known && !priceTouched.value) priceText.value = centsToInput(known.priceCents);
}

function onPlayerChange() {
  if (playerChoice.value !== NEW_PLAYER) newPlayerName.value = '';
}

async function addConsumption() {
  if (!evening.value || formError.value) return;
  const isNew = mode.value === 'single' && playerChoice.value === NEW_PLAYER;
  await run(async () => {
    const target =
      mode.value === 'shared'
        ? { sharedWith: shareIds.value }
        : {
            ...(isNew ? { newPlayerName: newPlayerName.value.trim() } : { playerId: Number(playerChoice.value) }),
            ...(containedIn.value ? { containedInId: Number(containedIn.value) } : {}),
          };
    const result = await api.addConsumption(props.id, {
      ...target,
      itemName: itemName.value.trim(),
      quantity: quantity.value,
      unitCents: parseEuro(priceText.value)!,
    });
    // Neue Artikel und Preise stehen jetzt auf der Karte (bzw. bei den geteilten Namen), neue Personen in der Gruppe
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
    containedIn.value = '';
    return result;
  });
}

// --- Positionen bearbeiten ---

/** Mengenänderungen nacheinander senden, damit schnelle Klicks sich nicht überholen */
let quantityQueue: Promise<void> = Promise.resolve();
let pendingQuantity = 0;

/** Ändert die Menge sofort in der Anzeige (ohne die Seite zu sperren) und speichert im Hintergrund.
 *  Die Beträge pro Person kommen mit der Antwort vom Server. */
function changeQuantity(item: EveningItem, delta: number) {
  const next = item.quantity + delta;
  if (next < 1) {
    removeItem(item);
    return;
  }
  const e = evening.value!;
  const local = e.items.find((i) => i.id === item.id)!;
  local.quantity = next;
  local.totalCents = next * local.unitCents;
  e.totalCents = e.items.filter((i) => i.containedInId === null).reduce((sum, i) => sum + i.totalCents, 0);
  pendingQuantity++;
  quantityQueue = quantityQueue.then(async () => {
    try {
      const result = await api.updateConsumption(item.id, { quantity: next });
      // Erst nach der letzten Änderung den Stand vom Server übernehmen, sonst springt die Zahl zurück
      if (--pendingQuantity === 0) applyEvening(result);
    } catch (err) {
      pendingQuantity--;
      error.value = (err as Error).message;
      applyEvening(await api.getEvening(props.id).catch(() => evening.value!));
    }
  });
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
  const who = item.shared ? 'geteilt' : `von ${item.playerName}`;
  if (confirm(`${item.quantity} × ${item.itemName} (${who}) entfernen?`)) {
    void run(() => api.deleteConsumption(item.id));
  }
}

function startEditShares(item: EveningItem) {
  editingSharesOf.value = item.id;
  editShareIds.value = item.shares.map((s) => s.playerId);
}

function saveShares(item: EveningItem) {
  void run(async () => {
    const result = await api.updateConsumption(item.id, { sharedWith: editShareIds.value });
    editingSharesOf.value = null;
    return result;
  });
}

function startEditContained(item: EveningItem) {
  editingContainedOf.value = item.id;
  editContainedIds.value = singleItems.value.filter((i) => i.containedInId === item.id).map((i) => i.id);
}

function saveContained(item: EveningItem) {
  void run(async () => {
    const result = await api.setContained(item.id, editContainedIds.value);
    editingContainedOf.value = null;
    return result;
  });
}

function containerName(id: number | null): string {
  return evening.value?.items.find((i) => i.id === id)?.itemName ?? '';
}

// --- Abend ---

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
  const e = evening.value;
  if (!e) return;
  const question = e.items.length
    ? `Abend mit ${e.items.length} ${e.items.length === 1 ? 'Position' : 'Positionen'} und ${e.attendees.length} ` +
      `${e.attendees.length === 1 ? 'Teilnehmer' : 'Teilnehmern'} löschen? Das lässt sich nicht rückgängig machen.`
    : 'Diesen Abend löschen?';
  if (!confirm(question)) return;
  await run(async () => {
    await api.deleteEvening(props.id);
    await router.push({ name: 'evenings' });
  });
}

// --- Abrechnung ---

function bill() {
  const recipient = attendees.value.find((a) => String(a.playerId) === recipientChoice.value);
  if (!recipient) return;
  const text =
    `Abend zur Zahlung freigeben? Danach lassen sich Positionen und Teilnehmer nicht mehr ändern.\n\n` +
    `Das Geld bekommt ${recipient.playerName}.`;
  if (confirm(text)) void run(() => api.billEvening(props.id, recipient.playerId));
}

function reopen() {
  if (confirm('Abend wieder öffnen? Positionen und Teilnehmer lassen sich dann wieder ändern.')) {
    void run(() => api.reopenEvening(props.id));
  }
}

function togglePaid(a: EveningAttendee) {
  void run(() => api.markPaid(props.id, a.playerId, !a.paid));
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
      <span class="status" :class="`status-${evening.status}`">{{ EVENING_STATUS_LABELS[evening.status] }}</span>
    </h2>

    <p v-if="error" class="msg-error">{{ error }}</p>

    <p v-if="evening.attendees.length > 1">
      <RouterLink :to="{ name: 'lanes', params: { id: evening.id } }" role="button" class="secondary outline small">
        🎳 Bahnen auslosen
      </RouterLink>
    </p>

    <!-- Abgerechnet: eigener Anteil zuerst -->
    <article v-if="evening.status !== 'open' && me && !me.isRecipient && me.amountCents > 0" class="my-share">
      <header>Dein Anteil</header>
      <p class="my-amount">{{ formatEuro(me.amountCents) }}</p>
      <p v-if="me.paid" class="msg-ok">
        Bezahlt<template v-if="me.paidAt"> am {{ formatDateTime(me.paidAt) }}</template>
        <template v-if="me.paidBy && me.paidBy !== session.me?.user.username"> (abgehakt von {{ me.paidBy }})</template>.
      </p>
      <p v-else-if="evening.recipient" class="muted recipient">
        An
        <UserAvatar :name="evening.recipient.playerName" :url="evening.recipient.avatarUrl" :size="48" />
        <span><strong>{{ evening.recipient.playerName }}</strong>, der die Rechnung bezahlt hat.</span>
      </p>
      <div class="actions">
        <a
          v-if="!me.paid && evening.recipient?.paypalMe"
          :href="paypalLink(evening.recipient.paypalMe, me.amountCents)"
          target="_blank"
          rel="noopener"
          role="button"
        >
          Mit PayPal bezahlen
        </a>
        <button
          v-if="me.canMarkPaid"
          type="button"
          :class="{ secondary: !me.paid, outline: true }"
          :disabled="busy"
          @click="togglePaid(me)"
        >
          {{ me.paid ? 'Doch nicht bezahlt' : 'Als bezahlt markieren' }}
        </button>
      </div>
      <small v-if="!me.paid && !evening.recipient?.paypalMe" class="muted">
        {{ evening.recipient?.playerName }} hat keinen PayPal.Me-Namen hinterlegt – bitte anders bezahlen und dann abhaken.
      </small>
    </article>

    <!-- Abrechnung: Übersicht pro Person -->
    <article v-if="attendees.length">
      <header>
        {{ evening.status === 'open' ? 'Teilnehmer & Beträge' : 'Abrechnung' }}
        <small v-if="evening.status !== 'open' && evening.recipient" class="muted">
          · Geld an
          <span class="with-avatar">
            <UserAvatar :name="evening.recipient.playerName" :url="evening.recipient.avatarUrl" :size="24" />{{
              evening.recipient.playerName
            }}
          </span>
        </small>
      </header>
      <div class="overflow-auto">
        <table class="totals">
          <tbody>
            <tr v-for="a in attendees" :key="a.playerId" :class="{ me: a.isMe }">
              <td class="t-name">
                <span class="with-avatar">
                  <UserAvatar :name="a.playerName" :url="a.avatarUrl" :size="40" />{{ a.playerName }}
                </span>
                <small v-if="a.isRecipient && evening.status !== 'open'" class="muted"> (Empfänger)</small>
                <small v-else-if="!a.hasAccount" class="muted"> (Gast)</small>
              </td>
              <td class="num t-amount">{{ formatEuro(a.amountCents) }}</td>
              <td v-if="evening.status !== 'open'" class="paid-cell t-paid">
                <template v-if="a.isRecipient">–</template>
                <span v-else-if="a.paid" class="msg-ok" :title="a.paidAt ? `${formatDateTime(a.paidAt)}${a.paidBy ? ' von ' + a.paidBy : ''}` : ''">
                  ✓ bezahlt
                </span>
                <span v-else class="msg-warn">offen</span>
                <small v-if="a.paidCentsDiffer" class="msg-warn"> · Betrag hat sich danach geändert</small>
              </td>
              <td v-if="evening.status !== 'open'" class="t-action">
                <button
                  v-if="a.canMarkPaid && !a.isMe"
                  type="button"
                  class="small secondary outline"
                  :disabled="busy"
                  @click="togglePaid(a)"
                >
                  {{ a.paid ? 'Zurücknehmen' : 'Als erhalten markieren' }}
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" class="t-name">Gesamt</th>
              <th class="num t-amount">{{ formatEuro(evening.totalCents) }}</th>
              <th v-if="evening.status !== 'open'" colspan="2" class="t-paid">
                <span v-if="evening.openCents" class="msg-warn">{{ formatEuro(evening.openCents) }} offen</span>
                <span v-else class="msg-ok">alles bezahlt</span>
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-for="(p, i) in evening.problems" :key="i" class="msg-error">{{ p }}</p>

      <div v-if="evening.can.bill && evening.items.length" class="bill-form">
        <label>
          Geld bekommt
          <select v-model="recipientChoice" :disabled="busy">
            <option v-for="a in recipientCandidates" :key="a.playerId" :value="String(a.playerId)">{{ a.playerName }}</option>
          </select>
          <small v-if="recipientCandidates.length === 0" class="msg-warn">
            Es braucht einen Teilnehmer mit Benutzerkonto, der das Geld bekommt.
          </small>
        </label>
        <button type="button" :disabled="busy || !recipientChoice || evening.problems.length > 0" @click="bill">
          Zur Zahlung freigeben
        </button>
      </div>
      <button v-if="evening.can.reopen" type="button" class="secondary outline small" :disabled="busy" @click="reopen">
        Wieder öffnen
      </button>
    </article>

    <!-- Läuft: Stammdaten, Teilnehmer, Eintragen -->
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
      <small v-if="evening.owner" class="muted">Angelegt von {{ evening.owner }}</small>
    </article>

    <article v-if="editable">
      <header>Wer ist dabei?</header>
      <div class="attendee-list">
        <label v-for="p in persons" :key="p.id" :title="attendeeLocked(p.id) ? 'Hat schon Positionen oder Anteile' : ''">
          <input
            type="checkbox"
            :checked="attendeeIds.has(p.id)"
            :disabled="busy || attendeeLocked(p.id)"
            @change="toggleAttendee(p, ($event.target as HTMLInputElement).checked)"
          />
          <span class="with-avatar"><UserAvatar :name="p.name" :url="p.avatarUrl" :size="22" />{{ p.name }}</span>
        </label>
      </div>
      <form class="inline-form" @submit.prevent="addGuest">
        <input v-model="guestName" maxlength="40" placeholder="Gast hinzufügen, z. B. Gerd" :disabled="busy" />
        <button type="submit" class="secondary outline" :disabled="busy || !guestName.trim()">+ Gast</button>
      </form>
    </article>

    <article v-if="editable">
      <header>Position eintragen</header>
      <p v-if="!evening.location" class="msg-warn">Bitte zuerst oben eine Location wählen – die Karte gehört zur Location.</p>
      <template v-else>
        <div role="group" class="mode">
          <button type="button" :class="{ outline: mode !== 'single' }" @click="setMode('single')">Für eine Person</button>
          <button type="button" :class="{ outline: mode !== 'shared' }" @click="setMode('shared')">Geteilt</button>
        </div>
        <form class="add-form" @submit.prevent="addConsumption">
          <template v-if="mode === 'single'">
            <label>
              Person
              <select v-model="playerChoice" :disabled="busy" @change="onPlayerChange">
                <option value="">– bitte wählen –</option>
                <option v-for="a in attendees" :key="a.playerId" :value="String(a.playerId)">{{ a.playerName }}</option>
                <option :value="NEW_PLAYER">+ Neue Person …</option>
              </select>
            </label>
            <label v-if="playerChoice === NEW_PLAYER">
              Name
              <input v-model="newPlayerName" maxlength="40" :disabled="busy" />
            </label>
          </template>
          <label class="item">
            Artikel
            <input
              v-model="itemName"
              list="menu-items"
              maxlength="60"
              autocomplete="off"
              :placeholder="mode === 'shared' ? 'z. B. Bowling' : 'z. B. Pils 0,5'"
              :disabled="busy"
              @input="onItemInput"
            />
            <datalist id="menu-items">
              <template v-if="mode === 'shared'">
                <option v-for="n in sharedNames" :key="n" :value="n"></option>
              </template>
              <template v-else>
                <option v-for="m in menu" :key="m.id" :value="m.name">{{ formatEuro(m.priceCents) }}</option>
              </template>
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
          <label v-if="mode === 'single' && sharedItems.length" class="contained">
            Steckt in
            <select v-model="containedIn" :disabled="busy">
              <option value="">– nein –</option>
              <option v-for="s in sharedItems" :key="s.id" :value="String(s.id)">{{ s.itemName }}</option>
            </select>
          </label>
          <button type="submit" :aria-busy="busy" :disabled="busy || !!formError" :title="formError ?? ''">Eintragen</button>
        </form>
        <fieldset v-if="mode === 'shared'" class="share-list">
          <legend>Wer zahlt mit? <small class="muted">(zu gleichen Teilen)</small></legend>
          <label v-for="a in attendees" :key="a.playerId">
            <input v-model="shareIds" type="checkbox" :value="a.playerId" :disabled="busy" />
            {{ a.playerName }}
          </label>
        </fieldset>
        <small class="muted">
          <template v-if="mode === 'shared'">
            Zum Beispiel die Bahnen: der Betrag wird gleichmäßig verteilt. Geteilte Positionen kommen nicht auf die Karte.
          </template>
          <template v-else-if="sharedItems.length">
            „Steckt in“: z. B. Leihschuhe, die auf der Rechnung im Bowling-Betrag enthalten sind. Die Person zahlt sie
            allein, und sie werden vor dem Verteilen vom Bowling abgezogen.
          </template>
          <template v-if="mode === 'single'">Neue Artikel landen automatisch auf der Karte von {{ evening.location?.name }}.</template>
        </small>
      </template>
    </article>

    <article>
      <header>Positionen</header>
      <p v-if="rows.length === 0" class="muted">Noch nichts eingetragen.</p>
      <div v-else class="overflow-auto">
        <table class="positions">
          <thead>
            <tr>
              <th>Artikel</th>
              <th class="num">Menge</th>
              <th class="num unit-col">Einzelpreis</th>
              <th class="num">Summe</th>
              <th v-if="editable"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in rows" :key="row.key">
              <tr v-if="row.kind === 'heading'" class="group-row">
                <th :colspan="editable ? 5 : 4" scope="rowgroup">
                  <span v-if="row.person" class="with-avatar">
                    <UserAvatar :name="row.person.name" :url="row.person.avatarUrl" :size="32" />{{ row.label }}
                  </span>
                  <template v-else>{{ row.label }}</template>
                </th>
              </tr>
              <tr v-else-if="row.kind === 'share'">
                <td>
                  {{ row.name }} <span class="muted">(Anteil)</span>
                  <small class="muted detail">{{ row.hint }}</small>
                </td>
                <td></td>
                <td class="unit-col"></td>
                <td class="num">{{ formatEuro(row.cents) }}</td>
                <td v-if="editable"></td>
              </tr>
              <tr v-else-if="row.kind === 'sum'" class="sum-row">
                <th scope="row">{{ row.label }}</th>
                <td></td>
                <td class="unit-col"></td>
                <th class="num">{{ formatEuro(row.cents) }}</th>
                <td v-if="editable"></td>
              </tr>
              <tr v-else>
                <td>
                  {{ row.item.itemName }}
                  <template v-if="row.item.shared">
                    <!-- Wer zahlt mit -->
                    <div v-if="editingSharesOf === row.item.id" class="inline-edit">
                      <div class="share-edit">
                        <label v-for="a in attendees" :key="a.playerId">
                          <input v-model="editShareIds" type="checkbox" :value="a.playerId" :disabled="busy" />
                          {{ a.playerName }}
                        </label>
                      </div>
                      <div class="actions">
                        <button type="button" class="small" :disabled="busy || editShareIds.length === 0" @click="saveShares(row.item)">
                          Speichern
                        </button>
                        <button type="button" class="small secondary outline" @click="editingSharesOf = null">Abbrechen</button>
                      </div>
                    </div>
                    <small v-else class="muted detail">
                      geteilt · {{ row.item.shares.map((s) => s.playerName).join(', ') }}
                      <a v-if="editable" href="#" class="small-link" @click.prevent="startEditShares(row.item)">ändern</a>
                    </small>
                    <!-- Was steckt darin -->
                    <div v-if="editingContainedOf === row.item.id" class="inline-edit">
                      <div class="share-edit">
                        <label v-for="i in singleItems" :key="i.id">
                          <input v-model="editContainedIds" type="checkbox" :value="i.id" :disabled="busy" />
                          {{ i.itemName }} ×{{ i.quantity }} ({{ i.playerName }})
                        </label>
                      </div>
                      <div class="actions">
                        <button type="button" class="small" :disabled="busy" @click="saveContained(row.item)">Speichern</button>
                        <button type="button" class="small secondary outline" @click="editingContainedOf = null">Abbrechen</button>
                      </div>
                    </div>
                    <small v-else-if="containedSummary(row.item.id) || (editable && singleItems.length)" class="muted detail">
                      <template v-if="containedSummary(row.item.id)">
                        enthält {{ containedSummary(row.item.id) }}
                        <template v-if="row.item.netCents !== null"> · verteilt: {{ formatEuro(row.item.netCents) }}</template>
                      </template>
                      <a v-if="editable && singleItems.length" href="#" class="small-link" @click.prevent="startEditContained(row.item)">
                        {{ containedSummary(row.item.id) ? 'ändern' : '+ enthält …' }}
                      </a>
                    </small>
                  </template>
                  <small v-else-if="row.item.containedInId !== null" class="muted detail">
                    in {{ containerName(row.item.containedInId) }}
                  </small>
                  <!-- Am Handy ersetzt das die Spalte Einzelpreis -->
                  <small class="muted detail unit-inline">
                    je
                    <a v-if="editable" href="#" @click.prevent="changePrice(row.item)">{{ formatEuro(row.item.unitCents) }}</a>
                    <template v-else>{{ formatEuro(row.item.unitCents) }}</template>
                  </small>
                </td>
                <td class="num">
                  <div class="qty-cell">
                    <button
                      v-if="editable"
                      type="button"
                      class="small secondary outline"
                      :disabled="busy"
                      :aria-label="`${row.item.itemName} eins weniger`"
                      @click="changeQuantity(row.item, -1)"
                    >
                      −
                    </button>
                    <span>{{ row.item.quantity }}</span>
                    <button
                      v-if="editable"
                      type="button"
                      class="small secondary outline"
                      :disabled="busy || row.item.quantity >= 99"
                      :aria-label="`${row.item.itemName} eins mehr`"
                      @click="changeQuantity(row.item, 1)"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td class="num unit-col">
                  <a v-if="editable" href="#" title="Preis ändern" @click.prevent="changePrice(row.item)">{{ formatEuro(row.item.unitCents) }}</a>
                  <template v-else>{{ formatEuro(row.item.unitCents) }}</template>
                </td>
                <td class="num">{{ formatEuro(row.item.totalCents) }}</td>
                <td v-if="editable">
                  <button
                    type="button"
                    class="small secondary outline"
                    :disabled="busy"
                    :aria-label="`${row.item.itemName} entfernen`"
                    @click="removeItem(row.item)"
                  >
                    <span class="remove-text">Entfernen</span><span class="remove-icon" aria-hidden="true">✕</span>
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
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
h2 .status {
  margin-left: 0.5rem;
  font-size: 0.6em;
  vertical-align: middle;
}
.status {
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
.my-share {
  border-left: 4px solid var(--status-review);
}
.recipient {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.my-amount {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
  font-variant-numeric: tabular-nums;
}
.actions a[role='button'],
.actions button {
  width: auto;
  margin-bottom: 0;
}
.attendee-list,
.share-list,
.share-edit {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
}
.attendee-list label,
.share-list label,
.share-edit label {
  white-space: nowrap;
}
/* Touch: Checkbox-Zeilen als große Tippflächen */
@media (pointer: coarse) {
  .attendee-list label,
  .share-list label,
  .share-edit label {
    display: flex;
    align-items: center;
    min-height: 44px;
    margin: 0;
  }
}
.share-list {
  margin-bottom: 0.5rem;
}
.share-edit {
  margin-bottom: 0.5rem;
  font-size: 0.9em;
}
.inline-form {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.75rem;
}
.inline-form input {
  flex: 1;
  min-width: 12rem;
  margin-bottom: 0;
}
.inline-form button {
  width: auto;
  margin-bottom: 0;
}
.mode {
  max-width: 22rem;
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
.positions .group-row th {
  padding-top: 0.4rem;
  padding-bottom: 0.4rem;
  font-size: 0.8em;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--pico-muted-color);
  background: var(--pico-code-background-color);
}
.detail {
  display: block;
}
.positions .sum-row > * {
  font-weight: 700;
  border-top: 2px solid var(--pico-muted-border-color);
}
.detail.unit-inline,
.remove-icon {
  display: none;
}
.inline-edit {
  margin-top: 0.4rem;
}
/* Am Handy: Einzelpreis unter den Namen, Entfernen als ✕, damit nichts seitlich rausläuft */
@media (max-width: 600px) {
  .positions .unit-col,
  .remove-text {
    display: none;
  }
  .remove-icon {
    display: inline;
  }
  .detail.unit-inline {
    display: block;
  }
  .positions th,
  .positions td {
    padding-left: 0.3rem;
    padding-right: 0.3rem;
  }
  .positions .qty-cell {
    gap: 0.25rem;
  }
  .positions button.small {
    padding: 0.2rem 0.45rem;
  }
}
.small-link {
  margin-left: 0.4rem;
  font-size: 0.85em;
}
.totals {
  margin-bottom: 0.5rem;
}
/* Handy: Name und Betrag oben, Zahlstatus und Aktion darunter */
@media (max-width: 600px) {
  .totals,
  .totals tbody,
  .totals tfoot {
    display: block;
  }
  .totals tr {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'name amount'
      'paid action';
    align-items: center;
    gap: 0.2rem 0.5rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--pico-muted-border-color);
  }
  .totals th,
  .totals td {
    padding: 0;
    border: 0;
  }
  .totals .t-name {
    grid-area: name;
  }
  .totals .t-amount {
    grid-area: amount;
  }
  .totals .t-paid {
    grid-area: paid;
  }
  .totals .t-action {
    grid-area: action;
    text-align: right;
  }
  .totals .t-action:empty {
    display: none;
  }
}
.totals tr.me td {
  font-weight: 700;
}
.paid-cell {
  white-space: nowrap;
}
.bill-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0 1rem;
  align-items: flex-end;
  margin-top: 1rem;
}
.bill-form label {
  flex: 1;
  min-width: 12rem;
  max-width: 20rem;
}
.bill-form button {
  width: auto;
  margin-bottom: var(--pico-spacing);
}
</style>
