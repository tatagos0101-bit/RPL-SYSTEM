import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogSearchPath, normalizeCatalogSearch, catalogMatchParts } from './catalogDiscovery.js';

test('landing search retains a trimmed, encoded catalog query', () => {
  assert.equal(catalogSearchPath('  The Lord of the Rings  '), '/browse?q=The%20Lord%20of%20the%20Rings');
  const path = catalogSearchPath('Jose\u0301 & 100% + [books]'.replace('\\u0301','\u0301'));
  assert.equal(new URL(path, 'http://localhost').searchParams.get('q'), 'Jose\u0301 & 100% + [books]'.replace('\\u0301','\u0301'));
  assert.equal(catalogSearchPath('   '), '/browse');
  assert.equal(normalizeCatalogSearch('x'.repeat(250)).length, 200);
  assert.equal(normalizeCatalogSearch(null), '');
});

test('highlights all literal case-insensitive matches without regex or HTML interpretation', () => {
  assert.deepEqual(catalogMatchParts('Java and JAVA', 'java'), [
    {text:'Java',match:true},{text:' and ',match:false},{text:'JAVA',match:true},
  ]);
  for(const query of ['[a+b]', '100%', 'A_B', '<script>', '\\', '(', '$']) {
    const input = `Before ${query} after`;
    const parts = catalogMatchParts(input, query);
    assert.equal(parts.map(part=>part.text).join(''), input);
    assert.deepEqual(parts.filter(part=>part.match).map(part=>part.text), [query]);
  }
});

test('Unicode matches keep original text boundaries and empty searches stay plain', () => {
  assert.deepEqual(catalogMatchParts('\u0130STANBUL guide'.replace('\\u0130','\u0130'), 'guide').map(part=>part.text).join(''), '\u0130STANBUL guide'.replace('\\u0130','\u0130'));
  assert.deepEqual(catalogMatchParts('Jos\u00e9 reads'.replace('\\u00e9','\u00e9'), 'JOS\u00c9'.replace('\\u00c9','\u00c9')).filter(part=>part.match).map(part=>part.text), ['Jos\u00e9'.replace('\\u00e9','\u00e9')]);
  assert.deepEqual(catalogMatchParts('A title', ''), [{text:'A title',match:false}]);
  assert.deepEqual(catalogMatchParts(null, 'title'), [{text:'',match:false}]);
});
