import 'reflect-metadata';
import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { fileURLToPath } from 'node:url';
import { TodoStore } from './store.js';
import { TodosController, TodosService } from './todos.js';
@Module({})
class AppModule {}
export async function createApp(store: TodoStore, logging = true) {
  const app = await NestFactory.create<NestExpressApplication>({
    module: AppModule, controllers: [TodosController],
    providers: [TodosService, { provide: TodoStore, useValue: store }],
  }, { logger: logging ? ['log', 'warn', 'error'] : false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.useStaticAssets(fileURLToPath(new URL('../public', import.meta.url)));
  return app;
}
