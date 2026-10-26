import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DynamoDBDocumentClient, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoTodoStore } from './dynamodb.store.js';

test('DynamoDB reopening atomically removes the TTL attribute, instead of storing null', async (t) => {
  const send = t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (command: UpdateCommand) => {
    assert.ok(command instanceof UpdateCommand);
    assert.equal(command.input.ConditionExpression, 'attribute_exists(id)');
    assert.match(command.input.UpdateExpression!, /REMOVE #f1/);
    assert.deepEqual(command.input.ExpressionAttributeNames, { '#f0': 'completed', '#f1': 'expiresAt' });
    assert.deepEqual(command.input.ExpressionAttributeValues, { ':v0': false });
    return { Attributes: { id: 'task', completed: false } };
  });
  const store = new DynamoTodoStore('todos');
  await store.update('task', { completed: false, expiresAt: null });
  assert.equal(send.mock.callCount(), 1);
});

test('DynamoDB listing reads every page', async (t) => {
  let page = 0;
  t.mock.method(DynamoDBDocumentClient.prototype, 'send', async (command: ScanCommand) => {
    assert.ok(command instanceof ScanCommand);
    if (page++ === 0) return { Items: [{ id: 'first' }], LastEvaluatedKey: { id: 'first' } };
    assert.deepEqual(command.input.ExclusiveStartKey, { id: 'first' });
    return { Items: [{ id: 'second' }] };
  });
  assert.deepEqual((await new DynamoTodoStore('todos').list()).map(todo => todo.id), ['first', 'second']);
});
