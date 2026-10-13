import { Injectable } from '@nestjs/common';
import { request } from 'node:http';
import { config } from '../config';

export interface ParserResponse {
  status: 'ok' | 'uncertain';
  result: unknown;
  problems: string[];
  /** Gelesene Zwischenstände pro Spieler, gleiche Reihenfolge wie result.players */
  scores: number[][];
}

export class ParserError extends Error {}

/** Ruft den Parser-Dienst auf. Bewusst node:http statt fetch: Ein Lauf dauert mehrere
 *  Minuten, und fetch bricht nach 5 Minuten ohne Antwort-Header ab. */
@Injectable()
export class ParserClient {
  parse(image: Buffer, mime: string): Promise<ParserResponse> {
    const url = new URL('/parse', config.parserUrl);
    return new Promise((resolve, reject) => {
      const req = request(
        url,
        { method: 'POST', headers: { 'Content-Type': mime, 'Content-Length': image.length } },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('error', reject);
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let body: { error?: string } & Partial<ParserResponse>;
            try {
              body = JSON.parse(text);
            } catch {
              reject(new ParserError(`Ungültige Antwort vom Parser (HTTP ${res.statusCode})`));
              return;
            }
            if (res.statusCode !== 200) {
              reject(new ParserError(body.error ?? `Parser-Fehler (HTTP ${res.statusCode})`));
              return;
            }
            resolve(body as ParserResponse);
          });
        },
      );
      req.on('error', (e) => reject(new ParserError(`Parser nicht erreichbar: ${e.message}`)));
      req.end(image);
    });
  }
}
