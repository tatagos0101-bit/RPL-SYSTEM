import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findManualMemberMatch,
  memberToSessionIdentity,
} from './manualMemberLookup.js';

const members = [
  {
    id: 7,
    member_id: 'RPL-00007',
    name: 'Juan Dela Cruz',
    email: 'juan@example.com',
    phone: '+63 912 345 6789',
    active_loans: 2,
  },
  {
    id: 17,
    member_id: 'RPL-00017',
    name: 'Maria Santos',
    email: null,
    phone: null,
    active_loans: 0,
  },
];

test('findManualMemberMatch matches exact member ID case-insensitively', () => {
  assert.equal(findManualMemberMatch(members, ' rpl-00007 ')?.id, 7);
});

test('findManualMemberMatch matches exact email or numeric user id', () => {
  assert.equal(findManualMemberMatch(members, 'JUAN@example.com')?.id, 7);
  assert.equal(findManualMemberMatch(members, '17')?.id, 17);
});

test('findManualMemberMatch does not accept partial ambiguous identifiers', () => {
  assert.equal(findManualMemberMatch(members, 'RPL-000'), null);
  assert.equal(findManualMemberMatch(members, 'juan'), null);
});

test('memberToSessionIdentity maps member result to borrow/return session member shape', () => {
  assert.deepEqual(memberToSessionIdentity(members[0]), {
    user_id: 7,
    name: 'Juan Dela Cruz',
    member_id: 'RPL-00007',
    role: 'member',
    active_loans: 2,
  });
});
