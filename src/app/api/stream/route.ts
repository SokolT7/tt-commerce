import { engine } from "@/server/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEEP_ALIVE_MS = 15_000;

/**
 * Server-Sent Events: one snapshot per broadcast, to every open surface.
 *
 * Every path out of this handler MUST release the bus subscription and the
 * keep-alive timer. A ReadableStream ignores any value returned from start(),
 * so cleanup has to hang off cancel() and the request's abort signal —
 * otherwise connections pile up, the browser hits its six-connection-per-origin
 * limit for the host, and every surface sits on "connecting" forever.
 */
export async function GET(request: Request) {
  const eng = engine();
  const encoder = new TextEncoder();

  let closed = false;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let cleanup = () => {};

  const stream = new ReadableStream({
    async start(controller) {
      cleanup = () => {
        if (closed) return;
        closed = true;
        if (keepAlive) clearInterval(keepAlive);
        keepAlive = null;
        unsubscribe?.();
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          /* already closed by the client going away */
        }
      };

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      write(`data: ${JSON.stringify(await eng.snapshot())}\n\n`);
      unsubscribe = eng.bus.subscribe((payload) => write(`data: ${payload}\n\n`));
      keepAlive = setInterval(() => write(": keep-alive\n\n"), KEEP_ALIVE_MS);

      // The reliable disconnect signal in the App Router.
      if (request.signal.aborted) cleanup();
      else request.signal.addEventListener("abort", cleanup, { once: true });
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
