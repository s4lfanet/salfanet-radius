import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:3000');

  // CORS — allow frontend (Next.js) to call API
  app.enableCors({
    origin: corsOrigins.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global prefix: /api/v1
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Global exception filter — consistent error response format
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global response interceptor — wraps responses in { success, data }
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  // Swagger / OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Salfanet Radius API')
    .setDescription('REST API for ISP/RADIUS management system')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  logger.log(`Backend API running on http://localhost:${port}/api/v1`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
