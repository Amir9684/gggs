/**
 * Reader for files written by Visual Basic 6 `Put #n, , variable` on a file
 * opened `For Random` WITHOUT a record length — which is how every Windows
 * GGGS `.gggs` file is written.
 *
 * Layout:
 *  - the file is a sequence of records of `RECORD_LENGTH` (128) bytes; every
 *    `Put` without a record number writes the next record;
 *  - a `Single` is stored as a little-endian IEEE 754 binary32 at the start
 *    of its record;
 *  - a variable-length `String` is stored as a 2-byte little-endian length
 *    followed by that many single-byte characters.
 *
 * The record order and the variable types of each file come from the VB
 * source (`SAVEMENU_Click` of each form, types from `MODULEsave.bas`).
 */
export const RECORD_LENGTH = 128;

export type VbFieldType = 'Single' | 'String';

export class VbRandomFileError extends Error {}

/** Number of records in the file; a short last record still counts. */
export function countRecords(buffer: Buffer): number {
  return Math.ceil(buffer.length / RECORD_LENGTH);
}

function recordBytes(buffer: Buffer, recordIndex: number): Buffer {
  const start = recordIndex * RECORD_LENGTH;
  if (start >= buffer.length) {
    throw new VbRandomFileError(
      `Record ${recordIndex + 1} is missing: the file ends after ${countRecords(buffer)} records.`,
    );
  }
  return buffer.subarray(start, Math.min(start + RECORD_LENGTH, buffer.length));
}

/** A VB `Single` as the number the user saw (about 7 significant digits). */
export function readSingle(buffer: Buffer, recordIndex: number): number {
  const record = recordBytes(buffer, recordIndex);
  if (record.length < 4) {
    throw new VbRandomFileError(
      `Record ${recordIndex + 1} is too short to hold a number.`,
    );
  }
  const value = record.readFloatLE(0);
  return Number(value.toPrecision(7));
}

export function readString(buffer: Buffer, recordIndex: number): string {
  const record = recordBytes(buffer, recordIndex);
  if (record.length < 2) {
    throw new VbRandomFileError(
      `Record ${recordIndex + 1} is too short to hold a string.`,
    );
  }
  const length = record.readUInt16LE(0);
  if (length > RECORD_LENGTH - 2 || 2 + length > record.length) {
    throw new VbRandomFileError(
      `Record ${recordIndex + 1} does not hold a valid string (length ${length}).`,
    );
  }
  return record.toString('latin1', 2, 2 + length);
}

/** Reads every field of a layout, in record order, keyed by field name. */
export function readFields(
  buffer: Buffer,
  layout: ReadonlyArray<{ name: string; type: VbFieldType }>,
): Record<string, number | string> {
  const fields: Record<string, number | string> = {};
  layout.forEach((field, index) => {
    fields[field.name] =
      field.type === 'Single'
        ? readSingle(buffer, index)
        : readString(buffer, index);
  });
  return fields;
}
