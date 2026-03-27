import pool from "../config/db.js";

export const findUserByEmail = async (email) => {
  const result = await pool.query(
    `
    SELECT id, email, password, role
    FROM users
    WHERE email = $1
    `,
    [email]
  );

  return result.rows[0]; // password will now exist
};
