import { conSesion } from '../../api/con_sesion';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import type { Seccion } from '../../api/tipos_escuela';
import { guardarSeccion } from '../../api/temario';
import useCampo from '../../hooks/useCampo';
import useEnvio from '../../hooks/useEnvio';
import { validarTituloTemario } from '../../validacion/temario';
import AlertaError from '../ui/AlertaError';
import BotonEnvio from '../ui/BotonEnvio';
import CampoTexto from '../ui/CampoTexto';

type Props = { cursoId: number; seccion?: Seccion; alGuardar: () => void };

export default function FormularioSeccion({ cursoId, seccion, alGuardar }: Props) {
  const titulo = useCampo(validarTituloTemario, seccion?.titulo ?? '');
  const { enviar, enviando, error } = useEnvio(
    () => conSesion((token) => guardarSeccion(token, { curso_id: cursoId, seccion_id: seccion?.id, titulo: titulo.valor.trim() })),
    () => (seccion ? null : titulo.setValor(''), alGuardar()),
  );
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (titulo.validarYMarcar()) void enviar();
  };
  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-wrap items-start gap-3">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <CampoTexto id={`seccion_titulo_${seccion?.id ?? 'nueva'}`} etiqueta="Título de la sección" value={titulo.valor} alCambiar={titulo.alCambiar} onBlur={titulo.alSalir} errores={[...titulo.errores, ...detallesDeCampo(error, 'titulo')]} />
      <div className="self-center pt-3"><BotonEnvio texto={seccion ? 'Guardar sección' : 'Añadir sección'} enviando={enviando} /></div>
    </form>
  );
}
