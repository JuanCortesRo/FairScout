from fastapi import APIRouter

router = APIRouter(tags=["salud"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}
