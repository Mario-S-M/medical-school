#!/usr/bin/env python3
"""Lee la ficha pública de un curso por la entrada estándar y comprueba que no lleve campos internos
y que tenga la categoría, el nivel y la última sección esperados. Uso: sin_campos_internos.py <slug categoría> <nivel> <última sección>."""
import json
import sys

PROHIBIDAS = {"instructor_id", "estado", "comentario_revision", "correo", "email"}


def claves(valor):
    if isinstance(valor, dict):
        for clave, hijo in valor.items():
            yield clave
            yield from claves(hijo)
    elif isinstance(valor, list):
        for hijo in valor:
            yield from claves(hijo)


ficha = json.load(sys.stdin)
categoria, nivel, ultima = sys.argv[1:4]
correcto = (not (set(claves(ficha)) & PROHIBIDAS) and ficha["categoria"]["slug"] == categoria
            and ficha["nivel"] == nivel and ficha["secciones"][-1]["titulo"] == ultima)
sys.exit(0 if correcto else 1)
