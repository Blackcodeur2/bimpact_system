import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { UUID_RE } from '../../common/crypto';
import { AppConfig } from '../../config/app-config';

export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

/**
 * Stockage privé des documents sensibles (KYC, justificatifs).
 * Implémentation actuelle : disque local chiffré. Un fournisseur compatible S3 implémentera la même interface.
 */
export interface DocumentStorage {
  put(key: string, content: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

const FORMAT_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Chaque fichier est chiffré en AES-256-GCM (IV aléatoire, clé serveur, clé de stockage liée en données
 * authentifiées) : copier ou renommer un fichier sur le disque ne permet ni de le lire ni de le substituer.
 * Format : [version 1 octet][IV 12][tag 16][données chiffrées].
 */
@Injectable()
export class EncryptedDiskStorage implements DocumentStorage {
  private readonly directory: string;
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    this.directory = resolve(config.documents.storageDir);
    this.key = config.documents.encryptionKey;
  }

  async put(key: string, content: Buffer): Promise<void> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(key));
    const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(key), Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, cipher.getAuthTag(), encrypted]), {
      flag: 'wx',
      mode: 0o600,
    });
  }

  async get(key: string): Promise<Buffer> {
    const data = await readFile(this.pathFor(key));
    if (data[0] !== FORMAT_VERSION) throw new Error('Format de document inconnu');
    const iv = data.subarray(1, 1 + IV_LENGTH);
    const tag = data.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAAD(Buffer.from(key));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data.subarray(1 + IV_LENGTH + TAG_LENGTH)), decipher.final()]);
  }

  private pathFor(key: string): string {
    if (!UUID_RE.test(key)) throw new Error('Clé de stockage invalide');
    return join(this.directory, `${key}.bin`);
  }
}
