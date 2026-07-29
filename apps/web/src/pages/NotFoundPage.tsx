import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-content-400">
          Erro 404
        </p>
        <h1 className="mt-2 text-xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-content-400">
          O endereço acessado não existe ou foi movido.
        </p>
        <Link
          to="/conversas"
          className="mt-6 inline-block text-sm text-brand-400 hover:text-brand-300"
        >
          Voltar para as conversas
        </Link>
      </div>
    </div>
  );
}
