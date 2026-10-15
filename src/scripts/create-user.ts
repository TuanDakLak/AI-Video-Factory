import { prisma } from "../lib/db";
import { registerSchema, registerUser } from "../lib/auth/users";

/**
 * Create an account from the command line (works while public sign-up is closed). The password is read from the
 * USER_PASSWORD environment variable so it never appears in the shell history or the process list.
 * Usage:  USER_PASSWORD='...' npx tsx src/scripts/create-user.ts <email> "<name>"
 */
async function run() {
  const [email, name] = process.argv.slice(2);
  const parsed = registerSchema.safeParse({ email, name: name || email?.split("@")[0], password: process.env.USER_PASSWORD || "" });
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message || "Invalid input");
  const user = await registerUser(parsed.data, { force: true });
  console.log(`Created ${user.role} ${user.email} (${user.id})${user.isFirst ? " — first account: owns all existing data" : ""}`);
}
run()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().then(() => process.exit()));
