"""Punto de entrada de la API: crea la app FastAPI, configura CORS e incluye los routers."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import cvs, health, ranking, vacantes

app = FastAPI(title="AI Talent Scout API")

# Lógica de CORS conservada del main.py original (orígenes adaptados al nuevo frontend).
frontend_url = settings.FRONTEND_URL
origins = ["*"] if frontend_url == "*" else [
    frontend_url,
    "http://localhost:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for modulo in (health, vacantes, cvs, ranking):
    app.include_router(modulo.router, prefix="/api")
