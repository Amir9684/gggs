import { Injectable } from '@nestjs/common';

import asyncFn from 'src/common/helper/async';
import { HttpStatus } from 'src/common/types';

import {
  LegacyGgggsError,
  parseLegacyGggs,
  type LegacyErrorCode,
} from './legacy-gggs.parser';

/** Real `.gggs` files are a few hundred KB at most. */
const MAX_LEGACY_FILE_BYTES = 2 * 1024 * 1024;

/** The part of an uploaded file this service uses (multer's memory storage). */
interface UploadedLegacyFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

const ERROR_MESSAGES: Record<LegacyErrorCode, string> = {
  EMPTY: 'فایل خالی است.',
  UNKNOWN_FORMAT: 'این فایل، فایل داده‌ی GGGS قابل شناسایی نیست.',
  NO_GEOMETRY: 'فایل هیچ گره یا میله‌ای ندارد.',
  INVALID_GEOMETRY:
    'شبکهٔ موجود در فایل مساحت ندارد (همهٔ گره‌ها روی یک خط قرار دارند).',
};

@Injectable()
export class LegacyImportService {
  /**
   * Reads an uploaded Windows `.gggs` file and returns what it contains —
   * grid layout, and for full files the soil / fault / conductor inputs —
   * **without saving anything**. The client shows this for review and then
   * creates the grid and its elements through the normal grid endpoints,
   * so an import goes through the same validation and ownership checks as
   * anything drawn by hand.
   */
  parseGggs(file: UploadedLegacyFile | undefined) {
    return asyncFn(() => {
      if (!file || !file.buffer) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: 'فایلی ارسال نشده است.',
        };
      }

      if (file.size > MAX_LEGACY_FILE_BYTES) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          data: null,
          messages: 'حجم فایل بیش از حد مجاز است.',
        };
      }

      try {
        const parsed = parseLegacyGggs(file.buffer);

        return {
          statusCode: HttpStatus.OK,
          messages: [],
          data: { fileName: file.originalname, ...parsed },
        };
      } catch (error) {
        if (error instanceof LegacyGgggsError) {
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            data: null,
            messages: ERROR_MESSAGES[error.code],
          };
        }
        throw error;
      }
    });
  }
}

export { MAX_LEGACY_FILE_BYTES };
export type { UploadedLegacyFile };
