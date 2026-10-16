import { Body, Controller, Post } from '@nestjs/common';

import { Auth } from 'src/auth/decorators/auth.decorator';

import { ParseGggsDto } from './dto/parse-gggs.dto';
import { LegacyImportService } from './legacy-import.service';

@Auth()
@Controller('legacy-import')
export class LegacyImportController {
  constructor(private readonly legacyImportService: LegacyImportService) {}

  /** Parses a Windows `.gggs` file (base64) into an import draft. Nothing is saved. */
  @Post('gggs')
  parse(@Body() parseGggsDto: ParseGggsDto) {
    return this.legacyImportService.parse(parseGggsDto);
  }
}
