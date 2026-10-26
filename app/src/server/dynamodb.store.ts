import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { TodoStore, type Todo, type TodoPatch } from './store.js';

export class DynamoTodoStore extends TodoStore {
  private readonly client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  constructor(private readonly tableName: string) { super(); }
  async list(): Promise<Todo[]> {
    const todos: Todo[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(new ScanCommand({ TableName: this.tableName, ExclusiveStartKey: cursor }));
      todos.push(...(page.Items ?? []) as Todo[]);
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return todos;
  }
  async create(todo: Todo) {
    await this.client.send(new PutCommand({ TableName: this.tableName, Item: todo, ConditionExpression: 'attribute_not_exists(id)' }));
  }
  async update(id: string, patch: TodoPatch): Promise<Todo | undefined> {
    const entries = Object.entries(patch);
    const set = entries.flatMap(([, value], i) => value !== null ? [`#f${i} = :v${i}`] : []);
    const remove = entries.flatMap(([, value], i) => value === null ? [`#f${i}`] : []);
    try {
      const result = await this.client.send(new UpdateCommand({
        TableName: this.tableName, Key: { id }, ConditionExpression: 'attribute_exists(id)',
        UpdateExpression: [set.length ? 'SET ' + set.join(', ') : '', remove.length ? 'REMOVE ' + remove.join(', ') : ''].filter(Boolean).join(' '),
        ExpressionAttributeNames: Object.fromEntries(entries.map(([key], i) => [`#f${i}`, key])),
        ExpressionAttributeValues: Object.fromEntries(entries.flatMap(([, value], i) => value !== null ? [[`:v${i}`, value]] : [])),
        ReturnValues: 'ALL_NEW',
      }));
      return result.Attributes as Todo;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return undefined;
      throw error;
    }
  }
  async delete(id: string) {
    const result = await this.client.send(new DeleteCommand({ TableName: this.tableName, Key: { id }, ReturnValues: 'ALL_OLD' }));
    return Boolean(result.Attributes);
  }
}
