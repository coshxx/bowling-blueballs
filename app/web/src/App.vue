<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from './api';
import { applySession, currentGroup, selectGroup, session } from './session';

const router = useRouter();
const route = useRoute();

/** Fotos, die auf Freigabe warten – nach jedem Seitenwechsel neu gezählt */
const reviewCount = ref(0);
watch(
  [() => currentGroup.value?.id, () => route.fullPath],
  async ([groupId]) => {
    if (!groupId) {
      reviewCount.value = 0;
      return;
    }
    try {
      reviewCount.value = (await api.listEntries(groupId, 'review')).length;
    } catch {
      // Zähler ist nur ein Hinweis
    }
  },
  { immediate: true },
);

async function logout() {
  await api.logout().catch(() => undefined);
  applySession(null);
  await router.push({ name: 'login' });
}

function onGroupChange(e: Event) {
  selectGroup(Number((e.target as HTMLSelectElement).value));
}
</script>

<template>
  <header v-if="session.me" class="container">
    <nav>
      <ul>
        <li><strong>🎳 Bowling</strong></li>
        <li><RouterLink :to="{ name: 'evenings' }">Abende</RouterLink></li>
        <li>
          <RouterLink :to="{ name: 'entries' }">
            Fotos<span v-if="reviewCount" class="badge" :title="`${reviewCount} zur Freigabe`">{{ reviewCount }}</span>
          </RouterLink>
        </li>
        <li><RouterLink :to="{ name: 'stats' }">Statistik</RouterLink></li>
        <li v-if="session.me.user.isAdmin"><RouterLink :to="{ name: 'admin' }">Verwaltung</RouterLink></li>
      </ul>
      <ul>
        <li v-if="session.me.groups.length > 1">
          <select :value="session.groupId ?? undefined" aria-label="Gruppe" class="group-select" @change="onGroupChange">
            <option v-for="g in session.me.groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </li>
        <li v-else-if="currentGroup" class="muted">{{ currentGroup.name }}</li>
        <li class="muted">{{ session.me.user.username }}</li>
        <li><a href="#" @click.prevent="logout">Abmelden</a></li>
      </ul>
    </nav>
  </header>
  <main class="container">
    <RouterView v-if="session.loaded" />
  </main>
</template>

<style scoped>
nav {
  flex-wrap: wrap;
}
.group-select {
  margin-bottom: 0;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
}
.muted {
  color: var(--pico-muted-color);
}
a.router-link-exact-active {
  font-weight: 700;
}
.badge {
  display: inline-block;
  min-width: 1.4em;
  margin-left: 0.35em;
  padding: 0 0.4em;
  border-radius: 1em;
  background: var(--status-review);
  color: #fff;
  font-size: 0.75em;
  font-weight: 700;
  line-height: 1.6;
  text-align: center;
}
</style>
