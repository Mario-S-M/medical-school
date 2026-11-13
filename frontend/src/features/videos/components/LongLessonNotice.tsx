import Button from '../../../shared/components/ui/Button';
import { RECOMMENDED_MIN, WARN_FROM_MIN } from '../schemas/video-file-schema';

type Props = { minutes: number; onConfirm: () => void; onCancel: () => void };

export default function LongLessonNotice({ minutes, onConfirm, onCancel }: Props) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">¿Estás seguro de que quieres subir una clase tan grande?</p>
      <p>
        Tu video dura unos {Math.round(minutes)} minutos. Preferimos clases más cortas ({RECOMMENDED_MIN} a {WARN_FROM_MIN} minutos):
        se aprende mejor y se mantiene la atención. Aun así, puedes subirla.
      </p>
      <div className="flex gap-2">
        <Button onClick={onConfirm}>Subir de todos modos</Button>
        <Button variant="secondary" onClick={onCancel}>Elegir otro archivo</Button>
      </div>
    </div>
  );
}
