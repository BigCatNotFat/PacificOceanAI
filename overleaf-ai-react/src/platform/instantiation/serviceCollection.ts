export type ServiceIdentifier<T> = symbol;

export class ServiceCollection {
  private readonly services = new Map<ServiceIdentifier<any>, any>();

  set<T>(id: ServiceIdentifier<T>, instance: T): void {
    this.services.set(id, instance);
  }

  get<T>(id: ServiceIdentifier<T>): T {
    const service = this.services.get(id) as T | undefined;
    if (service === undefined) {
      throw new Error('Service not found for id: ' + id.toString());
    }
    return service;
  }

  has<T>(id: ServiceIdentifier<T>): boolean {
    return this.services.has(id);
  }
}

