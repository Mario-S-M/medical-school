import { AVISO_DESDE_MIN, RECOMENDADO_MIN } from '../../validacion/video';
import Boton from '../ui/Boton';

type Props = { minutos: number; alConfirmar: () => void; alCancelar: () => void };

export default function AvisoClaseLarga({ minutos, alConfirmar, alCancelar }: Props) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">¿Estás seguro de que quieres subir una clase tan grande?</p>
      <p>
        Tu video dura unos {Math.round(minutos)} minutos. Preferimos clases más cortas ({RECOMENDADO_MIN} a {AVISO_DESDE_MIN} minutos):
        se aprende mejor y se mantiene la atención. Aun así, puedes subirla.
      </p>
      <div className="flex gap-2">
        <Boton onClick={alConfirmar}>Subir de todos modos</Boton>
        <Boton variante="secundario" onClick={alCancelar}>Elegir otro archivo</Boton>
      </div>
    </div>
  );
}
