import type {
  AddConsumption,
  AdminGroup,
  AdminUser,
  ApprovePlayer,
  Entry,
  Evening,
  EveningSummary,
  GroupStats,
  Location,
  Member,
  MenuItem,
  MeResponse,
  Player,
} from './types';

export class UnauthorizedError extends Error {}

/** Wird von der Session gesetzt: Bei 401 außerhalb von /auth zurück zum Login. */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Fehler ${res.status}`;
    try {
      const json = await res.json();
      message = Array.isArray(json.message) ? json.message.join(' ') : (json.message ?? message);
    } catch {
      // keine JSON-Antwort
    }
    if (res.status === 413) message = 'Das Bild ist zu groß (maximal 20 MB).';
    if (res.status === 429) message = 'Zu viele Versuche – bitte eine Minute warten.';
    if (res.status === 401) {
      if (!path.startsWith('/auth/')) onUnauthorized();
      throw new UnauthorizedError(message);
    }
    throw new Error(message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  me: () => request<MeResponse>('GET', '/auth/me'),
  login: (username: string, password: string) => request<MeResponse>('POST', '/auth/login', { username, password }),
  register: (username: string, password: string) => request<MeResponse>('POST', '/auth/register', { username, password }),
  logout: () => request<void>('POST', '/auth/logout'),

  listEntries: (groupId: number, filter?: 'review') =>
    request<Entry[]>('GET', `/groups/${groupId}/entries${filter ? `?filter=${filter}` : ''}`),
  upload: (groupId: number, file: File, playedOn: string) => {
    const body = new FormData();
    body.append('image', file);
    body.append('playedOn', playedOn);
    return request<Entry>('POST', `/groups/${groupId}/entries`, body);
  },
  getEntry: (id: number) => request<Entry>('GET', `/entries/${id}`),
  reprocess: (id: number) => request<Entry>('POST', `/entries/${id}/reprocess`),
  approve: (id: number, playedOn: string, players: ApprovePlayer[]) =>
    request<Entry>('POST', `/entries/${id}/approve`, { playedOn, players }),
  unapprove: (id: number) => request<Entry>('POST', `/entries/${id}/unapprove`),
  deleteEntry: (id: number) => request<void>('DELETE', `/entries/${id}`),

  listPlayers: (groupId: number) => request<Player[]>('GET', `/groups/${groupId}/players`),
  createPlayer: (groupId: number, name: string) => request<Player>('POST', `/groups/${groupId}/players`, { name }),
  updatePlayer: (id: number, data: { name?: string; userId?: number | null }) =>
    request<void>('PATCH', `/players/${id}`, data),
  mergePlayer: (id: number, intoPlayerId: number) => request<void>('POST', `/players/${id}/merge`, { intoPlayerId }),
  deletePlayer: (id: number) => request<void>('DELETE', `/players/${id}`),
  deleteAlias: (id: number) => request<void>('DELETE', `/aliases/${id}`),

  listLocations: () => request<Location[]>('GET', '/locations'),
  createLocation: (name: string) => request<Location>('POST', '/locations', { name }),
  menu: (locationId: number, includeHidden = false) =>
    request<MenuItem[]>('GET', `/locations/${locationId}/menu${includeHidden ? '?hidden=true' : ''}`),
  updateMenuItem: (id: number, data: { name?: string; priceCents?: number; hidden?: boolean }) =>
    request<void>('PATCH', `/menu-items/${id}`, data),
  deleteMenuItem: (id: number) => request<{ hidden: boolean }>('DELETE', `/menu-items/${id}`),

  listEvenings: (groupId: number) => request<EveningSummary[]>('GET', `/groups/${groupId}/evenings`),
  createEvening: (groupId: number, data: { date: string; locationId?: number; label?: string }) =>
    request<Evening>('POST', `/groups/${groupId}/evenings`, data),
  getEvening: (id: number) => request<Evening>('GET', `/evenings/${id}`),
  updateEvening: (id: number, data: { date?: string; locationId?: number | null; label?: string | null }) =>
    request<Evening>('PATCH', `/evenings/${id}`, data),
  deleteEvening: (id: number) => request<void>('DELETE', `/evenings/${id}`),
  addConsumption: (eveningId: number, data: AddConsumption) =>
    request<Evening>('POST', `/evenings/${eveningId}/consumptions`, data),
  updateConsumption: (id: number, data: { quantity?: number; unitCents?: number }) =>
    request<Evening>('PATCH', `/consumptions/${id}`, data),
  deleteConsumption: (id: number) => request<Evening>('DELETE', `/consumptions/${id}`),

  stats: (groupId: number) => request<GroupStats>('GET', `/groups/${groupId}/stats`),

  adminUsers: () => request<AdminUser[]>('GET', '/admin/users'),
  adminUpdateUser: (id: number, data: { isAdmin?: boolean; password?: string }) =>
    request<AdminUser>('PATCH', `/admin/users/${id}`, data),
  adminDeleteUser: (id: number) => request<void>('DELETE', `/admin/users/${id}`),
  adminGroups: () => request<AdminGroup[]>('GET', '/admin/groups'),
  adminCreateGroup: (name: string) => request<{ id: number; name: string }>('POST', '/admin/groups', { name }),
  adminRenameGroup: (id: number, name: string) => request<{ id: number; name: string }>('PATCH', `/admin/groups/${id}`, { name }),
  adminDeleteGroup: (id: number) => request<void>('DELETE', `/admin/groups/${id}`),
  adminMembers: (groupId: number) => request<Member[]>('GET', `/admin/groups/${groupId}/members`),
  adminAddMember: (groupId: number, username: string) =>
    request<Member[]>('POST', `/admin/groups/${groupId}/members`, { username }),
  adminUpdateMember: (groupId: number, userId: number, canUpload: boolean) =>
    request<Member[]>('PATCH', `/admin/groups/${groupId}/members/${userId}`, { canUpload }),
  adminRemoveMember: (groupId: number, userId: number) =>
    request<Member[]>('DELETE', `/admin/groups/${groupId}/members/${userId}`),
};
