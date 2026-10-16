import { NextResponse } from 'next/server';
import type { z } from 'zod';

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<ParseResult<z.output<T>>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: result.error.issues[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: result.data };
}
