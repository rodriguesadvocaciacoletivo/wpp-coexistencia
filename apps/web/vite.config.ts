import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Resolvido a partir da localização deste arquivo, não do cwd — a Vercel roda
// o comando de build de dentro de apps/web, e qualquer caminho relativo ao cwd
// se torna imprevisível.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Um único .env na raiz do monorepo serve API e web. Só as variáveis com
  // prefixo VITE_ chegam ao bundle do navegador.
  envDir: '../../',
  build: {
    // Na Vercel, a saída vai para dist na RAIZ do repositório — que é onde ela
    // procura, independentemente de override no painel ou de Framework Preset.
    // O caminho é resolvido de forma absoluta a partir daqui, então funciona
    // seja qual for o diretório em que o build é disparado.
    // Localmente, mantém apps/web/dist para não surpreender quem roda `pnpm build`.
    outDir: process.env.VERCEL ? resolve(here, '../../dist') : 'dist',
    // Necessário para o Vite aceitar limpar um outDir fora da raiz do projeto.
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
