<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from './api';
import UserAvatar from './components/UserAvatar.vue';
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
        <li class="desk-only">
          <RouterLink :to="{ name: 'evenings' }">
            Abende<span v-if="myOpenCents" class="badge badge-pay" title="Du hast noch etwas zu bezahlen">{{
              formatEuro(myOpenCents)
            }}</span>
          </RouterLink>
        </li>
        <li class="desk-only">
          <RouterLink :to="{ name: 'entries' }">
            Fotos<span v-if="reviewCount" class="badge" :title="`${reviewCount} zur Freigabe`">{{ reviewCount }}</span>
          </RouterLink>
        </li>
        <li class="desk-only"><RouterLink :to="{ name: 'stats' }">Statistik</RouterLink></li>
        <li v-if="session.me.user.isAdmin" class="desk-only"><RouterLink :to="{ name: 'admin' }">Verwaltung</RouterLink></li>
      </ul>
      <ul>
        <li v-if="session.me.groups.length > 1">
          <select :value="session.groupId ?? undefined" aria-label="Gruppe" class="group-select" @change="onGroupChange">
            <option v-for="g in session.me.groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </li>
        <li v-else-if="currentGroup" class="muted">{{ currentGroup.name }}</li>
        <li>
          <RouterLink :to="{ name: 'profile' }" class="muted with-avatar" title="Profil">
            <UserAvatar :name="session.me.user.username" :url="session.me.profile.avatarUrl" :size="28" />
            <span class="profile-name">{{ session.me.user.username }}</span>
          </RouterLink>
        </li>
        <li class="desk-only"><a href="#" @click.prevent="logout">Abmelden</a></li>
      </ul>
    </nav>
  </header>
  <main class="container">
    <RouterView v-if="session.loaded" />
  </main>
  <!-- Am Handy: Hauptnavigation unten, mit dem Daumen erreichbar -->
  <nav v-if="session.me" class="tabbar" aria-label="Hauptnavigation">
    <RouterLink :to="{ name: 'evenings' }">
      <span class="tab-icon" aria-hidden="true">🎳</span>
      <span>Abende</span>
      <span v-if="myOpenCents" class="badge badge-pay" :title="`Du zahlst noch ${formatEuro(myOpenCents)}`">{{
        formatEuro(myOpenCents)
      }}</span>
    </RouterLink>
    <RouterLink :to="{ name: 'entries' }">
      <span class="tab-icon" aria-hidden="true">📷</span>
      <span>Fotos</span>
      <span v-if="reviewCount" class="badge" :title="`${reviewCount} zur Freigabe`">{{ reviewCount }}</span>
    </RouterLink>
    <RouterLink :to="{ name: 'stats' }">
      <span class="tab-icon" aria-hidden="true">📈</span>
      <span>Statistik</span>
    </RouterLink>
    <RouterLink v-if="session.me.user.isAdmin" :to="{ name: 'admin' }">
      <span class="tab-icon" aria-hidden="true">⚙️</span>
      <span>Verwaltung</span>
    </RouterLink>
  </nav>
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
.tabbar {
  display: none;
}
/* Am Handy: Links wandern in die untere Leiste, oben bleiben Gruppe und Profil (Abmelden steht im Profil) */
@media (max-width: 767px) {
  .desk-only,
  .profile-name {
    display: none;
  }
  nav {
    flex-wrap: nowrap;
  }
  .group-select {
    max-width: 11rem;
  }
  .tabbar {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 10;
    display: flex;
    background: var(--pico-card-background-color, var(--pico-background-color));
    border-top: 1px solid var(--pico-muted-border-color);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .tabbar a {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    min-height: 3.5rem;
    padding: 0.3rem 0.25rem;
    font-size: 0.75rem;
    text-decoration: none;
    color: var(--pico-muted-color);
  }
  .tabbar a.router-link-active {
    color: var(--pico-primary);
    font-weight: 700;
  }
  .tab-icon {
    font-size: 1.35rem;
    line-height: 1;
  }
  .tabbar .badge {
    position: absolute;
    top: 0.2rem;
    left: 50%;
    margin: 0 0 0 0.5em;
  }
}
</style>
