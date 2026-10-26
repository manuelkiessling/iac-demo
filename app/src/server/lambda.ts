import { configure as serverlessExpress } from '@codegenie/serverless-express';
import type { APIGatewayProxyEventV2, APIGatewayProxyResult, Context } from 'aws-lambda';
import { createApp } from './application.js';
import { DynamoTodoStore } from './dynamodb.store.js';
type AsyncHandler = (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResult>;

async function bootstrap(): Promise<AsyncHandler> {
  const tableName = process.env['TABLE_NAME'];
  if (!tableName) throw new Error('TABLE_NAME is required.');
  const app = await createApp(new DynamoTodoStore(tableName));
  await app.init();
  // v5 returns a Promise-based two-argument handler, but its types still require
  // the legacy callback argument. Keep that signature out of our exported handler.
  return serverlessExpress({ app: app.getHttpAdapter().getInstance() }) as unknown as AsyncHandler;
}
let proxy: Promise<AsyncHandler> | undefined;
export const handler: AsyncHandler = async (event, context) => {
  return (await (proxy ??= bootstrap()))(event, context);
};
