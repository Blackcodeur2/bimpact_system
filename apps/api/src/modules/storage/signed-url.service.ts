import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { UUID_RE } from '../../common/crypto';
import { AppConfig } from '../../config/app-config';
import { DOCUMENT_MIME_TYPES, DocumentMime } from './file-types';

export interface SignedFile {
  storageKey: string;
  mimeType: string;
}

export interface SignedUrl {
  /** Chemin relatif à l'origine de l'API : /v1/files/<jeton>. */
  url: string;
  expiresAt: Date;
}

export const DEFAULT_FILE_URL_TTL_SECONDS = 300;

/** URLs temporaires signées (HMAC-SHA256) pour les documents privés (cahier §15). */
@Injectable()
export class SignedUrlService {
  constructor(private readonly config: AppConfig) {}

  sign(file: SignedFile, ttlSeconds = DEFAULT_FILE_URL_TTL_SECONDS): SignedUrl {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = Buffer.from(JSON.stringify({ k: file.storageKey, m: file.mimeType, e: expiresAt })).toString(
      'base64url',
    );
    return { url: `/v1/files/${payload}.${this.signature(payload)}`, expiresAt: new Date(expiresAt * 1000) };
  }

  verify(token: string): SignedFile | null {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return null;

    const expected = Buffer.from(this.signature(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { k?: unknown; m?: unknown; e?: unknown };
      if (typeof data.e !== 'number' || data.e < Math.floor(Date.now() / 1000)) return null;
      if (typeof data.k !== 'string' || !UUID_RE.test(data.k)) return null;
      if (typeof data.m !== 'string' || !DOCUMENT_MIME_TYPES.includes(data.m as DocumentMime)) return null;
      return { storageKey: data.k, mimeType: data.m };
    } catch {
      return null;
    }
  }

  private signature(payload: string): string {
    return createHmac('sha256', this.config.documents.fileUrlSecret).update(payload).digest('base64url');
  }
}
