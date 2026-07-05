import test from 'node:test';
import assert from 'node:assert/strict';

import { faceBoxToStyle, summarizeFaceResults } from './entryFaceOverlay.js';

test('faceBoxToStyle maps normalized face bounds to CSS percentages', () => {
  assert.deepEqual(
    faceBoxToStyle({ top: 0.1, left: 0.25, width: 0.2, height: 0.3 }),
    {
      top: '10%',
      left: '25%',
      width: '20%',
      height: '30%',
    },
  );
});

test('faceBoxToStyle clamps out-of-range face bounds', () => {
  assert.deepEqual(
    faceBoxToStyle({ top: -0.5, left: 0.9, width: 0.5, height: 1.5 }),
    {
      top: '0%',
      left: '90%',
      width: '10%',
      height: '100%',
    },
  );
});

test('summarizeFaceResults preserves multiple kiosk faces', () => {
  const faces = summarizeFaceResults({
    matched: true,
    faces: [
      { matched: true, name: 'Ana', member_id: 'RPL-ANA', face_box: { top: 0, left: 0, width: 0.2, height: 0.2 } },
      { matched: false, face_box: { top: 0.1, left: 0.5, width: 0.2, height: 0.2 } },
    ],
  });

  assert.equal(faces.length, 2);
  assert.equal(faces[0].label, 'Ana');
  assert.equal(faces[0].subLabel, 'RPL-ANA');
  assert.equal(faces[1].label, 'Unknown');
});

