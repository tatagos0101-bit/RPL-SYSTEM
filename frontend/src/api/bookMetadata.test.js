import test from 'node:test';
import assert from 'node:assert/strict';
import { plainBookDescription, fetchBookByISBN } from './bookMetadata.js';

test('provider descriptions become short plain text, including entity/object values', () => {
  assert.equal(plainBookDescription({value:'<p>A &amp; B</p><p>Second line.</p><script>bad()</script>'}), 'A & B Second line.');
  assert.equal(plainBookDescription(null), '');
  assert.equal(plainBookDescription(12), '');
  assert.equal(plainBookDescription('x'.repeat(2001)).length,2000);
  assert.ok(!/[\uD800-\uDBFF]$/.test(plainBookDescription('x'.repeat(1999)+'\u{1F4DA}')));
});

test('ISBN lookup retains existing metadata and offers optional Google summary', async () => {
  const result=await fetchBookByISBN('978-0000000001',{fetchImpl:async()=>({ok:true,json:async()=>({totalItems:1,items:[{volumeInfo:{title:'Sample',authors:['A','B'],categories:['History'],publishedDate:'2001-01-01',description:'<b>Sample summary</b>',imageLinks:{thumbnail:'http://example.com/cover?x=1&zoom=1'}}}]})}),suggestCategory:async labels=>({data:{raw_api_label:labels[0]}})});
  assert.deepEqual(result,{title:'Sample',author:'A, B',category:'History',year:'2001',cover_url:'https://example.com/cover?x=1&zoom=0',description:'Sample summary'});
});

test('Open Library fallback and a missing summary preserve manual-entry option',async()=>{
  let calls=0;
  const result=await fetchBookByISBN('123456789X',{fetchImpl:async()=>({ok:true,json:async()=>++calls===1?{totalItems:0}:{'ISBN:123456789X':{title:'Fallback',authors:[{name:'Sample'}],publish_date:'2004',subjects:[{name:'History'}]}}}),suggestCategory:async()=>({data:{raw_api_label:'History'}})});
  assert.equal(result.title,'Fallback');assert.equal(result.description,'');assert.equal(calls,2);
  await assert.rejects(fetchBookByISBN('123456789X',{fetchImpl:async()=>({ok:false}),suggestCategory:async()=>({})}),/Not found/);
});
