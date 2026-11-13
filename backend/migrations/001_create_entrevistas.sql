CREATE TABLE IF NOT EXISTS entrevistas (
    id VARCHAR(32) PRIMARY KEY,
    candidato_id VARCHAR(32) NOT NULL,
    vacante_id VARCHAR(32) NOT NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'en_curso',
    plan JSON NOT NULL,
    mensajes JSON NOT NULL,
    historial JSON NOT NULL,
    pregunta_actual JSON,
    informe JSON
);
