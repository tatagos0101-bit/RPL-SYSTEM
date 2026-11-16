import test from 'node:test';
import assert from 'node:assert/strict';
import { activePickupReservations, availableReservationCopies } from './reservationBorrowing.js';
const ready={id:1,book_id:90,status:'ready'};
const copy=(extra={})=>({book_id:90,copy_id:901,copy_number:1,copy_qr:'RPL-BOOK-00090-C001',available:true,copy_status:'available',...extra});
test('active pickup list keeps ready/queued and excludes expired/fulfilled records',()=>{
  assert.deepEqual(activePickupReservations([ready,{id:2,book_id:91,status:'pending'},{id:3,status:'expired'},{id:4,status:'fulfilled'},null]),[ready,{id:2,book_id:91,status:'pending'}]);
  assert.deepEqual(activePickupReservations(null),[]);
});
test('exact available copies match the reserved title and preserve source identity',()=>{
  const valid=copy();assert.deepEqual(availableReservationCopies(ready,[valid,copy({book_id:91}),copy({available:false}),copy({copy_status:'retired'}),copy({copy_id:null}),copy({copy_id:0}),copy({copy_number:null}),valid]),[valid]);
});
test('queued reservations and titles/copies already in the shared cart cannot be added',()=>{
  assert.deepEqual(availableReservationCopies({...ready,status:'pending'},[copy()]),[]);
  assert.deepEqual(availableReservationCopies(ready,[copy()],[{book_id:90,copy_id:902}]),[]);
  assert.deepEqual(availableReservationCopies(ready,[copy()],[{book_id:91,copy_id:901}]),[]);
  assert.deepEqual(availableReservationCopies(ready,null),[]);
});
