import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarFileError, AVATAR_MAX_BYTES } from './profileUpdates.js';

test('avatar upload accepts supported formats through the existing 5 MB limit', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(avatarFileError({ type, size: AVATAR_MAX_BYTES }), '');
  }
});

test('avatar upload rejects oversized, empty and unsupported files before uploading', () => {
  for (const file of [{ type: 'image/jpeg', size: AVATAR_MAX_BYTES + 1 },
    { type: 'image/png', size: 0 }, { type: 'image/svg+xml', size: 100 }]) {
    assert.notEqual(avatarFileError(file), '');
  }
});
