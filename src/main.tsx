import React, { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Coffee,
  Crown,
  Eye,
  Layers3,
  Link,
  LogOut,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wifi,
  X,
} from 'lucide-react';
import { presets, settingsSchema, type MemberView } from '../shared/protocol';
import { initialRoomId, useGame } from './useGame';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import './styles.css';

function Brand() {
  return (
    <a href="/" className="brand" aria-label="Pokerplanner home">
      <span className="brand-mark">
        <Layers3 size={23} />
      </span>
      poker<span>planner</span>
      <span className="brand-dot">.</span>
    </a>
  );
}
function Card({
  value,
  selected = false,
  onClick,
  disabled = false,
}: {
  value: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const content = (
    <>
      <span className="card-corner">{value}</span>
      <span className="card-value">{value === '☕' ? <Coffee size={26} /> : value}</span>
      <span className="card-corner bottom">{value}</span>
    </>
  );
  return onClick ? (
    <button
      className={`playing-card ${selected ? 'selected' : ''}`}
      aria-label={`Vote ${value}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div className={`playing-card ${selected ? 'selected' : ''}`}>{content}</div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <span className="eyebrow">LET’S GET TOGETHER</span>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <h2 id={titleId}>{title}</h2>
      <p className="muted">{subtitle}</p>
      {children}
    </dialog>
  );
}
function DeckForm({
  initial,
  submit,
  busy,
  editing = false,
}: {
  initial?: { title: string; deck: string[] };
  submit: (title: string, deck: string[], name: string) => void;
  busy: boolean;
  editing?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? 'Sprint planning');
  const [name, setName] = useState('');
  const [preset, setPreset] = useState(initial ? 'Custom' : 'Fibonacci');
  const [cards, setCards] = useState((initial?.deck ?? presets.Fibonacci).join(', '));
  const [error, setError] = useState('');
  const values = cards
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  function submitForm(e: FormEvent) {
    e.preventDefault();
    const checked = settingsSchema.safeParse({ title, deck: values });
    if (!checked.success) {
      setError('Choose 2–20 unique cards, each up to 6 characters, and give your game a name.');
      return;
    }
    submit(checked.data.title, checked.data.deck, name.trim());
  }
  return (
    <form onSubmit={submitForm} className="setup-form">
      {!editing && (
        <label>
          Your name
          <input
            required
            maxLength={30}
            autoFocus
            placeholder="e.g. Alex"
            value={name}
            onChange={(e) => setName(e.target.value)}
            pattern=".*\S.*"
          />
        </label>
      )}
      <label>
        Game name
        <input required maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Card deck
        <select
          value={preset}
          onChange={(e) => {
            setPreset(e.target.value);
            if (e.target.value !== 'Custom')
              setCards(presets[e.target.value as keyof typeof presets].join(', '));
          }}
        >
          {[...Object.keys(presets), 'Custom'].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      {preset === 'Custom' && (
        <label>
          Card values
          <input
            value={cards}
            onChange={(e) => setCards(e.target.value)}
            placeholder="0, 1, 2, 3, 5, 8, ?"
          />
          <span className="field-help">
            Separate values with commas. Numbers, sizes, or a coffee break.
          </span>
        </label>
      )}
      <div className="deck-preview">
        {values.map((v, i) => (
          <span key={`${v}-${i}`}>{v}</span>
        ))}
      </div>
      {editing && (
        <p className="field-help">Saving starts a fresh round and clears the current votes.</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary wide" disabled={busy || (!editing && !name.trim())}>
        {busy ? 'Connecting…' : editing ? 'Save & start fresh round' : 'Create game'}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
function Landing({ start }: { start: () => void }) {
  return (
    <main className="landing">
      <button className="button primary" onClick={start}>
        Start game
      </button>
    </main>
  );
}
function Player({
  player,
  self,
  host,
  revealed,
}: {
  player: MemberView;
  self: boolean;
  host: boolean;
  revealed: boolean;
}) {
  return (
    <div className={`player ${!player.online ? 'offline' : ''}`}>
      <div
        className={`player-card ${player.hasVoted ? 'voted' : ''} ${revealed ? 'revealed' : ''}`}
      >
        {revealed ? (
          <span>{player.vote ?? '—'}</span>
        ) : player.hasVoted ? (
          <Layers3 size={23} />
        ) : (
          <span className="waiting-dots">···</span>
        )}
      </div>
      <span className="player-name">
        {player.name}
        {self && <span> (you)</span>}
        {host && <Crown size={12} />}
      </span>
      <span className="player-status">
        {!player.online
          ? 'Reconnecting'
          : revealed
            ? player.hasVoted
              ? 'Voted'
              : 'Sat this one out'
            : player.hasVoted
              ? 'Ready to reveal'
              : 'Thinking…'}
      </span>
    </div>
  );
}
function App() {
  const game = useGame();
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [joinName, setJoinName] = useState('');
  const [copied, setCopied] = useState(false);
  const [topic, setTopic] = useState('');
  const room = game.room;
  useEffect(() => {
    if (room) {
      setCreateOpen(false);
      setTopic(room.topic);
      document.title = `${room.title} · Pokerplanner`;
    }
  }, [room?.id, room?.topic]);
  const host = room?.ownerId === game.memberId;
  const connected = game.status === 'connected';
  const countingDown = room?.countdown != null;
  const revealLabel = countingDown
    ? `Revealing in ${room?.countdown}…`
    : room?.revealed
      ? 'Next round'
      : 'Reveal cards';
  const votes = room?.members.filter((m) => m.hasVoted) ?? [];
  const online = room?.members.filter((m) => m.online).length ?? 0;
  const numericVotes = votes
    .map((m) => (m.vote === '½' ? 0.5 : Number(m.vote)))
    .filter((v, i) => votes[i].vote !== null && Number.isFinite(v));
  const average = numericVotes.length
    ? Number((numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(1))
    : null;
  const consensus = votes.length > 1 && new Set(votes.map((v) => v.vote)).size === 1;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      game.setError('Copy the room link from your browser’s address bar.');
    }
  }
  return (
    <>
      {!room ? (
        <Landing start={() => setCreateOpen(true)} />
      ) : (
        <div className="game-shell">
          <header className="site-header game-header">
            <Brand />
            <div className={`connection ${!connected ? 'reconnecting' : ''}`}>
              <span className="live-dot" />
              {connected ? 'Connected live' : 'Reconnecting…'}
            </div>
            <div className="header-actions">
              <button className="button subtle" onClick={() => setLeaveOpen(true)}>
                <LogOut size={16} />
                <span>Leave</span>
              </button>
              <button className="button primary" onClick={copyLink}>
                {copied ? <Check size={16} /> : <Link size={16} />}
                <span>{copied ? 'Link copied!' : 'Invite team'}</span>
              </button>
            </div>
          </header>
          <main className="game-main">
            <div className="game-title-row">
              <div>
                <div className="breadcrumb">
                  YOUR TEAM’S SPACE <ChevronRight size={12} /> ROUND {room.round}
                </div>
                <h1>
                  {room.title}
                  <span className="room-live">LIVE</span>
                </h1>
              </div>
              {host && (
                <button
                  className="button subtle settings-button"
                  disabled={!connected}
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings2 size={17} /> Game settings
                </button>
              )}
            </div>
            <div className="game-layout">
              <section className="play-area">
                <div className="round-heading">
                  <span className="pill">
                    <span className="live-dot" />
                    {countingDown
                      ? 'REVEALING CARDS'
                      : room.revealed
                        ? 'CARDS ON THE TABLE'
                        : 'ESTIMATION IN PROGRESS'}
                  </span>
                  <span className="muted round-label">Round {room.round}</span>
                </div>
                <h2 className="topic-heading">{room.topic || 'What are we estimating?'}</h2>
                <p className="round-description">
                  {room.revealed
                    ? 'Different numbers? That’s where the good conversations start.'
                    : 'Think it through. Pick a card. Find your common ground.'}
                </p>
                <div className="live-table">
                  <div className="table-center">
                    <span className="table-diamond">✧</span>
                    <h3>
                      {room.revealed
                        ? consensus
                          ? 'Great minds, same estimate.'
                          : 'Let’s talk it through.'
                        : `${votes.length} of ${room.members.length} cards are in`}
                    </h3>
                    <p>
                      {countingDown
                        ? 'Votes are locked. Get ready to compare.'
                        : room.revealed
                          ? 'A shared estimate starts with a conversation.'
                          : votes.length === room.members.length
                            ? 'Everyone is ready. Time for the big reveal.'
                            : 'Your estimate stays private until the reveal.'}
                    </p>
                    {host || countingDown ? (
                      <button
                        className={`button reveal-button ${room.revealed ? 'dark' : 'primary'} ${countingDown ? 'is-counting-down' : ''}`}
                        aria-label={revealLabel}
                        disabled={
                          !connected || countingDown || (!room.revealed && votes.length === 0)
                        }
                        onClick={() =>
                          game.send(
                            room.revealed ? { type: 'next', topic: '' } : { type: 'reveal' },
                          )
                        }
                      >
                        {room.revealed ? <RotateCcw size={17} /> : <Eye size={17} />}{' '}
                        <span aria-live="polite" aria-atomic="true">
                          {revealLabel}
                        </span>
                      </button>
                    ) : (
                      <span className="waiting-host">
                        {room.revealed
                          ? 'The host will start the next round'
                          : 'The host will reveal the cards'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="players">
                  {room.members.map((p) => (
                    <Player
                      key={p.id}
                      player={p}
                      self={p.id === game.memberId}
                      host={p.id === room.ownerId}
                      revealed={room.revealed}
                    />
                  ))}
                </div>
                {room.revealed ? (
                  <div className="results">
                    <div className="result-summary">
                      <span className="eyebrow">THE TEAM’S TAKE</span>
                      <h3>
                        {consensus ? 'You’re on the same page.' : 'Every perspective counts.'}
                      </h3>
                      <span className="muted">
                        {votes.length} vote{votes.length !== 1 ? 's' : ''}
                        {average !== null && (
                          <>
                            {' '}
                            · Average <strong>{average}</strong> <small>(numeric cards)</small>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="distribution">
                      {room.deck
                        .filter((v) => votes.some((p) => p.vote === v))
                        .map((value) => {
                          const count = votes.filter((p) => p.vote === value).length;
                          return (
                            <div className="distribution-item" key={value}>
                              <div className="bar-track">
                                <div
                                  style={{
                                    height: `${(count / Math.max(votes.length, 1)) * 100}%`,
                                  }}
                                />
                              </div>
                              <strong>{value}</strong>
                              <span>
                                {count} vote{count !== 1 ? 's' : ''}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="your-hand">
                    <div className="hand-heading">
                      <h3>Your estimate</h3>
                      <span>
                        {countingDown ? (
                          'Voting is locked while the cards reveal.'
                        ) : room.myVote !== null ? (
                          <>
                            You picked <strong>{room.myVote}</strong>. Click again to take it back.
                          </>
                        ) : (
                          'Go with your gut. You can change your mind.'
                        )}
                      </span>
                    </div>
                    <div className="hand-cards">
                      {room.deck.map((value) => (
                        <Card
                          key={value}
                          value={value}
                          selected={room.myVote === value}
                          disabled={!connected || countingDown}
                          onClick={() =>
                            game.send({
                              type: 'vote',
                              value: room.myVote === value ? null : value,
                              round: room.round,
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
              <aside className="session-sidebar">
                <div className="sidebar-title">
                  <h3>At the table</h3>
                  <span className="count-badge">{online}</span>
                </div>
                <p className="muted">A little teamwork goes a long way.</p>
                <div className="member-list">
                  {room.members.map((p, i) => (
                    <div className="member-row" key={p.id}>
                      <span className={`avatar ${['peach', 'lilac', 'sage', 'blue'][i % 4]}`}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <strong>
                          {p.name}
                          {p.id === game.memberId && <span> (you)</span>}
                        </strong>
                        <span>
                          {p.id === room.ownerId ? 'Host' : 'Team member'}
                          {!p.online && ' · Offline'}
                        </span>
                      </div>
                      {p.hasVoted ? (
                        <span className="member-check">
                          <Check size={15} />
                        </span>
                      ) : (
                        <span className={`presence ${p.online ? '' : 'away'}`} />
                      )}
                    </div>
                  ))}
                </div>
                <button className="invite-dashed" onClick={copyLink}>
                  {copied ? <Check size={16} /> : <Plus size={16} />}{' '}
                  {copied ? 'Copied to clipboard' : 'Invite a teammate'}
                </button>
                <div className="sidebar-divider" />
                <div className="sidebar-title">
                  <h3>This round</h3>
                  <span className="small-label">#{room.round}</span>
                </div>
                {host ? (
                  <form
                    className="topic-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      game.send({ type: 'topic', topic });
                    }}
                  >
                    <label htmlFor="topic">What’s on the table?</label>
                    <textarea
                      id="topic"
                      placeholder="Add a story, ticket, or talking point…"
                      maxLength={120}
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      disabled={!connected}
                    />
                    <button
                      className="button subtle small-button"
                      disabled={!connected || topic === room.topic}
                    >
                      Update topic <ArrowRight size={14} />
                    </button>
                  </form>
                ) : (
                  <p className="sidebar-topic">
                    {room.topic || 'The host can add a topic for this round.'}
                  </p>
                )}
                <div className="sidebar-divider" />
                <div className="sidebar-title">
                  <h3>The deck</h3>
                  <Layers3 size={16} />
                </div>
                <div className="sidebar-deck">
                  {room.deck.map((v) => (
                    <span key={v}>{v}</span>
                  ))}
                </div>
                <div className="tip">
                  <Sparkles size={19} />
                  <p>
                    <strong>It’s about the conversation.</strong>The best estimate isn’t always the
                    average. Talk about the highs and lows.
                  </p>
                </div>
              </aside>
            </div>
            <div className="room-footnote">
              <ShieldCheck size={14} /> This room lives in the moment. Rooms clear when the server
              restarts.
            </div>
          </main>
        </div>
      )}
      {game.error && (
        <div className="toast error" role="alert">
          <span>{game.error}</span>
          <button
            className="icon-button"
            onClick={() => game.setError('')}
            aria-label="Dismiss error"
          >
            <X size={17} />
          </button>
        </div>
      )}
      {createOpen && !room && (
        <Modal
          title="Make room for your team."
          subtitle="A name, a deck, and you’re ready to play."
          onClose={() => !game.busy && setCreateOpen(false)}
        >
          {game.error && (
            <p className="form-error" role="alert">
              {game.error}
            </p>
          )}
          <DeckForm
            submit={(title, deck, name) => game.send({ type: 'create', title, deck, name })}
            busy={game.busy}
          />
          <div className="modal-note">
            <ShieldCheck size={14} /> No account needed. Your room is temporary.
          </div>
        </Modal>
      )}
      {initialRoomId && !room && !createOpen && (
        <Modal
          title={game.missing ? 'This table has closed.' : 'There’s a seat for you.'}
          subtitle={
            game.missing
              ? 'Rooms are temporary and clear when the server restarts. Start a fresh game with your team.'
              : 'Join your team, share your perspective, and find your common ground.'
          }
          onClose={() => location.assign('/')}
        >
          {game.error && !game.missing && (
            <p className="form-error" role="alert">
              {game.error}
            </p>
          )}
          {game.missing ? (
            <button className="button primary wide" onClick={() => setCreateOpen(true)}>
              Start new game <ArrowRight size={17} />
            </button>
          ) : game.busy ? (
            <div className="connecting-state">
              <Wifi size={24} />
              <p>Finding your seat…</p>
            </div>
          ) : (
            <form
              className="setup-form"
              onSubmit={(e) => {
                e.preventDefault();
                game.send({ type: 'join', roomId: initialRoomId!, name: joinName.trim() });
              }}
            >
              <label>
                Your name
                <input
                  autoFocus
                  required
                  maxLength={30}
                  placeholder="e.g. Alex"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                />
              </label>
              <button className="button primary wide" disabled={!joinName.trim()}>
                Join game <ArrowRight size={17} />
              </button>
            </form>
          )}
        </Modal>
      )}
      {settingsOpen && room && (
        <Modal
          title="Your game, your rules."
          subtitle="Make the deck work for your team."
          onClose={() => setSettingsOpen(false)}
        >
          <DeckForm
            editing
            initial={room}
            busy={!connected}
            submit={(title, deck) => {
              if (game.send({ type: 'settings', title, deck })) setSettingsOpen(false);
            }}
          />
        </Modal>
      )}
      {leaveOpen && (
        <Modal
          title="Calling it a round?"
          subtitle={
            host
              ? 'When you leave, another teammate becomes the host.'
              : 'You can join again using the room link.'
          }
          onClose={() => setLeaveOpen(false)}
        >
          <div className="dialog-actions">
            <button className="button subtle" onClick={() => setLeaveOpen(false)}>
              Stay a little longer
            </button>
            <button
              className="button primary"
              disabled={!connected}
              onClick={() => game.send({ type: 'leave' })}
            >
              Leave game <LogOut size={16} />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
