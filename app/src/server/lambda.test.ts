import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from './lambda.js';
import type { Context } from 'aws-lambda';

test('Function URL v2 adapter serves Angular and routes API validation without AWS calls', async () => {
  // Lambda Node.js 24 rejects non-streaming handlers with three parameters,
  // including async functions. A direct JavaScript invocation alone misses this.
  assert.ok(handler.length < 3, 'Lambda Node.js 24 requires a handler without a callback parameter.');
  process.env['TABLE_NAME'] = 'test-only';
  const invoke = (path: string, method = 'GET', body?: string) => handler({
    version: '2.0', routeKey: '$default', rawPath: path, rawQueryString: '',
    headers: { host: 'test.lambda-url.eu-central-1.on.aws', 'content-type': 'application/json' },
    requestContext: { accountId: 'anonymous', apiId: 'test', domainName: 'test.lambda-url.eu-central-1.on.aws',
      domainPrefix: 'test', requestId: 'test', routeKey: '$default', stage: '$default', time: '', timeEpoch: 0,
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' } },
    body, isBase64Encoded: false,
  }, {} as Context);
  const page = await invoke('/');
  assert.equal(page.statusCode, 200);
  const html = page.isBase64Encoded ? Buffer.from(page.body, 'base64').toString() : page.body;
  assert.match(html, /<app-root>/);
  const script = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(script);
  assert.equal((await invoke('/' + script)).statusCode, 200);
  assert.equal((await invoke('/api/todos', 'POST', JSON.stringify({ title: '' }))).statusCode, 400);
  assert.equal((await invoke('/api/unknown')).statusCode, 404);
});
