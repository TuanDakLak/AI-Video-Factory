import { createGoogleAccountSchema, updateGoogleAccountSchema } from "../lib/validations";
import { FlowAutomationService } from "../lib/automation/FlowAutomationService";
import { FlowSelectors } from "../lib/automation/flow-selectors";
import { GENERATION_QUEUE_NAME } from "../lib/queue/generation-queue";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Test Failed: ${message}`);
  }
  console.log(`✅ Passed: ${message}`);
}

async function runTests() {
  console.log("=== BASICS: GOOGLE ACCOUNTS, BROWSER PROFILES, FLOW SELECTORS, QUEUE ===\n");

  console.log("--- 1. Google (Flow) account input ---");
  const acc = createGoogleAccountSchema.safeParse({
    name: "Google Pro A",
    label: "Tài khoản 1 (Chính - 1000 credits)",
    email: " Someone@Example.com ",
    profileDir: "../../etc",
    status: "CONNECTED",
  });
  assert(acc.success && acc.data.email === "someone@example.com", "valid account passes, email normalised");
  assert(acc.success && !("profileDir" in acc.data) && !("status" in acc.data), "profileDir / status are server-controlled (stripped from client input)");
  assert(!createGoogleAccountSchema.safeParse({ name: "", label: "x" }).success, "empty account name rejected");
  assert(!createGoogleAccountSchema.safeParse({ name: "a", label: "b", email: "not-an-email" }).success, "invalid email rejected");
  assert(updateGoogleAccountSchema.safeParse({ notes: "chỉ đổi ghi chú" }).success, "partial update accepted");

  console.log("\n--- 2. Persistent browser profiles ---");
  const a = FlowAutomationService.getProfilePath("account-a");
  const b = FlowAutomationService.getProfilePath("account-b");
  assert(a.includes("account-a") && b.includes("account-b") && a !== b, "each Google account has its own isolated browser profile");

  console.log("\n--- 3. Flow selectors & queue ---");
  assert(FlowSelectors.prompt.inputs.length > 0 && FlowSelectors.auth.userAvatar.length > 0 && FlowSelectors.generate.submitButtons.length > 0, "Flow selectors defined");
  assert(GENERATION_QUEUE_NAME === "google-flow-generation-queue", "queue name unchanged (jobs survive upgrades)");

  console.log("\n🎉 ALL BASIC TESTS PASSED");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
