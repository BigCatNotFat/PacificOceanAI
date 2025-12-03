export type Listener<T> = (e: T) => void;

export interface Event<T> {
  (listener: Listener<T>): IDisposable;
}

export interface IDisposable {
  dispose(): void;
}

export class Emitter<T> {
  private listeners: Set<Listener<T>> = new Set();

  event: Event<T> = (listener: Listener<T>): IDisposable => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      }
    };
  };

  fire(e: T): void {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(e);
      } catch {
        // Ignore listener errors
      }
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}

