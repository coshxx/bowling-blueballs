import { join } from 'node:path';

const dataDir = process.env.DATA_DIR ?? '/data';

export const config = {
  port: Number(process.env.PORT ?? 8000),
  host: process.env.HOST ?? '0.0.0.0',
  imagesDir: join(dataDir, 'images'),
  parserUrl: process.env.PARSER_URL ?? 'http://parser:8080',
  webDist: process.env.WEB_DIST,
  maxUploadBytes: 20 * 1024 * 1024,
};
