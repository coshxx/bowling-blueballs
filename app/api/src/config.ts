import { join } from 'node:path';

const dataDir = process.env.DATA_DIR ?? '/data';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Umgebungsvariable ${name} fehlt`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8000),
  host: process.env.HOST ?? '0.0.0.0',
  imagesDir: join(dataDir, 'images'),
  parserUrl: process.env.PARSER_URL ?? 'http://parser:8080',
  webDist: process.env.WEB_DIST,
  maxUploadBytes: 20 * 1024 * 1024,
  sessionSecret: required('SESSION_SECRET'),
  // Die App läuft im LAN über HTTP, ein Secure-Cookie käme dort nie an
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  /** Benutzernamen (kleingeschrieben), die bei Registrierung/Login automatisch Admin werden */
  adminUsers: (process.env.ADMIN_USERS ?? '')
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean),
};
