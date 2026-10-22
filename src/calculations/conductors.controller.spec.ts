import type { INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';

import { AppZodValidationPipe } from 'src/app/zod-validation-pipe';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';

import { ConductorsController } from './conductors.controller';
import { ConductorsService } from './conductors.service';

const sizingBodySchema = z.object({
  data: z.object({
    minimumAreaMm2: z.number(),
    standardSizeMm2: z.number().nullable(),
    allowableTemperature: z.number(),
  }),
});

const materialsBodySchema = z.object({
  data: z.object({
    materials: z.array(z.unknown()),
    standardSizesMm2: z.array(z.number()),
  }),
});

describe('ConductorsController (HTTP)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConductorsController],
      providers: [
        ConductorsService,
        { provide: APP_PIPE, useClass: AppZodValidationPipe },
      ],
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

  it('GET /conductors/materials returns the catalog', async () => {
    const res = await request(app.getHttpServer())
      .get('/conductors/materials')
      .expect(200);
    const body = materialsBodySchema.parse(res.body);
    expect(body.data.materials).toHaveLength(14);
    expect(body.data.standardSizesMm2).toHaveLength(11);
  });

  it('POST /conductors/sizing returns the minimum and standard size', async () => {
    const res = await request(app.getHttpServer())
      .post('/conductors/sizing')
      .send({
        material: 'COPPER_ANNEALED_SOFT_DRAWN',
        faultCurrent: 10000,
        duration: 0.5,
      })
      .expect(201);
    const body = sizingBodySchema.parse(res.body);
    expect(body.data.minimumAreaMm2).toBeCloseTo(25.1, 1);
    expect(body.data.standardSizeMm2).toBe(35);
    expect(body.data.allowableTemperature).toBe(1083);
  });

  it('POST /conductors/sizing rejects an invalid body with 400', async () => {
    await request(app.getHttpServer())
      .post('/conductors/sizing')
      .send({ material: 'NOPE', faultCurrent: -5, duration: 0 })
      .expect(400);
  });

  it('POST /conductors/sizing rejects an allowable temperature below ambient', async () => {
    await request(app.getHttpServer())
      .post('/conductors/sizing')
      .send({
        material: 'ALUMINUM_EC_GRADE',
        faultCurrent: 5000,
        duration: 1,
        ambientTemperature: 40,
        allowableTemperature: 30,
      })
      .expect(400);
  });
});
