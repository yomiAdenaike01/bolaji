const { defineConfig, env } = require('prisma/config');
require('dotenv').config();

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  engine: 'classic',
  datasource: {
    url: env('DATABASE_URL'),
    directUrl: env('DIRECT_URL'),
    extensions: { pgbouncer: true }, // 👈 Prisma handles Supabase pooling
  },
});
