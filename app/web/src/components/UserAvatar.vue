<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { openAvatarZoom } from '../avatarZoom';

const props = withDefaults(defineProps<{ name: string; url?: string | null; size?: number; zoom?: boolean }>(), {
  url: null,
  size: 24,
  zoom: true,
});

// Kaputtes Bild (z. B. inzwischen entfernt) → Initialen statt Platzhalter-Icon
const failed = ref(false);
watch(
  () => props.url,
  () => (failed.value = false),
);

const initials = computed(() => {
  const words = props.name.trim().split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
});

/** Antippen vergrößert das Foto; preventDefault, damit ein umgebender Link oder Label nicht mitreagiert */
function onClick(e: Event) {
  if (!props.zoom || !props.url) return;
  e.preventDefault();
  e.stopPropagation();
  openAvatarZoom(props.name, props.url);
}

/** Feste Farbe pro Name, damit dieselbe Person überall gleich aussieht */
const hue = computed(() => {
  let h = 0;
  for (const c of props.name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
});
</script>

<template>
  <img
    v-if="url && !failed"
    :src="url"
    alt=""
    class="avatar"
    :class="{ zoomable: zoom }"
    :style="{ width: `${size}px`, height: `${size}px` }"
    loading="lazy"
    :tabindex="zoom ? 0 : undefined"
    @click="onClick"
    @keydown.enter="onClick"
    @error="failed = true"
  />
  <span
    v-else
    class="avatar avatar-initials"
    aria-hidden="true"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.42}px`, background: `hsl(${hue} 55% 45%)` }"
    >{{ initials }}</span
  >
</template>

<style scoped>
.avatar {
  display: inline-block;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
  vertical-align: middle;
}
.zoomable {
  cursor: zoom-in;
}
.avatar-initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  line-height: 1;
  user-select: none;
}
</style>
