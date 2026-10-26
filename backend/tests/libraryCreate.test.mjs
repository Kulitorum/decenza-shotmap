import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const png = Buffer.from('89504e470d0a1a0a', 'hex');
const entry = { version: 1, type: 'theme', tags: [], appVersion: '2.1.0', data: { theme: { name: 'Test' } } };

function event(thumbnails = true) {
  const boundary = 'preview-test-boundary';
  const parts = [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="entry"\r\n\r\n${JSON.stringify(entry)}\r\n`)];
  if (thumbnails) {
    for (const name of ['thumbnail_full', 'thumbnail_compact']) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`), png, Buffer.from('\r\n'));
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    requestContext: { http: { method: 'POST' } },
    headers: { 'x-device-id': 'preview-test', 'content-type': `multipart/form-data; boundary=${boundary}` },
    isBase64Encoded: true,
    body: Buffer.concat(parts).toString('base64'),
  };
}

async function setup(bucket = 'test-website') {
  process.env.WEBSITE_BUCKET = bucket;
  process.env.AWS_REGION = 'us-east-1';
  const calls = [];
  mock.method(DynamoDBDocumentClient.prototype, 'send', async command => {
    if (command.input.Item) calls.push({ kind: 'publish', record: command.input.Item });
    return { Items: [], Attributes: { count: 1 } };
  });
  const { handler } = await import(`../dist/libraryCreate.mjs?case=${bucket}`);
  return { handler, calls };
}

afterEach(() => mock.restoreAll());

test('publish only after both thumbnails have been stored', async () => {
  const { handler, calls } = await setup();
  mock.method(S3Client.prototype, 'send', async command => {
    calls.push({ kind: 'upload', input: command.input });
    return {};
  });
  const response = await handler(event());
  assert.equal(response.statusCode, 201);
  assert.deepEqual(calls.map(call => call.kind), ['upload', 'upload', 'publish']);
  const result = JSON.parse(response.body);
  for (const suffix of ['full', 'compact']) {
    assert.ok(result[`thumbnail${suffix === 'full' ? 'Full' : 'Compact'}Url`].endsWith(`/${result.id}_${suffix}.png`));
    assert.ok(calls.some(call => call.input?.Key === `library/thumbnails/${result.id}_${suffix}.png`));
  }
});

test('failed thumbnail upload leaves no published entry and can be retried', async () => {
  const { handler, calls } = await setup();
  let fail = true;
  mock.method(console, 'error', () => {});
  mock.method(S3Client.prototype, 'send', async () => {
    if (fail) throw new Error('S3 unavailable');
    return {};
  });
  const response = await handler(event());
  assert.equal(response.statusCode, 503);
  assert.equal(calls.length, 0);
  fail = false;
  assert.equal((await handler(event())).statusCode, 201);
  assert.equal(calls.length, 1);
});

test('missing bucket does not silently discard supplied thumbnails', async () => {
  const { handler, calls } = await setup('');
  mock.method(console, 'error', () => {});
  mock.method(S3Client.prototype, 'send', async () => assert.fail('S3 must not be called without a bucket'));
  assert.equal((await handler(event())).statusCode, 503);
  assert.equal(calls.length, 0);
});

test('uploads without thumbnails still work without a website bucket', async () => {
  const { handler, calls } = await setup('');
  mock.method(S3Client.prototype, 'send', async () => assert.fail('No thumbnail upload expected'));
  const response = await handler(event(false));
  assert.equal(response.statusCode, 201);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(response.body).thumbnailFullUrl, null);
});
