import type { UsuarioBuscado } from '../../api/tipos_escuela';
import InterruptorRol from './InterruptorRol';

type Props = { usuario: UsuarioBuscado; alCambiar: (usuario: UsuarioBuscado) => void };

export default function TarjetaUsuario({ usuario, alCambiar }: Props) {
  return (
    <section aria-label="Cuenta encontrada" className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{usuario.nombre ?? 'Sin nombre'}</h2>
      <p className="text-sm text-slate-600">{usuario.correo}{usuario.verificado ? '' : ' (sin verificar)'}</p>
      <ul className="mt-4 flex flex-col gap-2">
        <InterruptorRol usuario={usuario} rol="instructor" etiqueta="Instructor" alCambiar={alCambiar} />
        <InterruptorRol usuario={usuario} rol="administrador" etiqueta="Administrador" alCambiar={alCambiar} />
      </ul>
    </section>
  );
}
