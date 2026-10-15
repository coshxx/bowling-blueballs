<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from './api';
import { formatEuro } from './format';
import { applySession, currentGroup, selectGroup, session } from './session';

const router = useRouter();
const route = useRoute();

/** Fotos, die auf Freigabe warten, und was man selbst noch zahlen muss – nach jedem Seitenwechsel neu */
const reviewCount = ref(0);
const myOpenCents = ref(0);
watch(
  [() => currentGroup.value?.id, () => route.fullPath],
  async ([groupId]) => {
    if (!groupId) {
      reviewCount.value = 0;
      myOpenCents.value = 0;
      return;
    }
    try {
      const [review, evenings] = await Promise.all([api.listEntries(groupId, 'review'), api.listEvenings(groupId)]);
      reviewCount.value = review.length;
      myOpenCents.value = evenings.reduce((sum, e) => sum + e.myOpenCents, 0);
    } catch {
      // Zähler sind nur ein Hinweis
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
        <li>
          <RouterLink :to="{ name: 'evenings' }">
            Abende<span v-if="myOpenCents" class="badge badge-pay" title="Du hast noch etwas zu bezahlen">{{
              formatEuro(myOpenCents)
            }}</span>
          </RouterLink>
        </li>
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
        <li><RouterLink :to="{ name: 'profile' }" class="muted" title="Profil">{{ session.me.user.username }}</RouterLink></li>
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
.badge-pay {
  background: var(--status-failed);
}
</style>
