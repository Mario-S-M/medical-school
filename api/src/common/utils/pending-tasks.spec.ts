import { PendingTasks } from './pending-tasks';

describe('PendingTasks', () => {
  it('ejecuta la tarea después de ceder el turno y la espera', async () => {
    const tasks = new PendingTasks(() => undefined);
    const order: string[] = [];
    tasks.launch('prueba', async () => {
      order.push('tarea');
    });
    order.push('respuesta');
    await tasks.waitAll();
    expect(order).toEqual(['respuesta', 'tarea']);
  });

  it('captura los errores (rechazo o excepción síncrona) sin filtrar su mensaje', async () => {
    const logged: string[] = [];
    const tasks = new PendingTasks((m) => logged.push(m));
    tasks.launch('falla', () => Promise.reject(new TypeError('correo@secreto.com')));
    tasks.launch('falla síncrona', () => {
      throw new Error('otro dato');
    });
    await tasks.waitAll();
    expect(logged).toEqual(['Falló la tarea "falla": TypeError', 'Falló la tarea "falla síncrona": Error']);
  });
});
