"""GET /api/ranking: ranking de candidatos para una vacante.

TODO: leer los resultados calculados por el pipeline desde la base de datos.
"""
from fastapi import APIRouter

from app.schemas import RankingSalida

router = APIRouter(tags=["ranking"])


@router.get("/ranking", response_model=RankingSalida)
def obtener_ranking(vacante_id: str | None = None) -> RankingSalida:
    return RankingSalida(vacante_id=vacante_id, candidatos=[])
