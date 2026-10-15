<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import MenuAdmin from '../components/MenuAdmin.vue';
import { formatAgo, formatDateTime } from '../format';
import { loadSession, session } from '../session';
import type { AdminGroup, AdminUser } from '../types';

const tab = ref<'groups' | 'users' | 'menus'>('groups');
const users = ref<AdminUser[]>([]);
const groups = ref<AdminGroup[]>([]);
const newGroupName = ref('');
const error = ref<string | null>(null);
const busy = ref(false);

async function load() {
  try {
    [users.value, groups.value] = await Promise.all([api.adminUsers(), api.adminGroups()]);
    error.value = null;
  } catch (e) {
    error.value = (e as Error).message;
  }
}

/** Führt eine Aktion aus, lädt danach neu und aktualisiert die eigene Session (z. B. Gruppenliste). */
async function run(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = null;
  try {
    await action();
    await Promise.all([load(), loadSession()]);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function createGroup() {
  const name = newGroupName.value.trim();
  if (!name) return;
  void run(async () => {
    await api.adminCreateGroup(name);
    newGroupName.value = '';
  });
}

function renameGroup(g: AdminGroup) {
  const name = prompt('Neuer Name der Gruppe:', g.name)?.trim();
  if (name && name !== g.name) void run(() => api.adminRenameGroup(g.id, name));
}

function deleteGroup(g: AdminGroup) {
  if (confirm(`Gruppe „${g.name}“ mit allen ${g.entries} Einträgen und Fotos löschen?`)) {
    void run(() => api.adminDeleteGroup(g.id));
  }
}

function toggleAdmin(u: AdminUser) {
  const verb = u.isAdmin ? 'die Admin-Rolle entziehen' : 'zum Admin machen';
  if (confirm(`${u.username} ${verb}?`)) void run(() => api.adminUpdateUser(u.id, { isAdmin: !u.isAdmin }));
}

function setPassword(u: AdminUser) {
  const password = prompt(`Neues Passwort für ${u.username} (mindestens 4 Zeichen):`);
  if (password === null) return;
  void run(async () => {
    await api.adminUpdateUser(u.id, { password });
    alert(`Passwort für ${u.username} gesetzt. Bestehende Anmeldungen wurden beendet.`);
  });
}

function deleteUser(u: AdminUser) {
  if (confirm(`Benutzer ${u.username} löschen? Seine Uploads und Spiele bleiben erhalten.`)) {
    void run(() => api.adminDeleteUser(u.id));
  }
}

onMounted(load);
</script>

<template>
  <h2>Verwaltung</h2>
  <div role="group" class="tabs">
    <button type="button" :class="{ outline: tab !== 'groups' }" @click="tab = 'groups'">Gruppen</button>
    <button type="button" :class="{ outline: tab !== 'users' }" @click="tab = 'users'">Benutzer</button>
    <button type="button" :class="{ outline: tab !== 'menus' }" @click="tab = 'menus'">Speisekarten</button>
  </div>
  <p v-if="error" class="msg-error">{{ error }}</p>

  <template v-if="tab === 'groups'">
    <form class="inline-form" @submit.prevent="createGroup">
      <input v-model="newGroupName" placeholder="Name der neuen Gruppe, z. B. The Infernal Pins" maxlength="60" />
      <button type="submit" :disabled="busy || !newGroupName.trim()">Gruppe anlegen</button>
    </form>

    <p v-if="groups.length === 0">Noch keine Gruppen.</p>
    <div v-else class="overflow-auto">
      <table>
        <thead>
          <tr>
            <th>Gruppe</th>
            <th>Mitglieder</th>
            <th>Spieler</th>
            <th>Einträge</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in groups" :key="g.id">
            <th scope="row">
              <RouterLink :to="{ name: 'admin-group', params: { id: g.id } }">{{ g.name }}</RouterLink>
            </th>
            <td>{{ g.members }}</td>
            <td>{{ g.players }}</td>
            <td>{{ g.entries }} <small class="muted">({{ g.approvedEntries }} freigegeben)</small></td>
            <td class="actions">
              <RouterLink :to="{ name: 'admin-group', params: { id: g.id } }" role="button" class="small">
                Mitglieder & Spieler
              </RouterLink>
              <button type="button" class="small secondary outline" :disabled="busy" @click="renameGroup(g)">Umbenennen</button>
              <button
                type="button"
                class="small secondary outline"
                :disabled="busy || g.approvedEntries > 0"
                :title="g.approvedEntries > 0 ? 'Gruppen mit freigegebenen Einträgen lassen sich nicht löschen' : ''"
                @click="deleteGroup(g)"
              >
                Löschen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>

  <MenuAdmin v-else-if="tab === 'menus'" />

  <template v-else>
    <div class="overflow-auto">
      <table>
        <thead>
          <tr>
            <th>Benutzer</th>
            <th>Rolle</th>
            <th>Gruppen</th>
            <th>Registriert</th>
            <th>Zuletzt online</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <th scope="row">{{ u.username }}<small v-if="u.id === session.me?.user.id" class="muted"> (du)</small></th>
            <td>{{ u.isAdmin ? 'Admin' : 'Benutzer' }}</td>
            <td>{{ u.groups.join(', ') || '–' }}</td>
            <td>{{ formatDateTime(u.createdAt) }}</td>
            <td>
              <span v-if="u.lastSeenAt" :title="formatDateTime(u.lastSeenAt)">{{ formatAgo(u.lastSeenAt) }}</span>
              <template v-else>–</template>
            </td>
            <td class="actions">
              <button type="button" class="small secondary outline" :disabled="busy" @click="toggleAdmin(u)">
                {{ u.isAdmin ? 'Admin entziehen' : 'Zum Admin machen' }}
              </button>
              <button type="button" class="small secondary outline" :disabled="busy" @click="setPassword(u)">Passwort setzen</button>
              <button
                v-if="u.id !== session.me?.user.id"
                type="button"
                class="small secondary outline"
                :disabled="busy"
                @click="deleteUser(u)"
              >
                Löschen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <small class="muted">Neue Benutzer registrieren sich selbst. Danach nimmst du sie unter „Gruppen“ auf.</small>
  </template>
</template>

<style scoped>
.tabs {
  max-width: 30rem;
}
.inline-form {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.inline-form input {
  flex: 1;
  min-width: 14rem;
}
.inline-form button {
  width: auto;
}
.muted {
  color: var(--pico-muted-color);
}
td.actions {
  flex-wrap: nowrap;
}
</style>
