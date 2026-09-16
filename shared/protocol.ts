import { z } from 'zod';
export const presets = {
  Fibonacci: ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'],
  'Modified Fibonacci': ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?'],
  'T-shirt sizes': ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕'],
};
const name = z.string().trim().min(1).max(30);
export const deckSchema = z
  .array(z.string().trim().min(1).max(6))
  .min(2)
  .max(20)
  .refine((cards) => new Set(cards).size === cards.length, 'Cards must be unique');
export const settingsSchema = z.object({
  title: z.string().trim().min(1).max(60),
  deck: deckSchema,
});
export const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), name, ...settingsSchema.shape }),
  z.object({ type: z.literal('join'), roomId: z.string().regex(/^[a-zA-Z0-9_-]{12}$/), name }),
  z.object({ type: z.literal('resume'), roomId: z.string(), token: z.string().max(100) }),
  z.object({
    type: z.literal('vote'),
    value: z.string().max(6).nullable(),
    round: z.number().int(),
  }),
  z.object({ type: z.literal('reveal') }),
  z.object({ type: z.literal('next'), topic: z.string().trim().max(120) }),
  z.object({ type: z.literal('topic'), topic: z.string().trim().max(120) }),
  z.object({ type: z.literal('settings'), ...settingsSchema.shape }),
  z.object({ type: z.literal('leave') }),
]);
export type ClientMessage = z.infer<typeof messageSchema>;
export type MemberView = {
  id: string;
  name: string;
  online: boolean;
  hasVoted: boolean;
  vote: string | null;
};
export type RoomView = {
  id: string;
  title: string;
  deck: string[];
  ownerId: string;
  round: number;
  topic: string;
  revealed: boolean;
  countdown: number | null;
  members: MemberView[];
  myVote: string | null;
};
export type Session = { roomId: string; memberId: string; token: string };
export type ServerMessage =
  | { type: 'session'; session: Session }
  | { type: 'state'; room: RoomView }
  | { type: 'error'; message: string; code?: 'ROOM_NOT_FOUND' | 'SESSION_EXPIRED' }
  | { type: 'left' };
