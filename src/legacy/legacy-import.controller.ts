import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { Auth } from 'src/auth/decorators/auth.decorator';

import {
  LegacyImportService,
  MAX_LEGACY_FILE_BYTES,
  type UploadedLegacyFile,
} from './legacy-import.service';

@Auth()
@Controller('legacy-import')
export class LegacyImportController {
  constructor(private readonly legacyImportService: LegacyImportService) {}

  /**
   * `multipart/form-data` with the file in the `file` field. Parses only —
   * nothing is stored (see `LegacyImportService.parseGggs`).
   */
  @Post('gggs/parse')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_LEGACY_FILE_BYTES } }),
  )
  parseGggs(@UploadedFile() file: UploadedLegacyFile | undefined) {
    return this.legacyImportService.parseGggs(file);
  }
}
