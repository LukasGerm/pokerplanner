import express from 'express';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { messageSchema, type RoomView, type ServerMessage } from '../shared/protocol.js';

type Member = {
  id: string;
  token: string;
  name: string;
  vote: string | null;
  sockets: Set<WebSocket>;
  disconnectedAt: number | null;
};
type Room = {
  id: string;
  title: string;
  deck: string[];
  ownerId: string;
  round: number;
  topic: string;
  revealed: boolean;
  countdown: number | null;
  revealTimer: ReturnType<typeof setInterval> | null;
  members: Map<string, Member>;
  touched: number;
};
type Options = {
  origin?: string;
  clientDir?: string;
  emptyTtlMs?: number;
  memberGraceMs?: number;
  idleTtlMs?: number;
  sweepMs?: number;
};
const id = (bytes = 18) => randomBytes(bytes).toString('base64url');

export function createPokerServer(options: Options = {}) {
  const rooms = new Map<string, Room>();
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  if (options.clientDir) {
    app.use(express.static(options.clientDir, { index: false }));
    app.get(['/', '/room/:id'], (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(options.clientDir!, 'index.html'));
    });
  }
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  server.on('upgrade', (req, socket, head) => {
    // APP_ORIGIN pins the public origin behind a TLS-terminating proxy.
    const expectedHost = options.origin ? new URL(options.origin).host : req.headers.host;
    let validOrigin = false;
    try {
      validOrigin =
        !!req.headers.origin &&
        (options.origin
          ? req.headers.origin === options.origin
          : new URL(req.headers.origin).host === expectedHost);
    } catch {
      /* invalid origin */
    }
    if (req.url !== '/ws' || !validOrigin || wss.clients.size >= 2000) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });
  function send(ws: WebSocket, message: ServerMessage) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 1024 * 1024) {
      ws.terminate();
      return;
    }
    ws.send(JSON.stringify(message));
  }
  function broadcast(room: Room) {
    for (const viewer of room.members.values()) {
      const state: RoomView = {
        id: room.id,
        title: room.title,
        deck: room.deck,
        ownerId: room.ownerId,
        round: room.round,
        topic: room.topic,
        revealed: room.revealed,
        countdown: room.countdown,
        myVote: viewer.vote,
        members: [...room.members.values()].map((m) => ({
          id: m.id,
          name: m.name,
          online: m.sockets.size > 0,
          hasVoted: m.vote !== null,
          vote: room.revealed ? m.vote : null,
        })),
      };
      for (const socket of viewer.sockets) send(socket, { type: 'state', room: state });
    }
  }
  function cancelReveal(room: Room) {
    if (room.revealTimer !== null) clearInterval(room.revealTimer);
    room.revealTimer = null;
    room.countdown = null;
  }
  function startReveal(room: Room) {
    room.countdown = 3;
    room.revealTimer = setInterval(() => {
      if (room.countdown === 1) {
        cancelReveal(room);
        room.revealed = true;
      } else if (room.countdown !== null) {
        room.countdown -= 1;
      }
      room.touched = Date.now();
      broadcast(room);
    }, 1000);
  }
  function selectOwner(room: Room) {
    if (!room.members.has(room.ownerId))
      room.ownerId =
        [...room.members.values()].find((m) => m.sockets.size)?.id ??
        room.members.keys().next().value ??
        '';
  }
  wss.on('connection', (ws) => {
    let current: { room: Room; member: Member } | undefined;
    let alive = true;
    let count = 0;
    let windowStart = Date.now();
    const authTimeout = setTimeout(() => {
      if (!current) ws.close(1008, 'Join a room first');
    }, 10000);
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 30000);
    ws.on('pong', () => {
      alive = true;
    });
    ws.on('error', () => {
      /* close handler cleans up the member */
    });
    function attach(room: Room, member: Member) {
      current = { room, member };
      member.sockets.add(ws);
      member.disconnectedAt = null;
      room.touched = Date.now();
      clearTimeout(authTimeout);
      send(ws, {
        type: 'session',
        session: { roomId: room.id, memberId: member.id, token: member.token },
      });
      broadcast(room);
    }
    function addMember(room: Room, name: string) {
      const member: Member = {
        id: id(9),
        token: id(32),
        name,
        vote: null,
        sockets: new Set(),
        disconnectedAt: null,
      };
      room.members.set(member.id, member);
      if (!room.ownerId) room.ownerId = member.id;
      attach(room, member);
    }
    ws.on('message', (data, binary) => {
      if (Date.now() - windowStart > 10000) {
        count = 0;
        windowStart = Date.now();
      }
      if (++count > 80) {
        ws.close(1008, 'Too many requests');
        return;
      }
      try {
        if (binary) throw new Error('Text messages only.');
        const result = messageSchema.safeParse(JSON.parse(data.toString()));
        if (!result.success)
          throw new Error(
            'Please check your input. Names, room titles, and card values must be valid.',
          );
        const message = result.data;
        if (['create', 'join', 'resume'].includes(message.type) && current)
          throw new Error('You are already in a room.');
        if (message.type === 'create') {
          if (rooms.size >= 1000) throw new Error('The server is full. Please try again later.');
          const room: Room = {
            id: id(9),
            title: message.title,
            deck: message.deck,
            ownerId: '',
            round: 1,
            topic: '',
            revealed: false,
            countdown: null,
            revealTimer: null,
            members: new Map(),
            touched: Date.now(),
          };
          rooms.set(room.id, room);
          addMember(room, message.name);
          return;
        }
        if (message.type === 'join' || message.type === 'resume') {
          const room = rooms.get(message.roomId);
          if (!room) {
            send(ws, {
              type: 'error',
              code: 'ROOM_NOT_FOUND',
              message:
                'This room has closed or the server restarted. Start a new game to bring everyone together again.',
            });
            return;
          }
          if (message.type === 'resume') {
            const member = [...room.members.values()].find((m) => m.token === message.token);
            if (!member) {
              send(ws, {
                type: 'error',
                code: 'SESSION_EXPIRED',
                message: 'Your seat expired. Enter your name to rejoin.',
              });
              return;
            }
            attach(room, member);
          } else {
            if (room.members.size >= 50) throw new Error('This room is full (50 people maximum).');
            addMember(room, message.name);
          }
          return;
        }
        if (!current) throw new Error('Join a room first.');
        const { room, member } = current;
        if (!rooms.has(room.id)) throw new Error('This room has expired.');
        if (message.type === 'vote') {
          if (room.countdown !== null)
            throw new Error('Cards are being revealed. Voting is locked.');
          if (room.revealed || message.round !== room.round)
            throw new Error('That round has ended.');
          if (message.value !== null && !room.deck.includes(message.value))
            throw new Error('Choose a card from this deck.');
          member.vote = message.value;
        } else if (message.type === 'leave') {
          current = undefined;
          room.members.delete(member.id);
          selectOwner(room);
          for (const socket of member.sockets) {
            send(socket, { type: 'left' });
            socket.close(1000, 'Left room');
          }
        } else {
          if (member.id !== room.ownerId) throw new Error('Only the host can control the game.');
          if (message.type === 'reveal') {
            if (room.revealed || room.countdown !== null) return;
            if (![...room.members.values()].some((m) => m.vote !== null))
              throw new Error('Wait for at least one vote.');
            startReveal(room);
          }
          if (message.type === 'next' || message.type === 'settings') {
            cancelReveal(room);
            room.round++;
            room.revealed = false;
            for (const player of room.members.values()) player.vote = null;
          }
          if (message.type === 'next' || message.type === 'topic') room.topic = message.topic;
          if (message.type === 'settings') {
            room.title = message.title;
            room.deck = message.deck;
          }
        }
        room.touched = Date.now();
        broadcast(room);
      } catch (error) {
        send(ws, {
          type: 'error',
          message:
            error instanceof SyntaxError
              ? 'Invalid message.'
              : error instanceof Error
                ? error.message
                : 'Something went wrong.',
        });
      }
    });
    ws.on('close', () => {
      clearTimeout(authTimeout);
      clearInterval(heartbeat);
      if (!current) return;
      const { room, member } = current;
      member.sockets.delete(ws);
      if (!member.sockets.size) member.disconnectedAt = Date.now();
      room.touched = Date.now();
      broadcast(room);
    });
  });
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      const online = [...room.members.values()].some((m) => m.sockets.size);
      if (
        now - room.touched >
        (online ? (options.idleTtlMs ?? 86400000) : (options.emptyTtlMs ?? 3600000))
      ) {
        cancelReveal(room);
        rooms.delete(room.id);
        for (const member of room.members.values())
          for (const ws of member.sockets) {
            send(ws, {
              type: 'error',
              code: 'ROOM_NOT_FOUND',
              message: 'This room expired after being inactive.',
            });
            ws.close(1000);
          }
        continue;
      }
      // Keep seats in an empty room for its full TTL, allowing the host to return.
      if (!online) continue;
      let changed = false;
      for (const member of room.members.values())
        if (
          member.disconnectedAt !== null &&
          now - member.disconnectedAt > (options.memberGraceMs ?? 60000)
        ) {
          room.members.delete(member.id);
          changed = true;
        }
      if (changed) {
        selectOwner(room);
        broadcast(room);
      }
    }
  }, options.sweepMs ?? 10000);
  sweep.unref();
  return {
    server,
    close: async () => {
      clearInterval(sweep);
      for (const room of rooms.values()) cancelReveal(room);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
