import { Controller, Get, Header } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Public } from '../auth/decorators';
import { config } from '../config';

/** index.html verweist auf die gehashten Bundles, ändert sich also genau mit dem Frontend-Build.
 *  In Dev (kein webDist) gibt es keine Version, Vite lädt dort selbst neu. */
const version = config.webDist
  ? createHash('sha256').update(readFileSync(join(config.webDist, 'index.html'))).digest('hex').slice(0, 12)
  : null;

@Controller('version')
export class VersionController {
  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  get() {
    return { version };
  }
}
