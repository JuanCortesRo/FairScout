"""Entrevistas estructuradas y persistentes para un candidato y una vacante."""
import hashlib
import secrets
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.config import settings
from app.interview.agent import (
    EvaluacionTurno, PreguntaEntrevista, RespuestaAgenteInvalida,
    construir_informe, evaluar_respuesta, generar_plan,
)
from app.mensajes import error_de_ia
from app.models import CandidatoDB, EntrevistaDB, VacanteDB
from app.schemas import (
    ConsentimientoEntrevistaEntrada, CrearInvitacionEntrevistaSalida,
    EntrevistaEntrada, EntrevistaPrivadaResumen, EntrevistaPublicaSalida,
    EntrevistaSalida, Ficha, RespuestaEntrevistaEntrada,
    RespuestaPublicaEntrevistaEntrada, Requisito,
)

router = APIRouter(tags=["interviews"])
_PUBLIC_LIMIT = 10
_PUBLIC_WINDOW = timedelta(minutes=1)
_public_requests: dict[str, deque[datetime]] = defaultdict(deque)
_INVALID_LINK = "El enlace de entrevista no es válido o ya no está disponible."


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def hash_interview_token(token: str) -> str:
    """Hash the bearer token; the clear token is never persisted."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _iso(value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime) and value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()  # type: ignore[union-attr]


def _resumen(fila: EntrevistaDB) -> EntrevistaPrivadaResumen:
    return EntrevistaPrivadaResumen(
        id=fila.id, candidato_id=fila.candidato_id, vacante_id=fila.vacante_id,
        estado=fila.estado, expira_at=_iso(fila.expira_at),
        consent_at=_iso(fila.consent_at), started_at=_iso(fila.started_at),
        finished_at=_iso(fila.finished_at),
    )


def _pregunta_publica(pregunta: dict | None) -> dict | None:
    if not pregunta:
        return None
    return {key: pregunta[key] for key in ("tema", "texto") if key in pregunta}


def _publica(fila: EntrevistaDB, vacante: VacanteDB | None = None) -> EntrevistaPublicaSalida:
    return EntrevistaPublicaSalida(
        estado=fila.estado, expira_at=_iso(fila.expira_at) or "",
        vacante_titulo=vacante.titulo if vacante else None,
        pregunta=_pregunta_publica(fila.pregunta_actual),
        progreso={"respondidas": len(fila.historial), "maximo": min(10, len(fila.plan))},
    )


def _rate_limit(token_hash: str) -> None:
    ahora = _utcnow()
    solicitudes = _public_requests[token_hash]
    while solicitudes and ahora - solicitudes[0] >= _PUBLIC_WINDOW:
        solicitudes.popleft()
    if len(solicitudes) >= _PUBLIC_LIMIT:
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes. Intenta de nuevo más tarde.")
    solicitudes.append(ahora)


def _obtener_publica(token: str, db: Session) -> EntrevistaDB:
    fila = db.query(EntrevistaDB).filter(EntrevistaDB.token_hash == hash_interview_token(token)).first()
    ahora = _utcnow()
    if fila is None or fila.revoked_at is not None or fila.estado in {"finalizada", "revocada", "expirada"}:
        raise HTTPException(status_code=404, detail=_INVALID_LINK)
    expira = fila.expira_at
    if expira is None or (expira.replace(tzinfo=timezone.utc) if expira.tzinfo is None else expira) <= ahora:
        fila.estado = "expirada"
        db.commit()
        raise HTTPException(status_code=404, detail=_INVALID_LINK)
    return fila


def _requisitos(vacante: VacanteDB) -> list[Requisito]:
    return [Requisito(id=r.id, nombre=r.nombre, tipo=r.tipo, categoria=r.categoria, peso=r.peso)
            for r in vacante.requisitos]


def _respuesta(fila: EntrevistaDB, evaluacion: dict | None = None,
               siguiente: dict | None = None) -> EntrevistaSalida:
    inconsistencias = [x for h in fila.historial for x in h.get("evaluacion", {}).get("inconsistencias", [])]
    respondidas = len(fila.historial)
    total = max(len(fila.plan), 5)
    informe = fila.informe
    return EntrevistaSalida(
        id=fila.id, candidato_id=fila.candidato_id, vacante_id=fila.vacante_id,
        pregunta=fila.pregunta_actual, pregunta_siguiente=siguiente or fila.pregunta_actual,
        mensajes=fila.mensajes, historial=fila.historial,
        evaluacion_respuesta=evaluacion, inconsistencias=inconsistencias,
        progreso={"respondidas": respondidas, "total": total, "porcentaje": min(100, round(respondidas / total * 100))},
        estado=fila.estado, informe=informe,
        recomendacion=(informe or {}).get("recomendacion"),
    )


@router.post("/entrevistas", response_model=EntrevistaSalida)
async def iniciar_entrevista(entrada: EntrevistaEntrada, db: Session = Depends(get_db)) -> EntrevistaSalida:
    """Crea una entrevista privada y revoca cualquier sesión pendiente del mismo candidato y vacante."""
    candidato = db.get(CandidatoDB, entrada.candidato_id)
    vacante = db.get(VacanteDB, entrada.vacante_id)
    if candidato is None or vacante is None:
        raise HTTPException(status_code=404, detail="El candidato o la vacante no existe.")
    if candidato.vacante_id != vacante.id:
        raise HTTPException(status_code=409, detail="El CV no pertenece a esta vacante.")
    if candidato.estado != "processed":
        raise HTTPException(status_code=409, detail="El candidato no está listo para entrevista.")
    pendientes = db.query(EntrevistaDB).filter(
        EntrevistaDB.vacante_id == vacante.id,
        EntrevistaDB.candidato_id == candidato.id,
        EntrevistaDB.estado.in_(("pending", "en_curso")),
    ).all()
    for pendiente in pendientes:
        pendiente.estado = "revocada"
        pendiente.revoked_at = _utcnow()
    try:
        plan = await generar_plan(Ficha.model_validate(candidato.ficha), _requisitos(vacante))
    except Exception as error:
        raise error_de_ia(error, "preparar la entrevista") from error
    fila = EntrevistaDB(
        id=uuid.uuid4().hex, candidato_id=candidato.id, vacante_id=vacante.id,
        estado="en_curso", plan=[p.model_dump() for p in plan], mensajes=[
            {"rol": "agente", "texto": "Te haré entre 5 y 10 preguntas sobre tu experiencia."},
            {"rol": "agente", "texto": plan[0].texto, "pregunta_id": plan[0].id},
        ], historial=[], pregunta_actual=plan[0].model_dump(),
    )
    db.add(fila)
    db.commit()
    return _respuesta(fila)


@router.post(
    "/vacantes/{vacante_id}/candidatos/{candidato_id}/entrevista",
    response_model=CrearInvitacionEntrevistaSalida,
)
async def crear_invitacion(
    vacante_id: str, candidato_id: str, request: Request, db: Session = Depends(get_db)
) -> CrearInvitacionEntrevistaSalida:
    """Genera un enlace público de 72 horas y persiste solo el hash de su token de acceso."""
    candidato = db.get(CandidatoDB, candidato_id)
    vacante = db.get(VacanteDB, vacante_id)
    if candidato is None or vacante is None:
        raise HTTPException(status_code=404, detail="El candidato o la vacante no existe.")
    if candidato.vacante_id != vacante.id:
        raise HTTPException(status_code=409, detail="El CV no pertenece a esta vacante.")
    if candidato.estado != "processed":
        raise HTTPException(status_code=409, detail="El candidato no está listo para entrevista.")
    try:
        plan = await generar_plan(Ficha.model_validate(candidato.ficha), _requisitos(vacante))
    except Exception as error:
        raise error_de_ia(error, "preparar la entrevista") from error
    token = secrets.token_urlsafe(32)
    expira = _utcnow() + timedelta(hours=72)
    fila = EntrevistaDB(
        id=uuid.uuid4().hex, candidato_id=candidato_id, vacante_id=vacante_id,
        estado="pending", token_hash=hash_interview_token(token), expira_at=expira,
        plan=[p.model_dump() for p in plan], mensajes=[], historial=[],
        pregunta_actual=plan[0].model_dump(),
    )
    db.add(fila)
    db.commit()
    public_url = settings.FRONTEND_URL.rstrip("/") + f"/entrevista/{token}"
    return CrearInvitacionEntrevistaSalida(
        id=fila.id, public_url=public_url, token=token,
        expira_at=expira.isoformat(), estado=fila.estado,
    )


@router.get("/vacantes/{vacante_id}/entrevistas", response_model=list[EntrevistaPrivadaResumen])
def listar_entrevistas(vacante_id: str, db: Session = Depends(get_db)) -> list[EntrevistaPrivadaResumen]:
    filas = db.query(EntrevistaDB).filter(EntrevistaDB.vacante_id == vacante_id).all()
    ahora = _utcnow()
    for fila in filas:
        expira = fila.expira_at
        if fila.estado in {"pending", "en_curso"} and expira and (
            expira.replace(tzinfo=timezone.utc) if expira.tzinfo is None else expira
        ) <= ahora:
            fila.estado = "expirada"
    db.commit()
    return [_resumen(fila) for fila in filas]


@router.post("/entrevistas/{entrevista_id}/revocar", response_model=EntrevistaPrivadaResumen)
def revocar_entrevista(entrevista_id: str, db: Session = Depends(get_db)) -> EntrevistaPrivadaResumen:
    fila = db.get(EntrevistaDB, entrevista_id)
    if fila is None:
        raise HTTPException(status_code=404, detail="La entrevista no existe.")
    if fila.estado not in {"finalizada", "expirada"}:
        fila.estado = "revocada"
        fila.revoked_at = _utcnow()
        db.commit()
    return _resumen(fila)


@router.get("/publico/entrevistas/{token}", response_model=EntrevistaPublicaSalida)
def ver_entrevista_publica(token: str, db: Session = Depends(get_db)) -> EntrevistaPublicaSalida:
    """Consulta el estado público del enlace tras aplicar límite de solicitudes y validar expiración."""
    _rate_limit(hash_interview_token(token))
    fila = _obtener_publica(token, db)
    return _publica(fila, db.get(VacanteDB, fila.vacante_id))


@router.post(
    "/publico/entrevistas/{token}/iniciar",
    response_model=EntrevistaPublicaSalida,
)
def iniciar_entrevista_publica(
    token: str, entrada: ConsentimientoEntrevistaEntrada, db: Session = Depends(get_db)
) -> EntrevistaPublicaSalida:
    """Inicia el enlace público únicamente después de registrar el consentimiento."""
    token_hash = hash_interview_token(token)
    _rate_limit(token_hash)
    fila = _obtener_publica(token, db)
    if not entrada.consentimiento:
        raise HTTPException(status_code=400, detail="Debes aceptar el consentimiento para iniciar.")
    if fila.estado == "pending":
        ahora = _utcnow()
        fila.estado = "en_curso"
        fila.consent_at = ahora
        fila.started_at = ahora
        db.commit()
    return _publica(fila, db.get(VacanteDB, fila.vacante_id))


@router.post(
    "/publico/entrevistas/{token}/responder",
    response_model=EntrevistaPublicaSalida,
)
async def responder_entrevista_publica(
    token: str, entrada: RespuestaPublicaEntrevistaEntrada, db: Session = Depends(get_db)
) -> EntrevistaPublicaSalida:
    """Procesa una respuesta pública, avanza el plan y finaliza entre cinco y diez turnos."""
    token_hash = hash_interview_token(token)
    _rate_limit(token_hash)
    fila = _obtener_publica(token, db)
    if fila.estado != "en_curso" or fila.pregunta_actual is None:
        raise HTTPException(status_code=409, detail="La entrevista debe iniciarse con consentimiento.")
    candidato = db.get(CandidatoDB, fila.candidato_id)
    if candidato is None:
        raise HTTPException(status_code=404, detail=_INVALID_LINK)
    pregunta = PreguntaEntrevista.model_validate(fila.pregunta_actual)
    try:
        evaluacion, siguiente, terminar = await evaluar_respuesta(
            Ficha.model_validate(candidato.ficha), pregunta, entrada.texto, fila.historial
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail="No fue posible procesar la respuesta.") from error
    fila.historial = [*fila.historial, {
        "pregunta": pregunta.model_dump(), "respuesta": entrada.texto,
        "evaluacion": evaluacion.model_dump(),
    }]
    indice = len(fila.historial)
    if siguiente is None and indice < 5 and indice < len(fila.plan):
        siguiente = PreguntaEntrevista.model_validate(fila.plan[indice])
    if (terminar and indice >= 5) or indice >= min(10, len(fila.plan)) or (
        siguiente is None and indice >= 5
    ):
        fila.estado = "finalizada"
        fila.finished_at = _utcnow()
        fila.informe = construir_informe(fila.historial)
        fila.pregunta_actual = None
    else:
        fila.pregunta_actual = siguiente.model_dump() if siguiente else fila.plan[indice]
    db.commit()
    return _publica(fila, db.get(VacanteDB, fila.vacante_id))


@router.post("/entrevistas/{entrevista_id}/respuestas", response_model=EntrevistaSalida)
async def responder_entrevista(entrevista_id: str, entrada: RespuestaEntrevistaEntrada,
                               db: Session = Depends(get_db)) -> EntrevistaSalida:
    """Guarda la respuesta privada y avanza o finaliza la entrevista sin terminar antes de cinco turnos."""
    fila = db.get(EntrevistaDB, entrevista_id)
    if fila is None:
        raise HTTPException(status_code=404, detail="La entrevista no existe.")
    if fila.estado != "en_curso" or fila.pregunta_actual is None:
        raise HTTPException(status_code=409, detail="La entrevista no está activa.")
    candidato = db.get(CandidatoDB, fila.candidato_id)
    if candidato is None:
        raise HTTPException(status_code=404, detail="El candidato de la entrevista no existe.")
    pregunta = PreguntaEntrevista.model_validate(fila.pregunta_actual)
    try:
        evaluacion, siguiente, terminar = await evaluar_respuesta(
            Ficha.model_validate(candidato.ficha), pregunta, entrada.respuesta, fila.historial)
    except Exception as error:
        raise error_de_ia(error, "procesar la respuesta") from error
    historial = [*fila.historial, {"pregunta": pregunta.model_dump(), "respuesta": entrada.respuesta,
                                   "evaluacion": evaluacion.model_dump()}]
    fila.historial = historial
    fila.mensajes = [*fila.mensajes, {"rol": "candidato", "texto": entrada.respuesta,
                                      "evaluacion": evaluacion.model_dump()}]
    max_preguntas = len(fila.plan) >= 5 and len(historial) >= 10
    if siguiente is None and len(historial) < 5 and not max_preguntas:
        siguiente = PreguntaEntrevista.model_validate(fila.plan[len(historial)])
    # Nunca se termina antes de cinco respuestas, aunque el modelo lo sugiera.
    if (terminar and len(historial) >= 5) or max_preguntas or (siguiente is None and len(historial) >= 5):
        fila.estado = "finalizada"
        fila.informe = construir_informe(historial)
        fila.pregunta_actual = None
        fila.mensajes = [*fila.mensajes, {"rol": "agente", "texto": "Gracias por tu tiempo. La entrevista terminó."}]
    else:
        fila.pregunta_actual = siguiente.model_dump()
        fila.mensajes = [*fila.mensajes, {"rol": "agente", "texto": siguiente.texto,
                                          "pregunta_id": siguiente.id}]
    db.commit()
    return _respuesta(fila, evaluacion.model_dump(), siguiente.model_dump() if siguiente else None)


@router.get("/entrevistas/{entrevista_id}", response_model=EntrevistaSalida)
def obtener_entrevista(entrevista_id: str, db: Session = Depends(get_db)) -> EntrevistaSalida:
    """Devuelve el estado privado completo de una entrevista persistida."""
    fila = db.get(EntrevistaDB, entrevista_id)
    if fila is None:
        raise HTTPException(status_code=404, detail="La entrevista no existe.")
    return _respuesta(fila)


@router.post("/entrevistas/{entrevista_id}/finalizar", response_model=EntrevistaSalida)
def finalizar_entrevista(entrevista_id: str, db: Session = Depends(get_db)) -> EntrevistaSalida:
    """Finaliza manualmente una entrevista solo si ya contiene al menos cinco respuestas."""
    fila = db.get(EntrevistaDB, entrevista_id)
    if fila is None:
        raise HTTPException(status_code=404, detail="La entrevista no existe.")
    if fila.estado == "en_curso" and len(fila.historial) < 5:
        raise HTTPException(status_code=409, detail="La entrevista requiere al menos cinco respuestas.")
    fila.estado = "finalizada"
    fila.informe = construir_informe(fila.historial)
    fila.pregunta_actual = None
    db.commit()
    return _respuesta(fila)


@router.post("/entrevistas/{entrevista_id}/reiniciar", response_model=EntrevistaSalida)
async def reiniciar_entrevista(entrevista_id: str, db: Session = Depends(get_db)) -> EntrevistaSalida:
    """Crea una sesión nueva con el plan guardado; conserva intacto el historial anterior."""
    fila = db.get(EntrevistaDB, entrevista_id)
    if fila is None:
        raise HTTPException(status_code=404, detail="La entrevista no existe.")
    fila.plan = fila.plan or []
    if not fila.plan:
        raise HTTPException(status_code=409, detail="La entrevista no tiene preguntas.")
    nueva = EntrevistaDB(
        id=uuid.uuid4().hex,
        candidato_id=fila.candidato_id,
        vacante_id=fila.vacante_id,
        estado="en_curso",
        plan=fila.plan,
        historial=[],
        pregunta_actual=fila.plan[0],
        mensajes=[
            {"rol": "agente", "texto": "La entrevista se reinició."},
            {"rol": "agente", "texto": fila.plan[0]["texto"], "pregunta_id": fila.plan[0]["id"]},
        ],
    )
    db.add(nueva)
    db.commit()
    return _respuesta(nueva)
