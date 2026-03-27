import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
} = process.env;

if (!DB_USER || !DB_PASSWORD) {
  throw new Error(
    `Missing database credentials. Ensure DB_USER and DB_PASSWORD are set. DB_USER=${DB_USER || '<unset>'}`
  );
}

 export const pool = new Pool({
  host: DB_HOST || 'localhost',
  port: DB_PORT ? Number(DB_PORT) : 5432,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME || 'postgres',
});

