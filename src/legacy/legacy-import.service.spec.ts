import { HttpStatus } from 'src/common/types';

import { LegacyImportService } from './legacy-import.service';
import { RECORD_SIZE } from './legacy-gggs.parser';

/** The smallest valid grid-only file: 4 nodes, no rods (capacity 4 / 1). */
function tinyGridOnlyFile(): Buffer {
  const records: Buffer[] = [];
  const push = (write: (b: Buffer) => void) => {
    const record = Buffer.alloc(RECORD_SIZE);
    write(record);
    records.push(record);
  };
  const int = (v: number) => push((b) => b.writeInt16LE(v));
  const single = (v: number) => push((b) => b.writeFloatLE(v));

  int(4); // Ttd
  int(1); // TRod
  push((b) => {
    b.writeUInt16LE(3);
    b.write('2.5', 2, 'latin1');
  });
  int(4);
  int(0);
  int(4);
  int(4);
  const nodes = [
    [1, 1],
    [11, 1],
    [1, 11],
    [11, 11],
  ];
  nodes.forEach(() => [0, 0].forEach(single)); // Xnode2 / Ynode2
  nodes.forEach((n) => n.forEach(single)); // Xnode / Ynode
  nodes.forEach((n) => n.forEach(single)); // XYnode
  [0, 0].forEach(single); // one empty rod
  for (let i = 0; i < 20; i++) [0, 0].forEach(single); // wells
  return Buffer.concat(records);
}

const upload = (buffer: Buffer, name = 'site.gggs') => ({
  buffer,
  originalname: name,
  size: buffer.length,
});

describe('LegacyImportService.parseGggs', () => {
  const service = new LegacyImportService();

  it('returns the parsed file and its name', async () => {
    const response = await service.parseGggs(upload(tinyGridOnlyFile()));

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toMatchObject({
      fileName: 'site.gggs',
      format: 'grid-only',
      grid: { length: 10, width: 10, conductorCount: 4 },
    });
  });

  it('answers 400 when no file was sent', async () => {
    const response = await service.parseGggs(undefined);
    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(response.data).toBeNull();
  });

  it('answers 400 with a clear message for a file that is not GGGS data', async () => {
    const response = await service.parseGggs(
      upload(Buffer.from('hello world, definitely not a grid')),
    );
    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(response.messages[0]).toContain('GGGS');
  });

  it('answers 400 for an oversized file', async () => {
    const response = await service.parseGggs({
      buffer: Buffer.alloc(10),
      originalname: 'big.gggs',
      size: 3 * 1024 * 1024,
    });
    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });
});
