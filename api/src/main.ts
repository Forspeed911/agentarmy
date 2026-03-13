import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
    app.enableCors();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    const port = process.env.PORT || 3000;
    await app.listen(port, '0.0.0.0');
    console.log(`API listening on port ${port}`);
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}
bootstrap();
