import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/infrastructure/prisma';

/** A single Express app instance shared by all integration tests. */
export const app = createApp();

/** Supertest agent — wraps the app directly (no real port binding needed). */
export const api = () => request(app);

/** Demo credentials from prisma/seed.ts. */
export const OWNER = { email: 'owner@valorisfusion.io', password: 'Password123!' };
export const ADMIN = { email: 'admin@valorisfusion.io', password: 'Password123!' };

export { prisma };
