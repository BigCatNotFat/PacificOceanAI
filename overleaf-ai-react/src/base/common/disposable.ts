export interface IDisposable {
  dispose(): void;
}

export class Disposable implements IDisposable {
  dispose(): void {
    // Default no-op
  }
}

export class DisposableStore implements IDisposable {
  private readonly disposables: IDisposable[] = [];

  add<T extends IDisposable>(disposable: T): T {
    this.disposables.push(disposable);
    return disposable;
  }

  dispose(): void {
    while (this.disposables.length) {
      try {
        this.disposables.pop()!.dispose();
      } catch {
        // Ignore dispose errors
      }
    }
  }
}

