const PASSWORD_PLACEHOLDERS = [
  "[YOUR-PASSWORD]",
  "[YOUR_PASSWORD]",
  "YOUR-PASSWORD",
  "__PASSWORD__",
];

/**
 * Resolves the Postgres connection string.
 *
 * Prefers SUPABASE_DATABASE_URL, falling back to DATABASE_URL. To avoid the
 * common failure of mangling a hand-edited URI (dropped `@`, unescaped special
 * characters in the password), callers may paste the Supabase URI verbatim with
 * its `[YOUR-PASSWORD]` placeholder and supply the password separately via
 * SUPABASE_DB_PASSWORD — it is URL-encoded and substituted in here.
 */
export function getConnectionString(): string {
  const raw = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!raw) {
    throw new Error(
      "No database connection string set. Provide SUPABASE_DATABASE_URL (or DATABASE_URL).",
    );
  }

  const password = process.env.SUPABASE_DB_PASSWORD;
  const placeholder = PASSWORD_PLACEHOLDERS.find((p) => raw.includes(p));

  if (placeholder) {
    if (!password) {
      throw new Error(
        `SUPABASE_DATABASE_URL still contains the ${placeholder} placeholder but SUPABASE_DB_PASSWORD is not set.`,
      );
    }
    return raw.replace(placeholder, encodeURIComponent(password));
  }

  return raw;
}
