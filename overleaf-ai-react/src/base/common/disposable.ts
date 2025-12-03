export interface IDisposable {
  dispose(): void;
}

export class Disposable implements IDisposable {
  private readonly _store = new DisposableStore();

  protected _register<T extends IDisposable>(disposable: T): T {
    return this._store.add(disposable);
  }

  dispose(): void {
    this._store.dispose();
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

