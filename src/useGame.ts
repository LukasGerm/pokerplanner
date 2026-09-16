import { useEffect, useRef, useState } from 'react';
import type { ClientMessage, RoomView, ServerMessage, Session } from '../shared/protocol';
const roomPath = /^\/room\/([a-zA-Z0-9_-]{12})$/;
export const initialRoomId = location.pathname.match(roomPath)?.[1] ?? null;
function readSession(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(`poker:${initialRoomId}`) ?? 'null');
    return value?.token && value?.roomId === initialRoomId ? value : null;
  } catch {
    return null;
  }
}
export function useGame() {
  const session = useRef<Session | null>(readSession());
  const socket = useRef<WebSocket | null>(null);
  const pending = useRef<ClientMessage | null>(null);
  const [enabled, setEnabled] = useState(!!session.current);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [memberId, setMemberId] = useState(session.current?.memberId ?? '');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting'>(
    'idle',
  );
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(!!session.current);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    let attempts = 0;
    function connect() {
      if (stopped) return;
      setStatus(session.current ? 'reconnecting' : 'connecting');
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
      );
      socket.current = ws;
      ws.onopen = () => {
        if (stopped) return;
        attempts = 0;
        if (session.current)
          ws.send(
            JSON.stringify({
              type: 'resume',
              roomId: session.current.roomId,
              token: session.current.token,
            }),
          );
        else if (pending.current) {
          ws.send(JSON.stringify(pending.current));
          pending.current = null;
        }
      };
      ws.onmessage = (event) => {
        if (stopped) return;
        const data = JSON.parse(event.data) as ServerMessage;
        if (data.type === 'session') {
          session.current = data.session;
          try {
            sessionStorage.setItem(`poker:${data.session.roomId}`, JSON.stringify(data.session));
          } catch {
            /* reconnect still works for this page */
          }
          setMemberId(data.session.memberId);
          history.replaceState(null, '', `/room/${data.session.roomId}`);
        }
        if (data.type === 'state') {
          setRoom(data.room);
          setStatus('connected');
          setBusy(false);
          setError('');
        }
        if (data.type === 'error') {
          setError(data.message);
          setBusy(false);
          if (data.code) {
            if (session.current) {
              try {
                sessionStorage.removeItem(`poker:${session.current.roomId}`);
              } catch {
                /* storage unavailable */
              }
            }
            session.current = null;
            setRoom(null);
            setMissing(data.code === 'ROOM_NOT_FOUND');
          }
          if (!session.current) {
            stopped = true;
            setEnabled(false);
            setStatus('idle');
            ws.close();
          }
        }
        if (data.type === 'left') {
          if (session.current) {
            try {
              sessionStorage.removeItem(`poker:${session.current.roomId}`);
            } catch {
              /* storage unavailable */
            }
          }
          stopped = true;
          session.current = null;
          location.assign('/');
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        if (session.current) {
          setStatus('reconnecting');
          retry = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10000));
        } else {
          setEnabled(false);
          setStatus('idle');
          setBusy(false);
          pending.current = null;
          setError('Could not connect. Please try again.');
        }
      };
      ws.onerror = () => {
        /* onclose handles connection recovery */
      };
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket.current?.close();
      socket.current = null;
    };
  }, [enabled]);
  function send(message: ClientMessage) {
    setError('');
    if (socket.current?.readyState === WebSocket.OPEN && session.current) {
      socket.current.send(JSON.stringify(message));
      return true;
    }
    if (message.type === 'create' || message.type === 'join') {
      pending.current = message;
      setBusy(true);
      setEnabled(true);
      return true;
    }
    setError('Reconnecting. Your action was not sent; please try again once connected.');
    return false;
  }
  return { room, memberId, status, error, setError, missing, busy, send };
}
