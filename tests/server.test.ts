import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createPokerServer } from '../server/app.js';
import type { ClientMessage, RoomView, ServerMessage } from '../shared/protocol.js';

async function fixture(options: Parameters<typeof createPokerServer>[0] = {}) {
  const app = createPokerServer(options);
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const address = app.server.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  async function client() {
    const ws = new WebSocket(origin.replace('http', 'ws') + '/ws', { origin });
    const messages: ServerMessage[] = [];
    const waiters = new Set<() => void>();
    ws.on('message', (data) => {
      messages.push(JSON.parse(data.toString()));
      for (const f of waiters) f();
    });
    await once(ws, 'open');
    function next<T extends ServerMessage['type']>(
      type: T,
      predicate: (value: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    ): Promise<Extract<ServerMessage, { type: T }>> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`Timed out waiting for ${type}`));
        }, 5000);
        function check() {
          const index = messages.findIndex(
            (m) => m.type === type && predicate(m as Extract<ServerMessage, { type: T }>),
          );
          if (index !== -1) {
            clearTimeout(timer);
            waiters.delete(check);
            resolve(messages.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>);
          }
        }
        waiters.add(check);
        check();
      });
    }
    return {
      ws,
      messages,
      next,
      send: (message: ClientMessage) => ws.send(JSON.stringify(message)),
      state: async (predicate: (room: RoomView) => boolean = () => true) =>
        (await next('state', (m) => predicate(m.room))).room,
    };
  }
  return { ...app, client, origin };
}
async function createHost(f: Awaited<ReturnType<typeof fixture>>) {
  const host = await f.client();
  host.send({ type: 'create', name: 'Alex', title: 'Planning', deck: ['1', '3', '5', '?', '☕'] });
  const { session } = await host.next('session');
  await host.state();
  return { host, session };
}
test('private votes, owner-only controls, reveal, and fresh rounds across real sockets', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const { host, session } = await createHost(f);
  const guest = await f.client();
  guest.send({ type: 'join', roomId: session.roomId, name: 'Sam' });
  const guestSession = (await guest.next('session')).session;
  await guest.state();
  await host.state((r) => r.members.length === 2);
  guest.send({ type: 'vote', value: '5', round: 1 });
  const hidden = await host.state((r) => r.members.some((m) => m.hasVoted));
  assert.equal(hidden.members.find((m) => m.id === guestSession.memberId)?.vote, null);
  assert.equal(hidden.myVote, null);
  assert.equal((await guest.state((r) => r.myVote === '5')).myVote, '5');
  guest.send({ type: 'reveal' });
  assert.match((await guest.next('error')).message, /Only the host/);
  guest.send({ type: 'settings', title: 'Changed', deck: ['1', '2'] });
  assert.match((await guest.next('error')).message, /Only the host/);
  guest.send({ type: 'next', topic: '' });
  assert.match((await guest.next('error')).message, /Only the host/);
  host.send({ type: 'vote', value: '3', round: 1 });
  await host.state((r) => r.myVote === '3');
  host.send({ type: 'reveal' });
  const revealed = await guest.state((r) => r.revealed);
  assert.deepEqual(
    revealed.members.map((m) => m.vote),
    ['3', '5'],
  );
  guest.send({ type: 'vote', value: '1', round: 1 });
  assert.match((await guest.next('error')).message, /ended/);
  host.send({ type: 'next', topic: 'A new story' });
  const next = await guest.state((r) => r.round === 2);
  assert.equal(next.topic, 'A new story');
  assert.equal(next.revealed, false);
  assert(next.members.every((m) => !m.hasVoted && m.vote === null));
  guest.send({ type: 'vote', value: '1', round: 1 });
  assert.match((await guest.next('error')).message, /ended/);
  guest.send({ type: 'vote', value: '999', round: 2 });
  assert.match((await guest.next('error')).message, /deck/);
  guest.send({ type: 'vote', value: '1', round: 2 });
  await guest.state((r) => r.myVote === '1');
  guest.send({ type: 'vote', value: null, round: 2 });
  assert.equal(
    (
      await guest.state(
        (r) => r.myVote === null && r.round === 2 && r.members.every((m) => !m.hasVoted),
      )
    ).myVote,
    null,
  );
  host.send({ type: 'settings', title: 'Custom', deck: ['S', 'M', 'L'] });
  const settings = await guest.state((r) => r.round === 3);
  assert.deepEqual(settings.deck, ['S', 'M', 'L']);
  assert.equal(settings.title, 'Custom');
});
test('refresh resumes the same seat and host permissions; explicit leave transfers host', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const { host, session } = await createHost(f);
  const guest = await f.client();
  guest.send({ type: 'join', roomId: session.roomId, name: 'Sam' });
  const guestSession = (await guest.next('session')).session;
  await guest.state();
  host.send({ type: 'vote', value: '3', round: 1 });
  await guest.state((r) => r.members.some((m) => m.hasVoted));
  host.ws.close();
  await once(host.ws, 'close');
  await guest.state((r) => !r.members.find((m) => m.id === session.memberId)?.online);
  const resumed = await f.client();
  resumed.send({ type: 'resume', roomId: session.roomId, token: session.token });
  const resumedSession = (await resumed.next('session')).session;
  assert.deepEqual(resumedSession, session);
  const state = await resumed.state();
  assert.equal(state.myVote, '3');
  assert.equal(state.members.length, 2);
  assert.equal(state.ownerId, session.memberId);
  resumed.send({ type: 'leave' });
  await resumed.next('left');
  const transferred = await guest.state((r) => r.members.length === 1);
  assert.equal(transferred.ownerId, guestSession.memberId);
  guest.send({ type: 'topic', topic: 'New host works' });
  assert.equal((await guest.state((r) => r.topic !== '')).topic, 'New host works');
});
test('invalid sessions, expired rooms, invalid payloads, and health checks', async (t) => {
  const f = await fixture();
  t.after(f.close);
  assert.equal((await fetch(f.origin + '/healthz')).status, 200);
  const { session } = await createHost(f);
  const guest = await f.client();
  guest.send({ type: 'resume', roomId: session.roomId, token: 'wrong' });
  assert.equal((await guest.next('error')).code, 'SESSION_EXPIRED');
  guest.send({ type: 'join', roomId: 'notaroom1234', name: 'Sam' });
  assert.equal((await guest.next('error')).code, 'ROOM_NOT_FOUND');
  guest.ws.send('not json');
  assert.match((await guest.next('error')).message, /Invalid message/);
  guest.send({ type: 'create', name: 'Sam', title: 'Bad deck', deck: ['1', '1'] });
  assert.match((await guest.next('error')).message, /check your input/);
  guest.send({ type: 'create', name: 'Sam', title: 'Bad deck', deck: ['1'] });
  assert.match((await guest.next('error')).message, /check your input/);
});
test('host disconnect grace expires and transfers ownership to an online teammate', async (t) => {
  const f = await fixture({ memberGraceMs: 30, sweepMs: 10 });
  t.after(f.close);
  const { host, session } = await createHost(f);
  const guest = await f.client();
  guest.send({ type: 'join', roomId: session.roomId, name: 'Sam' });
  const s = (await guest.next('session')).session;
  await guest.state();
  host.ws.close();
  const transferred = await guest.state((r) => r.ownerId === s.memberId);
  assert.equal(transferred.members.length, 1);
});
test('empty rooms expire and cross-origin WebSocket upgrades are rejected', async (t) => {
  const f = await fixture({ emptyTtlMs: 25, sweepMs: 10 });
  t.after(f.close);
  const { host, session } = await createHost(f);
  host.ws.close();
  await once(host.ws, 'close');
  await new Promise((resolve) => setTimeout(resolve, 70));
  const guest = await f.client();
  guest.send({ type: 'join', roomId: session.roomId, name: 'Sam' });
  assert.equal((await guest.next('error')).code, 'ROOM_NOT_FOUND');
  const rogue = new WebSocket(f.origin.replace('http', 'ws') + '/ws', {
    origin: 'https://unrelated.example',
  });
  const [error] = await once(rogue, 'error');
  assert.match(error.message, /403/);
});

test('rooms are isolated and a seat token cannot authenticate in a different room', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const first = await createHost(f);
  const second = await createHost(f);
  assert.notEqual(first.session.roomId, second.session.roomId);
  first.host.send({ type: 'vote', value: '5', round: 1 });
  await first.host.state((r) => r.myVote === '5');
  second.host.send({ type: 'topic', topic: 'Separate game' });
  const state = await second.host.state((r) => r.topic === 'Separate game');
  assert.equal(state.members.length, 1);
  assert.equal(state.myVote, null);
  assert.equal(state.members[0].hasVoted, false);
  const stranger = await f.client();
  stranger.send({ type: 'resume', roomId: second.session.roomId, token: first.session.token });
  assert.equal((await stranger.next('error')).code, 'SESSION_EXPIRED');
  stranger.send({ type: 'reveal' });
  assert.match((await stranger.next('error')).message, /Join a room first/);
});

test('reveal counts down for three seconds for everyone, keeping votes private and locked', async (t) => {
  const f = await fixture();
  t.after(f.close);
  const { host, session } = await createHost(f);
  host.send({ type: 'vote', value: '5', round: 1 });
  await host.state((r) => r.myVote === '5');
  const started = performance.now();
  host.send({ type: 'reveal' });
  const initial = await host.state((r) => r.countdown === 3);
  assert.equal(initial.revealed, false);
  // Repeated requests must not restart or accelerate the countdown.
  host.send({ type: 'reveal' });
  host.send({ type: 'vote', value: '3', round: 1 });
  assert.match((await host.next('error')).message, /Voting is locked/);
  // Joining during the countdown receives the current state, with votes still hidden.
  const guest = await f.client();
  guest.send({ type: 'join', roomId: session.roomId, name: 'Sam' });
  await guest.next('session');
  const joined = await guest.state();
  assert.equal(joined.countdown, 3);
  assert.equal(joined.members[0].vote, null);
  for (const countdown of [2, 1]) {
    const [hostState, guestState] = await Promise.all([
      host.state((r) => r.countdown === countdown),
      guest.state((r) => r.countdown === countdown),
    ]);
    for (const state of [hostState, guestState]) {
      assert.equal(state.revealed, false);
      assert(state.members.every((m) => m.vote === null));
    }
  }
  const [hostResult, guestResult] = await Promise.all([
    host.state((r) => r.revealed),
    guest.state((r) => r.revealed),
  ]);
  assert(performance.now() - started >= 2990, 'Cards must stay hidden for three seconds');
  for (const state of [hostResult, guestResult]) {
    assert.equal(state.countdown, null);
    assert.equal(state.members[0].vote, '5');
  }
});

test('starting a new round or changing the deck cancels a pending reveal', async (t) => {
  const f = await fixture();
  t.after(f.close);
  for (const reset of [
    { type: 'next', topic: 'Next story' },
    { type: 'settings', title: 'New deck', deck: ['S', 'M', 'L'] },
  ] as const) {
    const { host } = await createHost(f);
    host.send({ type: 'vote', value: '5', round: 1 });
    await host.state((r) => r.myVote === '5');
    host.send({ type: 'reveal' });
    await host.state((r) => r.countdown === 3);
    host.send(reset.type === 'settings' ? { ...reset, deck: [...reset.deck] } : reset);
    const state = await host.state((r) => r.round === 2);
    assert.equal(state.countdown, null);
    assert.equal(state.revealed, false);
    await new Promise((resolve) => setTimeout(resolve, 3100));
    assert(
      !host.messages.some(
        (m) => m.type === 'state' && (m.room.revealed || m.room.countdown !== null),
      ),
    );
  }
});
