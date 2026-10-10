import test from 'node:test';
import assert from 'node:assert/strict';
import { apiBaseUrl, assetUrl } from './urls.js';

test('production uses the same-origin API while development can use localhost', () => {
  assert.equal(apiBaseUrl('', false), '');
  assert.equal(apiBaseUrl('', true), 'http://localhost:8000');
  assert.equal(apiBaseUrl('https://api.example.test///'), 'https://api.example.test');
});

test('Supabase signed URLs and relative upload paths resolve correctly', () => {
  const signed = 'https://project.supabase.co/storage/v1/object/sign/rpl-avatars/me.png?token=short-lived';
  assert.equal(assetUrl(signed, 'https://api.example.test'), signed);
  assert.equal(assetUrl('/uploads/covers/book.png', 'https://api.example.test'), 'https://api.example.test/uploads/covers/book.png');
  assert.equal(assetUrl(null), null);
});
