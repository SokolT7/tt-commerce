type Listener = (payload: string) => void;

/** Tiny fan-out bus backing the SSE endpoint. */
export class EventBus {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  publish(payload: string) {
    for (const fn of [...this.listeners]) {
      try {
        fn(payload);
      } catch {
        this.listeners.delete(fn);
      }
    }
  }

  get size() {
    return this.listeners.size;
  }
}
