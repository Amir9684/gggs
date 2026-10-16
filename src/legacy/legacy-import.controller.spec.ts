import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';

import { LegacyImportController } from './legacy-import.controller';
import { LegacyImportService } from './legacy-import.service';

describe('POST /legacy-import/gggs/parse', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LegacyImportController],
      providers: [LegacyImportService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]).post(
      '/legacy-import/gggs/parse',
    );

  it('reads the multipart `file` field', async () => {
    const response = await post().attach(
      'file',
      Buffer.from('not a gggs file'),
      'site.gggs',
    );

    const body = response.body as { statusCode: number; messages: string[] };
    expect(body.statusCode).toBe(400);
    expect(body.messages[0]).toContain('GGGS');
  });

  it('reports a missing file instead of crashing', async () => {
    const response = await post();
    const body = response.body as { statusCode: number };
    expect(body.statusCode).toBe(400);
  });
});
