/** Netlify uses its managed Postgres database for all tracker data. */
export async function openEmbeddedDatabase(): Promise<never> {
  throw new Error("A persistent Postgres database is required on Netlify.");
}
