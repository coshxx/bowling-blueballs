<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { applySession } from '../session';

const route = useRoute();
const router = useRouter();

const mode = ref<'login' | 'register'>('login');
const username = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    const me =
      mode.value === 'login'
        ? await api.login(username.value, password.value)
        : await api.register(username.value, password.value);
    applySession(me);
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/';
    await router.replace(next);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function switchMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login';
  error.value = null;
}
</script>

<template>
  <article class="auth">
    <h1>🎳 Bowling</h1>
    <h2>{{ mode === 'login' ? 'Anmelden' : 'Registrieren' }}</h2>
    <form @submit.prevent="submit">
      <label>
        Benutzername
        <input v-model.trim="username" autocomplete="username" required minlength="3" maxlength="30" />
      </label>
      <label>
        Passwort
        <input
          v-model="password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          required
          minlength="4"
        />
        <small v-if="mode === 'register'">Mindestens 4 Zeichen. Eine E-Mail-Adresse brauchst du nicht.</small>
      </label>
      <p v-if="error" class="msg-error">{{ error }}</p>
      <button type="submit" :aria-busy="busy" :disabled="busy">
        {{ mode === 'login' ? 'Anmelden' : 'Konto anlegen' }}
      </button>
    </form>
    <p>
      <template v-if="mode === 'login'">Noch kein Konto?</template>
      <template v-else>Schon ein Konto?</template>
      <a href="#" @click.prevent="switchMode">{{ mode === 'login' ? 'Registrieren' : 'Anmelden' }}</a>
    </p>
    <small v-if="mode === 'login'" class="muted">Passwort vergessen? Ein Admin kann dir ein neues setzen.</small>
  </article>
</template>

<style scoped>
.auth {
  max-width: 420px;
  margin: 2rem auto;
}
.muted {
  color: var(--pico-muted-color);
}
</style>
