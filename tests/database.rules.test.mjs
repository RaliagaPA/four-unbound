import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let env;
const base = Date.now();
const serverTimestamp = () => ({'.sv':'timestamp'});
const host = 'host-uid';
const guest = 'guest-uid';
const other = 'other-uid';
const room = (opts = {}) => ({
  code: '1023', hostUid: host, status: 'lobby', boardSize: '7x6',
  turnOrder: 'fifo', createdAt: base, lastActivityAt: base,
  seats: { '1': {uid:host,name:'Jugador 1',color:0,joinedAt:base} },
  ...opts
});
const freshRoom = (opts = {}) => ({...room(), createdAt:serverTimestamp(),lastActivityAt:serverTimestamp(),seats:{'1':{...room().seats['1'],joinedAt:serverTimestamp()}},...opts});
const db = uid => env.authenticatedContext(uid).database();
const r = (uid,path) => db(uid).ref(path);
async function seed(path,value) {
  await env.withSecurityRulesDisabled(async ctx => ctx.database().ref(path).set(value));
}
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-four-unbound-ci',
    database: { rules: readFileSync('database.rules.json','utf8') }
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearDatabase(); });

test('rejects unauthenticated room reads', async () => {
  await seed('rooms/1',room());
  await assertFails(env.unauthenticatedContext().database().ref('rooms/1').once('value'));
});
test('authenticated room read succeeds', async () => {
  await seed('rooms/1',room());
  await assertSucceeds(r(guest,'rooms/1').once('value'));
});
test('authenticated host can create room', async () => {
  await assertSucceeds(r(host,'rooms/1').set(freshRoom()));
});
test('non-host cannot create room', async () => {
  await assertFails(r(guest,'rooms/1').set(freshRoom()));
});
test('invalid room slot cannot be created', async () => {
  await assertFails(r(host,'rooms/4').set(freshRoom()));
});
test('room requires a 4-digit code', async () => {
  await assertFails(r(host,'rooms/1').set(freshRoom({code:'12'})));
});
test('repeated code on another slot rejected', async () => {
  await seed('rooms/1',room());
  await assertFails(r(other,'rooms/2').set(freshRoom({hostUid:other, seats:{'1':{uid:other,name:'Jugador 1',color:1,joinedAt:serverTimestamp()}}})));
});
test('new room host must own seat 1', async () => {
  await assertFails(r(host,'rooms/1').set(freshRoom({seats:{'1':{uid:other,name:'Jugador 1',color:0,joinedAt:serverTimestamp()}}})));
});
test('guest can join available seat', async () => {
  await seed('rooms/1',room());
  await assertSucceeds(r(guest,'rooms/1/seats/2').set({uid:guest,name:'Jugador 2',color:1,joinedAt:serverTimestamp()}));
});
test('guest cannot replace another user seat', async () => {
  await seed('rooms/1',room({seats:{'1':room().seats['1'],'2':{uid:guest,name:'Jugador 2',color:1,joinedAt:base}}}));
  await assertFails(r(other,'rooms/1/seats/2').set({uid:other,name:'Hijack',color:2,joinedAt:base}));
});
test('guest cannot edit host seat', async () => {
  await seed('rooms/1',room());
  await assertFails(r(guest,'rooms/1/seats/1').update({name:'Hijack'}));
});
test('guest can edit own name', async () => {
  await seed('rooms/1',room({seats:{'1':room().seats['1'],'2':{uid:guest,name:'Jugador 2',color:1,joinedAt:base}}}));
  await assertSucceeds(r(guest,'rooms/1/seats/2').update({name:'Amigo'}));
});
test('name longer than 20 chars rejected', async () => {
  await seed('rooms/1',room({seats:{'1':room().seats['1'],'2':{uid:guest,name:'Jugador 2',color:1,joinedAt:base}}}));
  await assertFails(r(guest,'rooms/1/seats/2').update({name:'123456789012345678901'}));
});
test('duplicate colors rejected', async () => {
  await seed('rooms/1',room());
  await assertFails(r(guest,'rooms/1/seats/2').set({uid:guest,name:'Jugador 2',color:0,joinedAt:base}));
});
test('host can change board size', async () => {
  await seed('rooms/1',room());
  await assertSucceeds(r(host,'rooms/1/boardSize').set('9x8'));
});
test('guest cannot change board size', async () => {
  await seed('rooms/1',room());
  await assertFails(r(guest,'rooms/1/boardSize').set('9x8'));
});
test('host can remove room', async () => {
  await seed('rooms/1',room());
  await assertSucceeds(r(host,'rooms/1').remove());
});
test('guest cannot remove active room', async () => {
  await seed('rooms/1',room());
  await assertFails(r(guest,'rooms/1').remove());
});
test('guest can remove expired room', async () => {
  await seed('rooms/1',room({lastActivityAt:base-700000}));
  await assertSucceeds(r(guest,'rooms/1').remove());
});
test('host cannot create a room with fifth seat', async () => {
  const seats={...room().seats};
  for(let i=2;i<=5;i++)seats[i]={uid:'user'+i,name:'Player '+i,color:i,joinedAt:base};
  await assertFails(r(host,'rooms/1').set(freshRoom({seats})));
});
test('host cannot create room with duplicate colors', async () => {
  const seats={...room().seats,'2':{uid:guest,name:'Jugador 2',color:0,joinedAt:base}};
  await assertFails(r(host,'rooms/1').set(room({seats})));
});
test('guest may not duplicate same user across seats', async () => {
  await seed('rooms/1',room({seats:{'1':room().seats['1'],'2':{uid:guest,name:'Jugador 2',color:1,joinedAt:base}}}));
  await assertFails(r(guest,'rooms/1/seats/3').set({uid:guest,name:'Jugador 3',color:2,joinedAt:base}));
});
