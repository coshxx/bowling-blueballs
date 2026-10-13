import { computed, reactive } from 'vue';
import { api, UnauthorizedError } from './api';
import type { MeResponse } from './types';

const GROUP_KEY = 'bowling.groupId';

function readStoredGroup(): number | null {
  try {
    const v = Number(localStorage.getItem(GROUP_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export const session = reactive({
  loaded: false,
  me: null as MeResponse | null,
  groupId: readStoredGroup(),
});

export const currentGroup = computed(() => session.me?.groups.find((g) => g.id === session.groupId) ?? null);

export function applySession(me: MeResponse | null) {
  session.me = me;
  session.loaded = true;
  // Gespeicherte Gruppe nur behalten, wenn man noch Mitglied ist
  if (me && !me.groups.some((g) => g.id === session.groupId)) {
    selectGroup(me.groups[0]?.id ?? null);
  }
}

export function selectGroup(id: number | null) {
  session.groupId = id;
  try {
    if (id === null) localStorage.removeItem(GROUP_KEY);
    else localStorage.setItem(GROUP_KEY, String(id));
  } catch {
    // Speicher nicht verfügbar – Auswahl gilt dann nur für diese Sitzung
  }
}

export async function loadSession() {
  try {
    applySession(await api.me());
  } catch (e) {
    if (!(e instanceof UnauthorizedError)) throw e;
    applySession(null);
  }
}
