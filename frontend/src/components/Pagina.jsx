export default function Pagina({ titulo, children }) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-4 border-b-2 border-indigo-500 pb-2 text-2xl font-semibold">{titulo}</h2>
      {children ?? <p className="text-slate-500">En construcción</p>}
    </section>
  );
}
