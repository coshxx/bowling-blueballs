/** URL des Avatars oder null; der Dateiname in der URL macht den langen Cache nach einem neuen Upload ungültig. */
export function avatarUrl(user: { id: number; avatarFile: string | null } | null | undefined): string | null {
  return user?.avatarFile ? `/api/users/${user.id}/avatar?f=${user.avatarFile}` : null;
}
