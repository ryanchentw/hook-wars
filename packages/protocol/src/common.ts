import { z } from 'zod';
import { COORD_LIMIT, MAX_ID_LENGTH } from './limits';

/** An identifier of one of the workspace's branded kinds. The brand is the schema's word that it was checked here. */
export const idOf = <T extends string>(): z.ZodType<T> => z.string().min(1).max(MAX_ID_LENGTH).regex(/^[\w-]+$/) as unknown as z.ZodType<T>;

export const teamSchema = z.enum(['west', 'east']);

const coord = z.number().min(-COORD_LIMIT).max(COORD_LIMIT);
/** A point a client names. `z.number` already refuses NaN and the infinities. */
export const pointSchema = z.strictObject({ x: coord, y: coord });

export const purchaseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('upgrade'), id: z.enum(['damage', 'range', 'speed', 'size']) }),
  z.strictObject({ kind: z.literal('item'), id: z.enum(['grapple', 'barb']) }),
]);

export const slotRefSchema = z.strictObject({ team: teamSchema, index: z.number().int().min(0).max(2) });
