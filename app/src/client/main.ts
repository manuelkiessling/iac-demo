import { Component, inject, signal, computed } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { HttpClient, provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
interface Todo { id: string; title: string; completed: boolean; createdAt: string; }
@Component({
  selector: 'app-root',
  imports: [FormsModule],
  template: `
    <main>
      <header><span class="eyebrow">AWS · Infrastructure as code</span><h1>Small steps.</h1><p>A little list for getting things done.</p></header>
      <section aria-label="Todo list">
        <form (ngSubmit)="add()" class="add-form">
          <label class="sr-only" for="new-todo">New task</label>
          <input id="new-todo" name="title" [(ngModel)]="title" maxlength="200" placeholder="What needs doing?" required [disabled]="busy()">
          <button [disabled]="busy() || !title.trim()">Add task</button>
        </form>
        @if (error()) { <p role="alert" class="error">{{ error() }}</p> }
        <div class="toolbar"><span aria-live="polite">{{ remaining() }} remaining</span><button class="quiet" (click)="load()" [disabled]="busy()">Refresh</button></div>
        @if (loading()) { <p role="status" class="empty">Loading your list…</p> }
        @else {
          <ul>
            @for (todo of todos(); track todo.id) {
              <li>
                <input type="checkbox" [checked]="todo.completed" [attr.aria-label]="'Complete ' + todo.title" [disabled]="busy()" (change)="update(todo, {completed: !todo.completed})">
                @if (editing() === todo.id) {
                  <form class="edit-form" (ngSubmit)="save(todo)">
                    <input aria-label="Task title" name="editTitle" [(ngModel)]="editTitle" maxlength="200" required [disabled]="busy()">
                    <button class="quiet" [disabled]="busy() || !editTitle.trim()">Save</button>
                    <button class="quiet" type="button" (click)="editing.set(null)" [disabled]="busy()">Cancel</button>
                  </form>
                } @else {
                  <span class="task" [class.done]="todo.completed">{{ todo.title }}</span>
                  <button class="quiet" (click)="edit(todo)" [disabled]="busy()" [attr.aria-label]="'Edit ' + todo.title">Edit</button>
                  <button class="quiet delete" (click)="remove(todo)" [disabled]="busy()" [attr.aria-label]="'Delete ' + todo.title">Delete</button>
                }
              </li>
            } @empty { <li class="empty">A clear slate. Add your first task above.</li> }
          </ul>
        }
      </section>
      <footer>Angular + NestJS · AWS Lambda + DynamoDB<br>One repository. App and infrastructure, together.</footer>
    </main>
  `,
})
class App {
  private readonly http = inject(HttpClient);
  readonly todos = signal<Todo[]>([]);
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly editing = signal<string | null>(null);
  readonly remaining = computed(() => this.todos().filter(todo => !todo.completed).length);
  title = '';
  editTitle = '';
  constructor() { void this.load(); }
  private async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await action(); }
    catch (error) {
      this.error.set(error instanceof HttpErrorResponse && error.status === 404
        ? 'This task has changed. Refresh the list and try again.'
        : 'Could not save or load your list. Please try again.');
    } finally { this.busy.set(false); this.loading.set(false); }
  }
  async load() { await this.run(async () => this.todos.set(await firstValueFrom(this.http.get<Todo[]>('/api/todos')))); }
  async add() {
    if (!this.title.trim()) return;
    await this.run(async () => {
      const todo = await firstValueFrom(this.http.post<Todo>('/api/todos', { title: this.title }));
      this.todos.update(todos => [todo, ...todos]); this.title = '';
    });
  }
  edit(todo: Todo) { this.editing.set(todo.id); this.editTitle = todo.title; }
  async save(todo: Todo) { if (this.editTitle.trim()) await this.update(todo, { title: this.editTitle }); }
  async update(todo: Todo, patch: Partial<Pick<Todo, 'title' | 'completed'>>) {
    await this.run(async () => {
      const updated = await firstValueFrom(this.http.patch<Todo>('/api/todos/' + todo.id, patch));
      this.todos.update(todos => todos.map(item => item.id === updated.id ? updated : item)); this.editing.set(null);
    });
  }
  async remove(todo: Todo) {
    await this.run(async () => {
      await firstValueFrom(this.http.delete('/api/todos/' + todo.id));
      this.todos.update(todos => todos.filter(item => item.id !== todo.id));
    });
  }
}
bootstrapApplication(App, { providers: [provideHttpClient()] }).catch(console.error);
