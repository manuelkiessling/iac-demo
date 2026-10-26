export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}
export type TodoPatch = Partial<Pick<Todo, 'title' | 'completed'>>;
export abstract class TodoStore {
  abstract list(): Promise<Todo[]>;
  abstract create(todo: Todo): Promise<void>;
  abstract update(id: string, patch: TodoPatch): Promise<Todo | undefined>;
  abstract delete(id: string): Promise<boolean>;
}
export class MemoryTodoStore extends TodoStore {
  private readonly todos = new Map<string, Todo>();
  async list() { return [...this.todos.values()].map(todo => ({ ...todo })); }
  async create(todo: Todo) { this.todos.set(todo.id, { ...todo }); }
  async update(id: string, patch: TodoPatch) {
    const todo = this.todos.get(id);
    if (!todo) return undefined;
    const updated = { ...todo, ...patch };
    this.todos.set(id, updated);
    return { ...updated };
  }
  async delete(id: string) { return this.todos.delete(id); }
}
