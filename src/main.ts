import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/helper/response-interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalInterceptors(new ResponseInterceptor());

  const config = new DocumentBuilder()
    .setTitle(process.env.API_TITLE || 'GGGS API')
    .setDescription(process.env.API_DESCRIPTION || 'API Documentation')
    .setVersion(process.env.API_VERSION || '1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const cleanedDocument = cleanupOpenApiDoc(document);

  SwaggerModule.setup('api', app, cleanedDocument);

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
