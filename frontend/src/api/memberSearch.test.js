import test from 'node:test';
import assert from 'node:assert/strict';

import { memberMatchesSearch } from './memberSearch.js';

test('memberMatchesSearch handles nullable email without throwing', () => {
  const member = {
    name: 'Juan Dela Cruz',
    member_id: 'RPL-12345',
    email: null,
  };

  assert.equal(memberMatchesSearch(member, 'juan'), true);
  assert.equal(memberMatchesSearch(member, 'rpl-12345'), true);
  assert.equal(memberMatchesSearch(member, 'missing'), false);
});
