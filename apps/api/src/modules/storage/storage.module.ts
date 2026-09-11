import { Controller, Get, HttpStatus, Inject, Module, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/access/access.decorators';
import { AppException } from '../../common/errors/app-exception';
import { DOCUMENT_STORAGE, DocumentStorage, EncryptedDiskStorage } from './document-storage';
import { MALWARE_SCANNER, NotConfiguredMalwareScanner } from './file-types';
import { PrivateUploadService } from './private-upload.service';
import { SignedUrlService } from './signed-url.service';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(
    private readonly urls: SignedUrlService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
  ) {}

  /** Téléchargement d'un document privé : le jeton signé et limité dans le temps fait office d'autorisation. */
  @Public()
  @Get(':token')
  async download(@Param('token') token: string, @Res() res: Response) {
    const file = this.urls.verify(token);
    if (!file) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FILE_LINK_INVALID', 'Ce lien a expiré ou est invalide.');
    }
    let content: Buffer;
    try {
      content = await this.storage.get(file.storageKey);
    } catch {
      throw new AppException(HttpStatus.NOT_FOUND, 'FILE_NOT_FOUND', 'Fichier introuvable.');
    }
    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(content.length),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      // L'application web (autre origine en développement) doit pouvoir afficher l'image.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(content);
  }
}

@Module({
  controllers: [FilesController],
  providers: [
    SignedUrlService,
    PrivateUploadService,
    { provide: DOCUMENT_STORAGE, useClass: EncryptedDiskStorage },
    { provide: MALWARE_SCANNER, useClass: NotConfiguredMalwareScanner },
  ],
  exports: [SignedUrlService, PrivateUploadService, DOCUMENT_STORAGE, MALWARE_SCANNER],
})
export class StorageModule {}
