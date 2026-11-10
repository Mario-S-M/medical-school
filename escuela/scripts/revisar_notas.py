#!/usr/bin/env python3
"""Comprueba las notas adhesivas y los grupos de nodos de escuela/workflows/*/*.json (SPEC 07).
Cada nodo debe quedar dentro de una sola nota de sección, ninguna nota debe pisar a otra y cada workflow debe tener
una nota general. Cada grupo de nodos debe ser conexo, sin disparadores y con una sola entrada y una sola salida
(lo que n8n exige para poder colapsarlo).
Los nodos miden 100x100 y su nombre ocupa unos 40 px debajo. Sale con código 1 si algo no encaja."""
import json
import sys
from pathlib import Path

NODO_ANCHO, NODO_ALTO = 100, 140
problemas = 0
for archivo in sorted(Path(__file__).resolve().parent.parent.glob("workflows/*/*.json")):
    d = json.loads(archivo.read_text(encoding="utf-8"))
    notas = [n for n in d["nodes"] if n["type"] == "n8n-nodes-base.stickyNote"]
    nodos = [n for n in d["nodes"] if n["type"] != "n8n-nodes-base.stickyNote"]
    caja = lambda n, w, h: (n["position"][0], n["position"][1], n["position"][0] + w, n["position"][1] + h)
    cajas = {n["name"]: caja(n, n["parameters"]["width"], n["parameters"]["height"]) for n in notas}
    for n in nodos:
        a = caja(n, NODO_ANCHO, NODO_ALTO)
        dentro = [k for k, b in cajas.items() if b[0] <= a[0] and b[1] <= a[1] and a[2] <= b[2] and a[3] <= b[3]]
        if len(dentro) != 1:
            print(f"{archivo.name}: '{n['name']}' queda dentro de {len(dentro)} notas {dentro}"); problemas += 1
    nombres = list(cajas)
    for i, u in enumerate(nombres):
        for v in nombres[i + 1:]:
            a, b = cajas[u], cajas[v]
            if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                print(f"{archivo.name}: '{u}' se superpone con '{v}'"); problemas += 1
    if not any(n["parameters"]["content"].startswith("### " + d["name"]) for n in notas):
        print(f"{archivo.name}: falta la nota general '{d['name']}'"); problemas += 1
    ids = {n["id"]: n["name"] for n in nodos}
    tipos = {n["name"]: n["type"] for n in nodos}
    aristas = [(o, c["node"]) for o, v in d["connections"].items() for salida in v["main"] for c in salida]
    for g in d.get("nodeGroups", []):
        if not set(g["nodeIds"]) <= set(ids):
            print(f"{archivo.name}: el grupo '{g['name']}' apunta a nodos que no existen"); problemas += 1; continue
        miembros = {ids[i] for i in g["nodeIds"]}
        entradas = {b for a, b in aristas if b in miembros and a not in miembros} | {m for m in miembros if not any(b == m for _, b in aristas)}
        salidas = {a for a, b in aristas if a in miembros and b not in miembros}
        internas = [(a, b) for a, b in aristas if a in miembros and b in miembros]
        alcanzados, pendientes = set(), [sorted(entradas)[0]] if entradas else []
        while pendientes:
            n = pendientes.pop()
            if n not in alcanzados:
                alcanzados.add(n); pendientes += [b for a, b in internas if a == n]
        if len(entradas) > 1 or len(salidas) > 1 or alcanzados != miembros or any("Trigger" in tipos[m] or "webhook" in tipos[m] for m in miembros):
            print(f"{archivo.name}: el grupo '{g['name']}' no se puede colapsar (entradas {sorted(entradas)}, salidas {sorted(salidas)})"); problemas += 1
    print(f"{archivo.name}: {len(nodos)} nodos, {len(notas)} notas, {len(d.get('nodeGroups', []))} grupos")
sys.exit(1 if problemas else 0)
