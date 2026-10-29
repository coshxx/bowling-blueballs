import type {
  AddConsumption,
  AdminGroup,
  AdminUser,
  ApprovePlayer,
  Entry,
  Evening,
  EveningSummary,
  Lane,
  Lanes,
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
    if (res.status === 413) message = `Das Bild ist zu groß (maximal ${path === '/auth/avatar' ? 10 : 20} MB).`;
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
  version: () => request<{ version: string | null }>('GET', '/version'),
  me: () => request<MeResponse>('GET', '/auth/me'),
  login: (username: string, password: string) => request<MeResponse>('POST', '/auth/login', { username, password }),
  authOptions: () => request<{ inviteCodeRequired: boolean }>('GET', '/auth/options'),
  register: (username: string, password: string, inviteCode?: string) =>
    request<MeResponse>('POST', '/auth/register', { username, password, inviteCode }),
  logout: () => request<void>('POST', '/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('PATCH', '/auth/password', { currentPassword, newPassword }),
  updateProfile: (data: { paypalMe: string | null }) => request<MeResponse>('PATCH', '/auth/profile', data),
  setAvatar: (file: File) => {
    const body = new FormData();
    body.append('image', file);
    return request<MeResponse>('PUT', '/auth/avatar', body);
  },
  removeAvatar: () => request<MeResponse>('DELETE', '/auth/avatar'),

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
  approve: (id: number, playedOn: string, isTeamGame: boolean, players: ApprovePlayer[]) =>
    request<Entry>('POST', `/entries/${id}/approve`, { playedOn, isTeamGame, players }),
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
  sharedNames: (locationId: number) => request<string[]>('GET', `/locations/${locationId}/shared-names`),
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
  getLanes: (eveningId: number) => request<Lanes>('GET', `/evenings/${eveningId}/lanes`),
  rollLanes: (eveningId: number, playerIds: number[]) =>
    request<Lanes>('POST', `/evenings/${eveningId}/lanes/roll`, { playerIds }),
  assignLane: (eveningId: number, playerId: number, lane: Lane) =>
    request<Lanes>('PUT', `/evenings/${eveningId}/lanes/assignment`, { playerId, lane }),
  addAttendee: (eveningId: number, data: { playerId?: number; newPlayerName?: string }) =>
    request<Evening>('POST', `/evenings/${eveningId}/attendees`, data),
  removeAttendee: (eveningId: number, playerId: number) =>
    request<Evening>('DELETE', `/evenings/${eveningId}/attendees/${playerId}`),
  markPaid: (eveningId: number, playerId: number, paid: boolean) =>
    request<Evening>('POST', `/evenings/${eveningId}/attendees/${playerId}/paid`, { paid }),
  billEvening: (id: number, recipientId?: number) =>
    request<Evening>('POST', `/evenings/${id}/bill`, recipientId ? { recipientId } : {}),
  reopenEvening: (id: number) => request<Evening>('POST', `/evenings/${id}/reopen`),
  addConsumption: (eveningId: number, data: AddConsumption) =>
    request<Evening>('POST', `/evenings/${eveningId}/consumptions`, data),
  updateConsumption: (
    id: number,
    data: { quantity?: number; unitCents?: number; sharedWith?: number[]; containedInId?: number | null },
  ) =>
    request<Evening>('PATCH', `/consumptions/${id}`, data),
  deleteConsumption: (id: number) => request<Evening>('DELETE', `/consumptions/${id}`),
  setContained: (id: number, itemIds: number[]) => request<Evening>('PUT', `/consumptions/${id}/contained`, { itemIds }),

  /** Ohne year über alle Jahre */
  stats: (groupId: number, year?: number) =>
    request<GroupStats>('GET', `/groups/${groupId}/stats${year === undefined ? '' : `?year=${year}`}`),

  adminUsers: () => request<AdminUser[]>('GET', '/admin/users'),
  adminUpdateUser: (id: number, data: { isAdmin?: boolean; password?: string }) =>
    request<AdminUser>('PATCH', `/admin/users/${id}`, data),
  adminDeleteUser: (id: number) => request<void>('DELETE', `/admin/users/${id}`),
  adminRemoveAvatar: (id: number) => request<AdminUser>('DELETE', `/admin/users/${id}/avatar`),
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
