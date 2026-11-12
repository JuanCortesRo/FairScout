// Detección de requisitos que usan datos protegidos (sección 12). Nunca pueden ser criterio.
const PATRONES = [
  { dato: 'edad', re: /\b(edad|años de edad|menor(es)? de \d+|mayor(es)? de \d+ años|joven|j[oó]venes|\d+\s*a\s*\d+\s*años de edad|age|years old|young)\b/i },
  { dato: 'género', re: /\b(g[eé]nero|sexo|hombre|mujer|masculino|femenino|var[oó]n|se[ñn]orita|gender|male|female)\b/i },
  { dato: 'estado civil', re: /\b(estado civil|solter[oa]|casad[oa]|sin hijos|con hijos|married|single)\b/i },
  { dato: 'nacionalidad', re: /\b(nacionalidad|nacid[oa] en|extranjer[oa]|nativ[oa] de|nationality|citizen)\b/i },
  { dato: 'dirección', re: /\b(direcci[oó]n de residencia|que viva en|resid(a|ente) en|barrio|estrato|address)\b/i },
  { dato: 'foto o apariencia', re: /\b(foto|fotograf[ií]a|buena presencia|apariencia|estatura|photo)\b/i },
  { dato: 'religión u origen', re: /\b(religi[oó]n|etnia|raza|origen [eé]tnico)\b/i },
];

/** Devuelve el dato protegido detectado o null. */
export function detectarDatoProtegido(texto) {
  if (!texto) return null;
  const hit = PATRONES.find((p) => p.re.test(texto));
  return hit ? hit.dato : null;
}
