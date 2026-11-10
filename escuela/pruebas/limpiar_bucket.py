#!/usr/bin/env python3
"""Borra de un bucket de Storage todo lo que cuelga de unos prefijos (recursivo). Lo usan las pruebas para no dejar archivos.
Uso: limpiar_bucket.py <bucket> <prefijo>... ; la URL y la clave de servicio salen de las variables ALMACEN y CLAVE_SERVICIO."""
import json
import os
import sys
import urllib.request

ALMACEN, CLAVE = os.environ["ALMACEN"], os.environ["CLAVE_SERVICIO"]
CABECERAS = {"Authorization": f"Bearer {CLAVE}", "apikey": CLAVE, "Content-Type": "application/json"}


def llamar(metodo, ruta, cuerpo):
    return json.load(urllib.request.urlopen(urllib.request.Request(ALMACEN + ruta, method=metodo, headers=CABECERAS, data=json.dumps(cuerpo).encode())))


def archivos(bucket, prefijo):
    for e in llamar("POST", f"/object/list/{bucket}", {"prefix": prefijo, "limit": 1000}):
        if e.get("id"):
            yield f"{prefijo}/{e['name']}"
        else:
            yield from archivos(bucket, f"{prefijo}/{e['name']}")


bucket = sys.argv[1]
rutas = [r for p in sys.argv[2:] for r in archivos(bucket, p)]
if rutas:
    llamar("DELETE", f"/object/{bucket}", {"prefixes": rutas})
