import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Injectable, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, ValidateIf, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { randomUUID } from 'node:crypto';
import { TodoStore } from './store.js';

export class CreateTodo {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 200)
  title!: string;
}
export class UpdateTodo {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 200)
  title?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  completed?: boolean;
}
@Injectable()
export class TodosService {
  constructor(@Inject(TodoStore) private readonly store: TodoStore) {}
  async list() {
    return (await this.store.list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async create(input: CreateTodo) {
    const todo = { id: randomUUID(), title: input.title, completed: false, createdAt: new Date().toISOString() };
    await this.store.create(todo);
    return todo;
  }
  async update(id: string, input: UpdateTodo) {
    const patch = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    if (Object.keys(patch).length === 0) throw new BadRequestException('Provide title or completed.');
    const todo = await this.store.update(id, patch);
    if (!todo) throw new NotFoundException('Todo not found.');
    return todo;
  }
  async delete(id: string) {
    if (!await this.store.delete(id)) throw new NotFoundException('Todo not found.');
  }
}
@Controller('todos')
export class TodosController {
  constructor(private readonly todos: TodosService) {}
  @Get() list() { return this.todos.list(); }
  @Post() create(@Body() input: CreateTodo) { return this.todos.create(input); }
  @Patch(':id') update(@Param('id') id: string, @Body() input: UpdateTodo) { return this.todos.update(id, input); }
  @Delete(':id') @HttpCode(204) delete(@Param('id') id: string) { return this.todos.delete(id); }
}
