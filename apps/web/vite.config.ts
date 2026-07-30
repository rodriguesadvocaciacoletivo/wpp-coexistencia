import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Resolvido a partir da localização deste arquivo, nunca do cwd: dependendo de
// como a Vercel dispara o build, o diretório de trabalho pode ser a raiz do
// repositório ou apps/web, e caminhos relativos ficam imprevisíveis.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Um único .env na raiz do monorepo serve API e web. Só as variáveis com
  // prefixo VITE_ chegam ao bundle do navegador.
  envDir: '../../',
  build: {
    // Caminho absoluto: a saída vai para apps/web/dist independentemente de
    // onde o comando foi disparado. O espelhamento para a raiz do repositório
    // (necessário na Vercel) é feito por scripts/mirror-dist.mjs.
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
