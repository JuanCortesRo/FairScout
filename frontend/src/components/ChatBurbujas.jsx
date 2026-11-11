// Base visual del chat de la entrevista (bonus, sección 13), recuperada del bloque
// "conversación" de la CandidateDetail original. Aquí las respuestas las da una persona real.
export default function ChatBurbujas({ mensajes }) {
  return (
    <div className="conversation-bubbles">
      {mensajes.map((m, i) => (
        <div key={i} className={`chat-bubble ${m.rol === 'agente' ? 'chat-bubble-recruiter' : 'chat-bubble-candidate'}`}>
          <div className="chat-bubble-label">{m.rol === 'agente' ? 'Entrevistador' : 'Candidato'}</div>
          {m.texto}
        </div>
      ))}
    </div>
  );
}
