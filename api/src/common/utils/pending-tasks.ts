// Lógica sin Nest del trabajo en segundo plano: cada tarea se sigue en un conjunto (ninguna promesa queda suelta),
// sus errores se entregan a `onFailure` (solo nombre y tipo de fallo, nunca datos del usuario) y `waitAll()` aguarda
// a las pendientes.
export class PendingTasks {
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly onFailure: (message: string) => void) {}

  launch(name: string, task: () => Promise<unknown>): void {
    const tracking: Promise<void> = new Promise<void>((resolve) => setImmediate(resolve)) // cede el turno: primero se escribe la respuesta
      .then(task)
      .then(
        () => undefined,
        (error: unknown) => this.onFailure(`Falló la tarea "${name}": ${error instanceof Error ? error.name : 'desconocido'}`),
      )
      .finally(() => this.pending.delete(tracking));
    this.pending.add(tracking);
  }

  async waitAll(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }
}
