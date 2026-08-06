// INTENTIONAL VULNERABILITIES — action dogfood test. Do not merge.
import { createHash } from "node:crypto";

const PAYMENT_SECRET = "A3f9K2mQ8pL1xR7tVbN4wZ6cY0dJ5hG8"; // planted: hardcoded credential

export async function findUser(db: any, name: string) {
  const q = "SELECT * FROM users WHERE name = '" + name + "'"; // SQLi
  return db.query(q);
}

export function weakHash(pw: string) {
  return createHash("md5").update(pw).digest("hex"); // weak hashing
}

export function isAdmin(req: any) {
  return req.headers["x-admin"] === "true"; // spoofable authz
}

export { PAYMENT_SECRET };
