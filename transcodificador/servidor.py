"""Transcodificador de videos de clase (SPEC 08).

API interna (solo red de Docker, cabecera X-Secreto-Transcodificador):
  POST /trabajos            { video_id, ruta_original, ruta_base, clave_hex } -> 202
  GET  /trabajos/<video_id> -> { estado, mensaje? }
  GET  /salud               -> { listo: true }

Un trabajo descarga el original de Storage, lo mide, lo convierte a HLS de una sola calidad (H.264 + AAC,
alto máximo 720, segmentos de 6 s) cifrado con AES-128, sube el resultado, borra el original y avisa a la API (URL_CALLBACK, /api/v1/interno/video-procesado).
Procesa un trabajo a la vez. Solo usa la biblioteca estándar y ffmpeg.
"""
import hmac
import http.client
import json
import os
import queue
import re
import secrets
import shutil
import subprocess
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SECRETO = os.environ["SECRETO_TRANSCODIFICADOR"]
CLAVE_SERVICIO = os.environ["CLAVE_SERVICIO"]
URL_STORAGE = os.environ.get("URL_STORAGE", "http://storage:5000").rstrip("/")
URL_CALLBACK = os.environ.get("URL_CALLBACK", "")
BUCKET = "videos"
DIRECTORIO = Path(os.environ.get("DIRECTORIO_TRABAJO", "/trabajo"))
MAXIMO_SEGUNDOS = 30 * 60
ALTO_MAXIMO = 720
RUTA_BASE = re.compile(r"^cursos/\d+/secciones/\d+/clases/\d+/\d+$")
RUTA_ORIGINAL = re.compile(r"^cursos/\d+/secciones/\d+/clases/\d+/\d+/original\.(mp4|mov|webm)$")
TIPOS = {".m3u8": "application/vnd.apple.mpegurl", ".ts": "video/mp2t"}

trabajos = {}  # video_id -> { estado, mensaje }
cola = queue.Queue()
cerrojo = threading.Lock()


class ErrorTrabajo(Exception):
    """Error con un mensaje apto para mostrarse al instructor."""


def registrar(texto):
    print(f"[{time.strftime('%H:%M:%S')}] {texto}", flush=True)


def llamar_storage(metodo, ruta, cuerpo=None, tipo=None):
    cabeceras = {"Authorization": f"Bearer {CLAVE_SERVICIO}"}
    if tipo:
        cabeceras["Content-Type"] = tipo
        cabeceras["x-upsert"] = "true"
    peticion = urllib.request.Request(f"{URL_STORAGE}/object/{BUCKET}/{urllib.parse.quote(ruta)}", data=cuerpo, method=metodo, headers=cabeceras)
    return urllib.request.urlopen(peticion, timeout=600)


def descargar(ruta, destino):
    with llamar_storage("GET", ruta) as respuesta, open(destino, "wb") as archivo:
        shutil.copyfileobj(respuesta, archivo, 1024 * 1024)


def subir(ruta, archivo):
    tipo = TIPOS[archivo.suffix]
    conexion = http.client.HTTPConnection(urllib.parse.urlparse(URL_STORAGE).netloc, timeout=600)
    with open(archivo, "rb") as datos:
        conexion.request("POST", f"/object/{BUCKET}/{urllib.parse.quote(ruta)}", body=datos, headers={
            "Authorization": f"Bearer {CLAVE_SERVICIO}", "Content-Type": tipo, "Content-Length": str(archivo.stat().st_size), "x-upsert": "true"})
        respuesta = conexion.getresponse()
        respuesta.read()
    if respuesta.status >= 300:
        raise ErrorTrabajo(f"Storage rechazó {archivo.name} (HTTP {respuesta.status}).")


def medir(origen):
    salida = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(origen)],
                            capture_output=True, text=True, timeout=120)
    if salida.returncode != 0:
        raise ErrorTrabajo("El archivo está dañado o su formato no es compatible.")
    datos = json.loads(salida.stdout)
    if not any(s.get("codec_type") == "video" for s in datos.get("streams", [])):
        raise ErrorTrabajo("El archivo no tiene video.")
    segundos = float(datos.get("format", {}).get("duration") or 0)
    if segundos <= 0:
        raise ErrorTrabajo("No se pudo leer la duración del video.")
    if segundos > MAXIMO_SEGUNDOS:
        raise ErrorTrabajo("El video dura más de 30 minutos.")
    return round(segundos)


def convertir(origen, salida, clave_hex):
    salida.mkdir(parents=True)
    (salida / "clave.bin").write_bytes(bytes.fromhex(clave_hex))
    (salida / "clave.info").write_text(f"clave\n{salida / 'clave.bin'}\n{secrets.token_hex(16)}\n")
    orden = ["ffmpeg", "-y", "-v", "error", "-i", str(origen), "-map", "0:v:0", "-map", "0:a:0?",
             "-vf", f"scale=-2:'min({ALTO_MAXIMO},ih)'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-profile:v", "main",
             "-pix_fmt", "yuv420p", "-force_key_frames", "expr:gte(t,n_forced*2)", "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-threads", "2",
             "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_list_size", "0", "-start_number", "1",
             "-hls_segment_filename", str(salida / "segmento_%05d.ts"), "-hls_key_info_file", str(salida / "clave.info"), str(salida / "lista.m3u8")]
    if subprocess.run(orden, capture_output=True, text=True, timeout=3600).returncode != 0:
        raise ErrorTrabajo("No se pudo procesar el video: el archivo está dañado o su formato no es compatible.")
    (salida / "clave.bin").unlink()
    (salida / "clave.info").unlink()


def procesar(trabajo):
    carpeta = DIRECTORIO / str(trabajo["video_id"])
    try:
        shutil.rmtree(carpeta, ignore_errors=True)
        carpeta.mkdir(parents=True)
        original = carpeta / "original"
        descargar(trabajo["ruta_original"], original)
        segundos = medir(original)
        hls = carpeta / "hls"
        convertir(original, hls, trabajo["clave_hex"])
        for archivo in sorted(hls.iterdir()):
            subir(f"{trabajo['ruta_base']}/hls/{archivo.name}", archivo)
        llamar_storage("DELETE", trabajo["ruta_original"]).close()
        return {"resultado": "listo", "duracion_segundos": segundos}
    except ErrorTrabajo as error:
        return {"resultado": "error", "mensaje": str(error)}
    except Exception as error:  # el original se conserva para reintentar
        registrar(f"fallo inesperado en el video {trabajo['video_id']}: {error!r}")
        return {"resultado": "error", "mensaje": "El servicio de video falló al procesar el archivo. Inténtalo de nuevo."}
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)


def avisar(video_id, resultado):
    if not URL_CALLBACK:
        return
    cuerpo = json.dumps({"video_id": video_id, **resultado}).encode()
    for intento in range(5):
        try:
            peticion = urllib.request.Request(URL_CALLBACK, data=cuerpo, method="POST",
                                              headers={"Content-Type": "application/json", "X-Secreto-Transcodificador": SECRETO})
            urllib.request.urlopen(peticion, timeout=30).close()
            return
        except Exception as error:
            registrar(f"aviso del video {video_id} falló (intento {intento + 1}): {error!r}")
            time.sleep(2 ** (intento + 1))


def trabajador():
    while True:
        trabajo = cola.get()
        video_id = trabajo["video_id"]
        with cerrojo:
            trabajos[video_id] = {"estado": "procesando"}
        registrar(f"procesando el video {video_id}")
        resultado = procesar(trabajo)
        with cerrojo:
            trabajos[video_id] = {"estado": resultado["resultado"], **({"mensaje": resultado["mensaje"]} if "mensaje" in resultado else {})}
        registrar(f"video {video_id}: {resultado['resultado']}")
        threading.Thread(target=avisar, args=(video_id, resultado), daemon=True).start()


class Manejador(BaseHTTPRequestHandler):
    server_version = "transcodificador"

    def responder(self, estado, cuerpo):
        datos = json.dumps(cuerpo).encode()
        self.send_response(estado)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def autorizado(self):
        if hmac.compare_digest(self.headers.get("X-Secreto-Transcodificador", ""), SECRETO):
            return True
        self.responder(403, {"error": "prohibido"})
        return False

    def do_GET(self):
        if self.path == "/salud":
            return self.responder(200, {"listo": True})
        coincide = re.fullmatch(r"/trabajos/(\d+)", self.path)
        if not coincide:
            return self.responder(404, {"error": "no encontrado"})
        if not self.autorizado():
            return
        trabajo = trabajos.get(int(coincide.group(1)))
        self.responder(200, trabajo) if trabajo else self.responder(404, {"error": "no encontrado"})

    def do_POST(self):
        if self.path != "/trabajos":
            return self.responder(404, {"error": "no encontrado"})
        if not self.autorizado():
            return
        try:
            datos = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 4096)))
            valido = (isinstance(datos, dict) and set(datos) == {"video_id", "ruta_original", "ruta_base", "clave_hex"}
                      and isinstance(datos["video_id"], int) and RUTA_ORIGINAL.match(str(datos["ruta_original"]))
                      and RUTA_BASE.match(str(datos["ruta_base"])) and re.fullmatch(r"[0-9a-f]{32}", str(datos["clave_hex"]))
                      and datos["ruta_original"].startswith(datos["ruta_base"] + "/"))
        except (ValueError, TypeError):
            valido = False
        if not valido:
            return self.responder(422, {"error": "datos no válidos"})
        with cerrojo:
            if trabajos.get(datos["video_id"], {}).get("estado") in ("en_cola", "procesando"):
                return self.responder(409, {"error": "ya está en la cola"})
            trabajos[datos["video_id"]] = {"estado": "en_cola"}
        cola.put(datos)
        self.responder(202, {"estado": "en_cola"})

    def log_message(self, formato, *argumentos):
        registrar(f"{self.address_string()} {formato % argumentos}")


if __name__ == "__main__":
    threading.Thread(target=trabajador, daemon=True).start()
    registrar("transcodificador listo en el puerto 8090")
    ThreadingHTTPServer(("0.0.0.0", 8090), Manejador).serve_forever()
