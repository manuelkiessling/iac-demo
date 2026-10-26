import { createApp } from './application.js';
import { MemoryTodoStore } from './store.js';
async function main() {
  const app = await createApp(new MemoryTodoStore());
  await app.listen(3000, process.env['HOST'] ?? '127.0.0.1');
  console.log('Todo demo: http://localhost:3000 (in-memory storage)');
}
void main();
