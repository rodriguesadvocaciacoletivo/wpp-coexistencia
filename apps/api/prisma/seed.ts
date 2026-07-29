/**
 * Seed do primeiro administrador.
 *
 * Roda uma única vez por instalação. É idempotente: se o e-mail já existe, o
 * script apenas informa e sai, sem sobrescrever a senha de ninguém.
 */
import { PrismaClient } from '@prisma/client';
import { Algorithm, hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Administrador';
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env antes de rodar o seed.',
    );
  }

  if (password.length < 10) {
    throw new Error('SEED_ADMIN_PASSWORD precisa ter no mínimo 10 caracteres.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log(
      `Usuário ${email} já existe (status: ${existing.status}). Nada a fazer.`,
    );
    return;
  }

  const passwordHash = await hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const admin = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: 'admin',
      status: 'active',
    },
  });

  console.log(`Administrador criado: ${admin.email}`);
  console.log('Faça login e troque a senha do .env por uma definitiva.');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
