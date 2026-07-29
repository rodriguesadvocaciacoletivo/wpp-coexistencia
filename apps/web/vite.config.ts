import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Um único .env na raiz do monorepo serve API e web. Só as variáveis com
  // prefixo VITE_ chegam ao bundle do navegador.
  envDir: '../../',
  server: {
    port: 5173,
    strictPort: true,
  },
});
