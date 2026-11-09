import { conSesion } from '../../api/con_sesion';
import { guardarCategoria } from '../../api/escuela';
import { detallesDeCampo, mensajeDeError } from '../../api/errores';
import type { Categoria } from '../../api/tipos_escuela';
import useCampo from '../../hooks/useCampo';
import useEnvio from '../../hooks/useEnvio';
import { validarNombreCategoria, validarPosicion } from '../../validacion/categoria';
import AlertaError from '../ui/AlertaError';
import BotonEnvio from '../ui/BotonEnvio';
import CampoTexto from '../ui/CampoTexto';

type Props = { inicial?: Categoria; posicionSugerida: number; alGuardar: () => void };

export default function FormularioCategoria({ inicial, posicionSugerida, alGuardar }: Props) {
  const sufijo = inicial?.id ?? 'nueva';
  const nombre = useCampo(validarNombreCategoria, inicial?.nombre ?? '');
  const posicion = useCampo(validarPosicion, String(inicial?.posicion ?? posicionSugerida));
  const { enviar, enviando, error } = useEnvio(
    () => conSesion((token) => guardarCategoria(token, { id: inicial?.id, nombre: nombre.valor.trim(), posicion: Number(posicion.valor) })),
    () => {
      if (!inicial) nombre.setValor('');
      alGuardar();
    },
  );
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if ([nombre.validarYMarcar(), posicion.validarYMarcar()].every(Boolean)) void enviar();
  };
  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-wrap items-start gap-3">
      <AlertaError mensaje={error ? mensajeDeError(error) : null} />
      <CampoTexto id={`nombre_${sufijo}`} etiqueta="Nombre" value={nombre.valor} alCambiar={nombre.alCambiar} onBlur={nombre.alSalir} errores={[...nombre.errores, ...detallesDeCampo(error, 'nombre')]} />
      <CampoTexto id={`posicion_${sufijo}`} etiqueta="Posición" type="number" value={posicion.valor} alCambiar={posicion.alCambiar} onBlur={posicion.alSalir} errores={[...posicion.errores, ...detallesDeCampo(error, 'posicion')]} />
      <div className="self-center pt-3"><BotonEnvio texto={inicial ? 'Guardar' : 'Añadir'} enviando={enviando} /></div>
    </form>
  );
}
