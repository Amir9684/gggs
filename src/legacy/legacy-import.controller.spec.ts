import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';

import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';

import { LegacyImportController } from './legacy-import.controller';
import { LegacyImportService } from './legacy-import.service';

const failureBodySchema = z.object({
  statusCode: z.number(),
  messages: z.array(z.string()),
});

describe('POST /legacy-import/gggs/parse', () => {
  let app: INestApplication<App>;

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
    request(app.getHttpServer()).post('/legacy-import/gggs/parse');

  it('reads the multipart `file` field', async () => {
    const response = await post().attach(
      'file',
      Buffer.from('not a gggs file'),
      'site.gggs',
    );

    const body = failureBodySchema.parse(response.body);
    expect(body.statusCode).toBe(400);
    expect(body.messages[0]).toContain('GGGS');
  });

  it('reports a missing file instead of crashing', async () => {
    const response = await post();
    const body = failureBodySchema.parse(response.body);
    expect(body.statusCode).toBe(400);
  });
});
