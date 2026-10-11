import { INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppZodValidationPipe } from 'src/app/zod-validation-pipe';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';

import { ConductorsController } from './conductors.controller';
import { ConductorsService } from './conductors.service';

interface SizingBody {
  data: {
    minimumAreaMm2: number;
    standardSizeMm2: number | null;
    allowableTemperature: number;
  };
}

interface MaterialsBody {
  data: { materials: unknown[]; standardSizesMm2: number[] };
}

describe('ConductorsController (HTTP)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

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
    const res = await request(server())
      .get('/conductors/materials')
      .expect(200);
    const body = res.body as MaterialsBody;
    expect(body.data.materials).toHaveLength(14);
    expect(body.data.standardSizesMm2).toHaveLength(11);
  });

  it('POST /conductors/sizing returns the minimum and standard size', async () => {
    const res = await request(server())
      .post('/conductors/sizing')
      .send({
        material: 'COPPER_ANNEALED_SOFT_DRAWN',
        faultCurrent: 10000,
        duration: 0.5,
      })
      .expect(201);
    const body = res.body as SizingBody;
    expect(body.data.minimumAreaMm2).toBeCloseTo(25.1, 1);
    expect(body.data.standardSizeMm2).toBe(35);
    expect(body.data.allowableTemperature).toBe(1083);
  });

  it('POST /conductors/sizing rejects an invalid body with 400', async () => {
    await request(server())
      .post('/conductors/sizing')
      .send({ material: 'NOPE', faultCurrent: -5, duration: 0 })
      .expect(400);
  });

  it('POST /conductors/sizing rejects an allowable temperature below ambient', async () => {
    await request(server())
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
