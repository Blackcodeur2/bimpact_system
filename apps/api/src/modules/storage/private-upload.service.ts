import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception';
import { AppConfig } from '../../config/app-config';
import { DOCUMENT_STORAGE, DocumentStorage } from './document-storage';
import { detectDocumentMime, DocumentMime, MALWARE_SCANNER, MalwareScanner, ScanStatus, UploadedFileLike } from './file-types';
import { SignedUrlService } from './signed-url.service';

export interface StoredDocument {
  storageKey: string;
  mimeType: DocumentMime;
  sizeBytes: number;
  sha256: string;
  scanStatus: ScanStatus;
}

export interface SignedDocumentView {
  id: string;
  type: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  /** URL temporaire signée (chemin relatif à l'origine de l'API). */
  url: string;
  urlExpiresAt: Date;
}

const MIME_LABELS: Record<DocumentMime, string> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'application/pdf': 'PDF' };

/**
 * Réception d'un justificatif (accident, projet…) : taille maximale, type réel lu dans la signature binaire,
 * antivirus, puis stockage privé chiffré. Mêmes garanties que les pièces KYC (cahier §15).
 */
@Injectable()
export class PrivateUploadService {
  constructor(
    private readonly config: AppConfig,
    private readonly urls: SignedUrlService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  async store(file: UploadedFileLike | undefined, allowed: readonly DocumentMime[]): Promise<StoredDocument> {
    if (!file?.buffer?.length) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'DOCUMENT_MISSING', 'Aucun fichier reçu.');
    }
    const { maxBytes } = this.config.documents;
    if (file.buffer.length > maxBytes) {
      throw new AppException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'DOCUMENT_TOO_LARGE',
        `Fichier trop volumineux (maximum ${Math.floor(maxBytes / 1_000_000)} Mo).`,
        { maxBytes },
      );
    }
    const mimeType = detectDocumentMime(file.buffer);
    if (!mimeType || !allowed.includes(mimeType)) {
      throw new AppException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'DOCUMENT_INVALID_TYPE',
        `Formats acceptés : ${allowed.map((mime) => MIME_LABELS[mime]).join(', ')}.`,
      );
    }
    const scanStatus = await this.scanner.scan(file.buffer);
    if (scanStatus === 'INFECTED') {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'DOCUMENT_REJECTED', 'Ce fichier a été refusé par le contrôle de sécurité.');
    }
    const storageKey = randomUUID();
    await this.storage.put(storageKey, file.buffer);
    return {
      storageKey,
      mimeType,
      sizeBytes: file.buffer.length,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      scanStatus,
    };
  }

  view(document: { id: string; type: string; storageKey: string; mimeType: string; sizeBytes: number; createdAt: Date }): SignedDocumentView {
    const signed = this.urls.sign({ storageKey: document.storageKey, mimeType: document.mimeType });
    return {
      id: document.id,
      type: document.type,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      uploadedAt: document.createdAt,
      url: signed.url,
      urlExpiresAt: signed.expiresAt,
    };
  }
}
