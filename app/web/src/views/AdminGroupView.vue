<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { loadSession } from '../session';
import type { AdminGroup, AdminUser, Member, Player } from '../types';

const props = defineProps<{ id: number }>();

const group = ref<AdminGroup | null>(null);
const members = ref<Member[]>([]);
const players = ref<Player[]>([]);
const users = ref<AdminUser[]>([]);
const newMember = ref('');
const newPlayer = ref('');
const error = ref<string | null>(null);
const busy = ref(false);

/** Registrierte Benutzer, die noch nicht Mitglied sind – Vorschläge fürs Aufnehmen */
const candidates = computed(() => users.value.filter((u) => !members.value.some((m) => m.userId === u.id)));

async function load() {
  try {
    const [groups, m, p, u] = await Promise.all([
      api.adminGroups(),
      api.adminMembers(props.id),
      api.listPlayers(props.id),
      api.adminUsers(),
    ]);
    group.value = groups.find((g) => g.id === props.id) ?? null;
    members.value = m;
    players.value = p;
    users.value = u;
    error.value = null;
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function run(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = null;
  try {
    await action();
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function addMember() {
  const username = newMember.value.trim();
  if (!username) return;
  void run(async () => {
    await api.adminAddMember(props.id, username);
    newMember.value = '';
    await loadSession();
  });
}

function toggleUpload(m: Member) {
  void run(() => api.adminUpdateMember(props.id, m.userId, !m.canUpload));
}

function removeMember(m: Member) {
  if (confirm(`${m.username} aus der Gruppe entfernen? Seine Uploads und Spiele bleiben erhalten.`)) {
    void run(async () => {
      await api.adminRemoveMember(props.id, m.userId);
      await loadSession();
    });
  }
}

function createPlayer() {
  const name = newPlayer.value.trim();
  if (!name) return;
  void run(async () => {
    await api.createPlayer(props.id, name);
    newPlayer.value = '';
  });
}

function renamePlayer(p: Player) {
  const name = prompt('Neuer Name des Spielers:', p.name)?.trim();
  if (name && name !== p.name) void run(() => api.updatePlayer(p.id, { name }));
}

function linkUser(p: Player, e: Event) {
  const value = (e.target as HTMLSelectElement).value;
  void run(() => api.updatePlayer(p.id, { userId: value ? Number(value) : null }));
}

function mergePlayer(p: Player, e: Event) {
  const select = e.target as HTMLSelectElement;
  const target = players.value.find((t) => t.id === Number(select.value));
  select.value = '';
  if (target && confirm(`„${p.name}“ mit „${target.name}“ zusammenlegen? Alle Spiele und Aliase gehen auf „${target.name}“ über.`)) {
    void run(() => api.mergePlayer(p.id, target.id));
  }
}

function deletePlayer(p: Player) {
  if (confirm(`Spieler „${p.name}“ löschen?`)) void run(() => api.deletePlayer(p.id));
}

function deleteAlias(p: Player, alias: { id: number; alias: string }) {
  if (confirm(`Alias „${alias.alias}“ von „${p.name}“ entfernen? Der Name wird bei der nächsten Freigabe neu zugeordnet.`)) {
    void run(() => api.deleteAlias(alias.id));
  }
}

onMounted(load);
</script>

<template>
  <p><RouterLink :to="{ name: 'admin' }">← Zurück zur Verwaltung</RouterLink></p>
  <h2>{{ group?.name ?? 'Gruppe' }}</h2>
  <p v-if="error" class="msg-error">{{ error }}</p>

  <section>
    <h3>Mitglieder</h3>
    <form class="inline-form" @submit.prevent="addMember">
      <input v-model="newMember" list="member-candidates" placeholder="Benutzername" autocomplete="off" />
      <datalist id="member-candidates">
        <option v-for="u in candidates" :key="u.id" :value="u.username" />
      </datalist>
      <button type="submit" :disabled="busy || !newMember.trim()">Aufnehmen</button>
    </form>
    <p v-if="members.length === 0" class="muted">Noch keine Mitglieder.</p>
    <div v-else class="overflow-auto">
      <table>
        <thead>
          <tr>
            <th>Benutzer</th>
            <th>Upload-Recht</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in members" :key="m.userId">
            <th scope="row">{{ m.username }}<small v-if="m.isAdmin" class="muted"> (Admin)</small></th>
            <td>
              <label class="switch">
                <input type="checkbox" role="switch" :checked="m.canUpload" :disabled="busy" @change="toggleUpload(m)" />
                {{ m.canUpload ? 'darf hochladen' : 'nein' }}
              </label>
            </td>
            <td>
              <button type="button" class="small secondary outline" :disabled="busy" @click="removeMember(m)">Entfernen</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <small class="muted">Alle Mitglieder sehen Einträge und Statistik und dürfen fremde Fotos prüfen und freigeben.</small>
  </section>

  <section>
    <h3>Spieler & Aliase</h3>
    <p class="muted">
      Spieler entstehen meist bei der Freigabe. Aliase sind die Namen auf der Anzeige, die automatisch diesem Spieler zugeordnet
      werden.
    </p>
    <form class="inline-form" @submit.prevent="createPlayer">
      <input v-model="newPlayer" placeholder="Neuer Spieler" maxlength="40" />
      <button type="submit" :disabled="busy || !newPlayer.trim()">Anlegen</button>
    </form>
    <p v-if="players.length === 0" class="muted">Noch keine Spieler.</p>
    <div v-else class="overflow-auto">
      <table>
        <thead>
          <tr>
            <th>Spieler</th>
            <th>Aliase</th>
            <th>Spiele</th>
            <th>Konto</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in players" :key="p.id">
            <th scope="row">{{ p.name }}</th>
            <td>
              <span v-for="a in p.aliases" :key="a.id" class="alias">
                {{ a.alias }}
                <a href="#" title="Alias entfernen" @click.prevent="deleteAlias(p, a)">×</a>
              </span>
              <span v-if="p.aliases.length === 0" class="muted">–</span>
            </td>
            <td>{{ p.games }}</td>
            <td>
              <select :value="p.userId ?? ''" class="compact" :disabled="busy" aria-label="Konto verknüpfen" @change="linkUser(p, $event)">
                <option value="">– keins –</option>
                <option v-for="u in users" :key="u.id" :value="u.id">{{ u.username }}</option>
              </select>
            </td>
            <td class="actions">
              <button type="button" class="small secondary outline" :disabled="busy" @click="renamePlayer(p)">Umbenennen</button>
              <select
                v-if="players.length > 1"
                class="compact"
                :disabled="busy"
                aria-label="Zusammenlegen mit"
                @change="mergePlayer(p, $event)"
              >
                <option value="">Zusammenlegen mit …</option>
                <option v-for="t in players.filter((t) => t.id !== p.id)" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
              <button
                v-if="p.games === 0"
                type="button"
                class="small secondary outline"
                :disabled="busy"
                @click="deletePlayer(p)"
              >
                Löschen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
section {
  margin-bottom: 2rem;
}
.inline-form {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.inline-form input {
  flex: 1;
  min-width: 12rem;
}
.inline-form button {
  width: auto;
}
.muted {
  color: var(--pico-muted-color);
}
.alias {
  display: inline-block;
  margin: 0 0.5rem 0.25rem 0;
  padding: 0 0.4rem;
  border: 1px solid var(--pico-muted-border-color);
  border-radius: var(--pico-border-radius);
  font-size: 0.85em;
  white-space: nowrap;
}
.alias a {
  text-decoration: none;
  margin-left: 0.25rem;
}
select.compact {
  width: auto;
  margin-bottom: 0;
  padding: 0.3rem 2rem 0.3rem 0.5rem;
  font-size: 0.875rem;
}
.switch {
  margin-bottom: 0;
}
td.actions {
  flex-wrap: nowrap;
}
</style>
