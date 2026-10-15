import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // In Prod steht Tailscale Serve auf 127.0.0.1 davor: req.ip aus X-Forwarded-For, sonst teilen sich alle das Rate-Limit
  app.set('trust proxy', 'loopback');
  app.setGlobalPrefix('api');
  app.use(cookieParser(config.sessionSecret));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
}

void bootstrap();
