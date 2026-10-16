import { Injectable } from '@nestjs/common';

import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';

import { MAX_GGGS_FILE_BYTES, type ParseGggsDto } from './dto/parse-gggs.dto';
import { LegacyImportError, parseGggsFile } from './gggs-import';

@Injectable()
export class LegacyImportService {
  /**
   * Reads a Windows GGGS `.gggs` file and returns what it contains as a
   * draft for a review screen. Stateless: nothing is saved.
   */
  parse(parseGggsDto: ParseGggsDto) {
    return asyncFn(() => {
      const buffer = Buffer.from(parseGggsDto.contentBase64, 'base64');

      if (buffer.length === 0 || buffer.length > MAX_GGGS_FILE_BYTES) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: 'فایل خالی است یا حجم آن بیش از حد مجاز است.',
        };
      }

      try {
        const draft = parseGggsFile(buffer, parseGggsDto.kind);
        return {
          statusCode: HttpStatus.OK,
          messages: [],
          data: draft,
        };
      } catch (error) {
        if (error instanceof LegacyImportError) {
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            data: null,
            messages: `فایل قابل خواندن نیست: ${error.message}`,
          };
        }
        throw error;
      }
    });
  }
}
