// Bloquea el reproductor mientras la marca de agua haya sido alterada.
export default function TamperNotice() {
  return (
    <div role="alert" data-player-ui className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 p-6 text-center text-white">
      <p className="max-w-md font-medium">La marca de agua se quitó o se ocultó. Recarga la página para continuar.</p>
    </div>
  );
}
