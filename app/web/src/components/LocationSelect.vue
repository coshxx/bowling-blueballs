<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../api';
import type { Location } from '../types';

/** Auswahl einer Location samt „+ Neue Location …“; legt neue Locations direkt an. */
const model = defineModel<number | null>({ required: true });
const props = defineProps<{ locations: Location[]; disabled?: boolean }>();
const emit = defineEmits<{ created: [location: Location] }>();

const NEW = -1;
const error = ref<string | null>(null);

async function onChange(e: Event) {
  const select = e.target as HTMLSelectElement;
  const value = Number(select.value);
  if (value !== NEW) {
    model.value = value || null;
    return;
  }
  select.value = String(model.value ?? 0);
  const name = prompt('Name der neuen Location, z. B. Bowlingcenter Nord:')?.trim();
  if (!name) return;
  try {
    const location = await api.createLocation(name);
    emit('created', location);
    model.value = location.id;
    error.value = null;
  } catch (err) {
    error.value = (err as Error).message;
  }
}
</script>

<template>
  <select :value="model ?? 0" :disabled="props.disabled" @change="onChange">
    <option :value="0">– keine –</option>
    <option v-for="l in props.locations" :key="l.id" :value="l.id">{{ l.name }}</option>
    <option :value="NEW">+ Neue Location …</option>
  </select>
  <small v-if="error" class="msg-error">{{ error }}</small>
</template>
