import { getSessionUser } from "./session";

export async function requireSession() {
  const session = await getSessionUser();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
