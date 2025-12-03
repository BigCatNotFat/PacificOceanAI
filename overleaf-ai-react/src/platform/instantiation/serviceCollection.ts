export type ServiceIdentifier<T> = symbol;

export class ServiceCollection {
  private readonly services = new Map<ServiceIdentifier<unknown>, unknown>();

  set<T>(id: ServiceIdentifier<T>, instance: T): void {
    this.services.set(id, instance);
  }

  get<T>(id: ServiceIdentifier<T>): T {
    const service = this.services.get(id);
    if (!service) {
      throw new Error('Service not found for id: ' + id.toString());
    }
    return service as T;
  }
}

