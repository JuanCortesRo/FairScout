"""GET /api/vacantes/{id}/exportar: el ranking en un .xlsx para compartirlo con quien entrevista.

Es el único lugar donde aparecen los datos de contacto: ningún otro endpoint los devuelve. El archivo se arma
aquí (no en el navegador) para que el contacto nunca viaje como JSON, y cada exportación queda registrada.
"""
import io
import re
import unicodedata
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ContactoCandidatoDB, ExportacionDB, VacanteDB
from app.pipeline.scoring import PESO_OBLIGATORIOS
from app.routers.ranking import FilaRanking, calcular_ranking, requisitos_de

router = APIRouter(tags=["exportaciones"])

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
ESTADOS = {
    "cumple": "Cumple", "cumple_parcialmente": "Cumple parcialmente",
    "pendiente_verificar": "Pendiente de verificar", "no_cumple": "No cumple",
}
RESULTADOS = {
    "cumple": "Cumple", "equivalente": "Equivalente", "parcial": "Parcial", "no_cumple": "No cumple",
    "sin_informacion": "Sin información", "presente": "Presente", "ausente": "Ausente",
}
TIPOS = {"obligatorio": "Obligatorio", "deseable": "Deseable", "descalificante": "Descalificante"}
AVISO = (
    "Este archivo contiene datos personales de contacto. Compártelo solo con quienes participan en el proceso "
    "de selección y elimínalo al terminar (Ley 1581 de 2012)."
)
_ENCABEZADO = Font(bold=True, color="FFFFFF")
_FONDO_ENCABEZADO = PatternFill("solid", fgColor="5B4FE0")
_AJUSTAR = Alignment(wrap_text=True, vertical="top")


@router.get("/vacantes/{vacante_id}/exportar")
def exportar_ranking(
    vacante_id: str,
    top: int | None = Query(None, ge=1, description="Cuántos candidatos exportar; vacío = todos"),
    peso_obligatorios: float = Query(PESO_OBLIGATORIOS, ge=0, le=100),
    db: Session = Depends(get_db),
) -> Response:
    """Genera y registra un XLSX con evidencia y contactos, el único endpoint que los exporta."""
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")
    filas = calcular_ranking(db, vacante, peso_obligatorios)
    if not filas:
        raise HTTPException(status_code=409, detail="Todavía no hay candidatos evaluados para exportar.")
    filas = filas[:top] if top else filas

    ids = [f.resultado.candidato_id for f in filas]
    contactos = {
        c.candidato_id: c
        for c in db.scalars(select(ContactoCandidatoDB).where(ContactoCandidatoDB.candidato_id.in_(ids)))
    }
    ahora = datetime.now(timezone.utc)
    contenido = _libro(vacante, filas, contactos, peso_obligatorios, ahora)

    db.add(ExportacionDB(
        id=uuid.uuid4().hex, vacante_id=vacante.id, fecha=ahora, top=top,
        peso_obligatorios=peso_obligatorios, candidatos=ids,
    ))
    db.commit()

    nombre = f"ranking_{_slug(vacante.titulo)}_{ahora:%Y%m%d-%H%M}.xlsx"
    return Response(contenido, media_type=XLSX, headers={"Content-Disposition": f'attachment; filename="{nombre}"'})


def _libro(vacante: VacanteDB, filas: list[FilaRanking], contactos: dict, peso: float, fecha: datetime) -> bytes:
    """Construye en memoria las hojas Ranking, Evidencia e Información y devuelve sus bytes."""
    requisitos = requisitos_de(vacante)
    libro = Workbook()

    ranking = libro.active
    ranking.title = "Ranking"
    ranking.append([
        "Posición", "Candidato", "Nombre", "Correo", "Teléfono", "Puntaje", "Estado", "Confianza",
        "Recomendado para entrevista", "Motivo",
        *[f"{r.id} · {r.nombre}" for r in requisitos],
        "Fortalezas", "Brechas", "Aspectos por verificar",
    ])
    evidencia = libro.create_sheet("Evidencia")
    evidencia.append(["Posición", "Candidato", "Requisito", "Tipo", "Resultado", "Cita del CV", "Justificación"])

    for posicion, fila in enumerate(filas, start=1):
        r = fila.resultado
        guardada = fila.evaluacion.resultado
        por_requisito = {e.requisito_id: e.model_dump() for e in fila.evaluaciones}   # con correcciones humanas
        explicacion = guardada.get("explicacion", {})
        contacto = contactos.get(r.candidato_id)
        alias = f"Candidato {r.candidato_id[:6].upper()}"
        ranking.append([
            posicion, alias,
            contacto.nombre if contacto else None, contacto.correo if contacto else None,
            contacto.telefono if contacto else None,
            round(r.puntaje, 1), ESTADOS.get(r.estado, r.estado), r.confianza.capitalize(),
            "Sí" if r.recomendado_entrevista else "No", r.motivo_estado,
            *[_resultado(por_requisito.get(req.id)) for req in requisitos],
            _lista(explicacion.get("fortalezas")), _lista(explicacion.get("brechas")),
            _lista(explicacion.get("aspectos_por_verificar")),
        ])
        for req in requisitos:
            ev = por_requisito.get(req.id) or {}
            evidencia.append([
                posicion, alias, f"{req.id} · {req.nombre}", TIPOS.get(req.tipo, req.tipo),
                _resultado(ev or None), ev.get("cita"), ev.get("justificacion"),
            ])

    informacion = libro.create_sheet("Información")
    for etiqueta, valor in (
        ("Vacante", vacante.titulo),
        ("Versión de los requisitos", vacante.version_requisitos),
        ("Peso de los obligatorios", f"{peso:g} % (deseables: {100 - peso:g} %)"),
        ("Candidatos incluidos", len(filas)),
        ("Exportado (UTC)", fecha.strftime("%Y-%m-%d %H:%M")),
        ("Aviso", AVISO),
        ("Cómo leerlo", "El puntaje y el estado se calculan en código a partir de la evidencia citada del CV; "
                        "la IA no decide el resultado. La decisión final es de una persona."),
    ):
        informacion.append([etiqueta, valor])
    informacion.column_dimensions["A"].width = 28
    informacion.column_dimensions["B"].width = 100
    for celda in informacion["A"]:
        celda.font = Font(bold=True)
    for celda in informacion["B"]:
        celda.alignment = _AJUSTAR

    _formatear(ranking, anchos={"A": 9, "B": 18, "C": 26, "D": 30, "E": 18, "F": 9, "G": 22, "H": 11, "I": 14, "J": 40},
               ancho_resto=22, congelar="C2")
    _formatear(evidencia, anchos={"A": 9, "B": 18, "C": 40, "D": 14, "E": 16, "F": 50, "G": 60}, congelar="C2")
    salida = io.BytesIO()
    libro.save(salida)
    return salida.getvalue()


def _formatear(hoja, anchos: dict[str, int], congelar: str, ancho_resto: int = 18) -> None:
    for celda in hoja[1]:
        celda.font = _ENCABEZADO
        celda.fill = _FONDO_ENCABEZADO
        celda.alignment = Alignment(wrap_text=True, vertical="center")
    for indice in range(1, hoja.max_column + 1):
        letra = get_column_letter(indice)
        hoja.column_dimensions[letra].width = anchos.get(letra, ancho_resto)
    for fila in hoja.iter_rows(min_row=2):
        for celda in fila:
            celda.alignment = _AJUSTAR
    hoja.freeze_panes = congelar
    hoja.auto_filter.ref = hoja.dimensions


def _resultado(evaluacion: dict | None) -> str:
    if not evaluacion:
        return "Sin evaluar"
    return RESULTADOS.get(evaluacion.get("resultado"), evaluacion.get("resultado"))


def _lista(items: list[str] | None) -> str:
    return "\n".join(f"• {item}" for item in items or [])


def _slug(texto: str) -> str:
    plano = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plano.lower()).strip("-")[:40] or "vacante"
