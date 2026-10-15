<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../api';
import { paypalLink } from '../format';
import { applySession, session } from '../session';

const paypalMe = ref(session.me?.profile.paypalMe ?? '');
const busy = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);

/** Akzeptiert auch eingefügte Links wie "https://www.paypal.me/name" */
function normalize(input: string): string {
  return input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, '')
    .replace(/[/?#].*$/, '');
}

async function save() {
  busy.value = true;
  message.value = null;
  error.value = null;
  try {
    const name = normalize(paypalMe.value);
    applySession(await api.updateProfile({ paypalMe: name || null }));
    paypalMe.value = name;
    message.value = name ? 'Gespeichert.' : 'PayPal.Me-Name entfernt.';
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h2>Profil</h2>
  <article>
    <form @submit.prevent="save">
      <label>
        PayPal.Me-Name
        <input v-model="paypalMe" maxlength="60" placeholder="z. B. maxmustermann" autocomplete="off" :disabled="busy" />
        <small>
          Wenn du an einem Abend bezahlt hast, bekommen die anderen damit einen Link, der den Betrag schon ausfüllt.
          Deinen Namen findest du in der PayPal-App unter „PayPal.Me“.
        </small>
      </label>
      <p v-if="normalize(paypalMe)" class="muted">
        Test:
        <a :href="paypalLink(normalize(paypalMe), 100)" target="_blank" rel="noopener">{{ paypalLink(normalize(paypalMe), 100) }}</a>
        sollte deine PayPal-Seite mit 1,00 € öffnen.
      </p>
      <button type="submit" :aria-busy="busy" :disabled="busy">Speichern</button>
    </form>
    <p v-if="message" class="msg-ok">{{ message }}</p>
    <p v-if="error" class="msg-error">{{ error }}</p>
  </article>
</template>

<style scoped>
.muted {
  color: var(--pico-muted-color);
}
form button {
  width: auto;
}
</style>
