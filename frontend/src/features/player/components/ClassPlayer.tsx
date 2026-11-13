import Hls from 'hls.js';
import { getParam } from '../../../shared/lib/url-params';
import { withQueryClient } from '../../../shared/lib/with-query-client';
import SessionGuard from '../../auth/components/SessionGuard';
import ClassPlayback from './ClassPlayback';

const alert = (text: string) => <p role="alert" className="mx-auto text-center text-red-700">{text}</p>;

function ClassPlayer() {
  const id = Number(getParam('id'));
  if (!Number.isInteger(id) || id <= 0) return alert('Falta indicar la clase.');
  return (
    <SessionGuard>
      {/* Sin MSE no hay HLS: el nativo no permite la cabecera Authorization, así que no se intenta. */}
      {Hls.isSupported() ? <ClassPlayback lessonId={id} /> : alert('Tu navegador no puede reproducir este video. Prueba con otro navegador.')}
    </SessionGuard>
  );
}

export default withQueryClient(ClassPlayer);
