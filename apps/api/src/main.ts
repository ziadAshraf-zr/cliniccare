import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new AllExceptionsFilter());

  // ترويسات أمان أساسية (القسم 8). CSP الكامل على الواجهة نفسها عبر next.config.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());

  // نفس الأصل عبر rewrites في Next.js (القسم 5)، فلا حاجة لإعداد CORS معقد؛
  // يبقى صريحًا هنا كخط دفاع ثانٍ فقط.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
