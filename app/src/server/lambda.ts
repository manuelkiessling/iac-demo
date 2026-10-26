import { configure as serverlessExpress } from '@codegenie/serverless-express';
import type { Handler } from 'aws-lambda';
import { createApp } from './application.js';
import { DynamoTodoStore } from './dynamodb.store.js';
async function bootstrap(): Promise<Handler> {
  const tableName = process.env['TABLE_NAME'];
  if (!tableName) throw new Error('TABLE_NAME is required.');
  const app = await createApp(new DynamoTodoStore(tableName));
  await app.init();
  return serverlessExpress({ app: app.getHttpAdapter().getInstance() });
}
let proxy: Promise<Handler> | undefined;
export const handler: Handler = async (event, context, callback) => {
  return (await (proxy ??= bootstrap()))(event, context, callback);
};
