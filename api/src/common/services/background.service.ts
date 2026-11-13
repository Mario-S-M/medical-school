import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';
import { PendingTasks } from '../utils/pending-tasks';

// Ejecuta trabajo después de haber respondido. Al apagar la aplicación espera a las tareas pendientes.
@Injectable()
export class BackgroundService implements BeforeApplicationShutdown {
  private readonly logger = new Logger('Background');
  private readonly tasks = new PendingTasks((message) => this.logger.error(message));

  launch(name: string, task: () => Promise<unknown>): void {
    this.tasks.launch(name, task);
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.tasks.waitAll();
  }
}
