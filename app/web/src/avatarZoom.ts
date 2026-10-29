import { reactive } from 'vue';

/** Welches Profilfoto gerade vergrößert angezeigt wird (Overlay hängt einmal in App.vue) */
export const avatarZoom = reactive({ name: '', url: '' });

export function openAvatarZoom(name: string, url: string) {
  avatarZoom.name = name;
  avatarZoom.url = url;
}

export function closeAvatarZoom() {
  avatarZoom.url = '';
}
