<script setup lang="ts">
import { computed } from 'vue';
import UserAvatar from './UserAvatar.vue';

const props = withDefaults(defineProps<{ people: { name: string; avatarUrl: string | null }[]; max?: number; size?: number }>(), {
  max: 5,
  size: 32,
});

const shown = computed(() => props.people.slice(0, props.max));
const rest = computed(() => props.people.length - shown.value.length);
const label = computed(() => props.people.map((p) => p.name).join(', '));
</script>

<template>
  <span class="stack" role="img" :aria-label="label" :style="{ '--overlap': `${-size * 0.3}px` }">
    <UserAvatar v-for="p in shown" :key="p.name" :name="p.name" :url="p.avatarUrl" :size="size" :title="p.name" class="ring" />
    <span v-if="rest" class="more ring" :title="people.slice(max).map((p) => p.name).join(', ')" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.36}px` }"
      >+{{ rest }}</span
    >
  </span>
</template>

<style scoped>
.stack {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
.ring {
  box-shadow: 0 0 0 2px var(--pico-background-color);
}
.stack > * + * {
  margin-left: var(--overlap);
}
.more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--pico-muted-border-color);
  color: var(--pico-color);
  font-weight: 700;
}
</style>
