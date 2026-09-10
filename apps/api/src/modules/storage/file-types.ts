import { Injectable } from '@nestjs/common';

export const DOCUMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type DocumentMime = (typeof DOCUMENT_MIME_TYPES)[number];

/**
 * Type réel déterminé par la signature binaire du fichier, jamais par l'extension
 * ni par le Content-Type annoncé par le client.
 */
export function detectDocumentMime(content: Buffer): DocumentMime | null {
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'image/jpeg';
  if (content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (content.length >= 5 && content.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');

export type ScanStatus = 'CLEAN' | 'INFECTED' | 'NOT_SCANNED';

/** Analyse antivirus des fichiers reçus (ClamAV ou service tiers à brancher). */
export interface MalwareScanner {
  scan(content: Buffer): Promise<ScanStatus>;
}

/** Aucun antivirus configuré : le fichier est marqué NOT_SCANNED et signalé au réviseur. */
@Injectable()
export class NotConfiguredMalwareScanner implements MalwareScanner {
  async scan(): Promise<ScanStatus> {
    return 'NOT_SCANNED';
  }
}

/** Fichier reçu par multer (stockage mémoire). */
export interface UploadedFileLike {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}
