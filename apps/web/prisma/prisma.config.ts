// Prisma 7 Configuration
const config = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
};

export default config;
