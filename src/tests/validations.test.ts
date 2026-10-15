import {
  createProjectSchema,
  createContentSchema,
  createGenerationSchema,
  createGoogleAccountSchema,
  aiGenerateContentInputSchema,
  aiGeneratedContentOutputSchema,
  ContentTypeEnum,
  GenerationStatusEnum,
  VideoAssetStatusEnum,
  GoogleAccountStatusEnum,
  AccountLockStatusEnum,
} from "../lib/validations";
import { MockAIProvider } from "../lib/ai/MockAIProvider";
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
  console.log("=== RUNNING AI CONTENT FACTORY PHASE 3 TESTS ===\n");

  // 1. Project Creation Validation
  console.log("--- 1. Project Creation Validation ---");
  const validProject = createProjectSchema.safeParse({
    name: "Amazon Wildlife",
    description: "Documentary about wild animals",
    contentType: "SHORT_VIDEO",
    topic: "5 dangerous animals in the Amazon",
  });
  assert(validProject.success === true, "Valid project input should pass validation");

  const invalidProjectNoName = createProjectSchema.safeParse({
    name: "",
    topic: "Some topic",
  });
  assert(invalidProjectNoName.success === false, "Project with empty name should fail validation");

  // 2. Content Creation Validation
  console.log("\n--- 2. Content Creation Validation ---");
  const validContent = createContentSchema.safeParse({
    projectId: "proj_123",
    title: "5 Deep Ocean Creatures",
    concept: "Cinematic exploration of bioluminescent species",
    script: "Scene 1: Mariana Trench wide shot...",
    videoPrompt: "Cinematic close-up of a glowing anglerfish in deep ocean, 8k, 9:16",
    language: "vi",
    style: "Cinematic",
    duration: "8s",
    aspectRatio: "9:16",
    tags: ["ocean", "creatures", "veo3"],
  });
  assert(validContent.success === true, "Valid content input should pass validation");

  // 3. AI Structured Response Validation
  console.log("\n--- 3. AI Structured Output & Mock Provider Validation ---");
  const validAIOutput = aiGeneratedContentOutputSchema.safeParse({
    title: "Vũ Trụ Huyền Bí",
    concept: "Khám phá dải ngân hà",
    script: "Cảnh 1: Phi thuyền tiến vào lỗ đen",
    videoPrompt: "Cinematic spaceship entering a swirling black hole, 8k, 16:9",
    description: "Hành trình thám hiểm vũ trụ.",
    tags: ["space", "universe", "scifi"],
  });
  assert(validAIOutput.success === true, "Structured AI JSON output should pass validation");

  const mockAI = new MockAIProvider();
  const mockResult = await mockAI.generateContent({
    topic: "Rừng mưa Amazon",
    contentType: "SHORT_VIDEO",
    language: "vi",
    style: "Cinematic",
    targetDuration: "8s",
    aspectRatio: "9:16",
  });
  assert(mockResult.videoPrompt.length > 10, "Mock AI should generate valid video prompt");

  // 4. Generation Creation with Phase 3 Model & Method
  console.log("\n--- 4. Generation Creation Validation (Phase 3) ---");
  const validGeneration = createGenerationSchema.safeParse({
    projectId: "proj_123",
    contentId: "content_456",
    googleAccountId: "acc_pro_a",
    prompt: "A cinematic close-up of a red fox walking through a snowy forest at sunrise, realistic natural lighting, slow camera movement.",
    model: "Veo 3.1 Fast",
    aspectRatio: "9:16",
    duration: "8s",
    generationMethod: "AUTO",
  });
  assert(validGeneration.success === true, "Valid generation with AUTO method should pass validation");

  // 5. Google Account Phase 3 Validation
  console.log("\n--- 5. Google Account Phase 3 Validation ---");
  const validAcc = createGoogleAccountSchema.safeParse({
    name: "Google Pro A",
    label: "Tài khoản 1 (Chính - 1000 credits)",
    profileDir: "account-a",
    status: "NOT_CONNECTED",
    notes: "Tài khoản chính",
  });
  assert(validAcc.success === true, "Valid Phase 3 Google Account schema should pass");

  // 6. Status Enums & State Machine Validation
  console.log("\n--- 6. Status Enums & Phase 3 State Machine ---");
  const phase3Statuses = [
    "DRAFT",
    "QUEUED",
    "STARTING_BROWSER",
    "CHECKING_ACCOUNT",
    "OPENING_FLOW",
    "SUBMITTING",
    "GENERATING",
    "DOWNLOADING",
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    "NEEDS_USER_ACTION",
    "CANCELLED",
  ];
  for (const st of phase3Statuses) {
    const parseRes = GenerationStatusEnum.safeParse(st);
    assert(parseRes.success === true, `Generation status "${st}" should be valid`);
  }

  const accountStatuses = [
    "NOT_CONNECTED",
    "CONNECTING",
    "CONNECTED",
    "EXPIRED",
    "ERROR",
    "DISABLED",
  ];
  for (const st of accountStatuses) {
    const parseRes = GoogleAccountStatusEnum.safeParse(st);
    assert(parseRes.success === true, `GoogleAccount status "${st}" should be valid`);
  }

  const lockStatuses = ["AVAILABLE", "IN_USE", "DISABLED"];
  for (const st of lockStatuses) {
    const parseRes = AccountLockStatusEnum.safeParse(st);
    assert(parseRes.success === true, `AccountLockStatus "${st}" should be valid`);
  }

  // 7. Persistent Profile Directory Resolution Test
  console.log("\n--- 7. FlowAutomationService Profile Resolution ---");
  const profilePathA = FlowAutomationService.getProfilePath("account-a");
  const profilePathB = FlowAutomationService.getProfilePath("account-b");
  assert(profilePathA.includes("account-a"), "Profile A path must contain account-a");
  assert(profilePathB.includes("account-b"), "Profile B path must contain account-b");
  assert(profilePathA !== profilePathB, "Account A and Account B profile paths must be strictly isolated");

  // 8. Resilient Flow Selectors Validation
  console.log("\n--- 8. Resilient Flow Selectors Validation ---");
  assert(FlowSelectors.prompt.inputs.length > 0, "FlowSelectors must define prompt input selectors");
  assert(FlowSelectors.auth.userAvatar.length > 0, "FlowSelectors must define auth selectors");
  assert(FlowSelectors.generate.submitButtons.length > 0, "FlowSelectors must define generate button selectors");
  assert(FlowSelectors.generationStatus.completedVideo.length > 0, "FlowSelectors must define video output selectors");

  // 9. BullMQ Queue Configuration Check
  console.log("\n--- 9. BullMQ Queue Name & Config Check ---");
  assert(GENERATION_QUEUE_NAME === "google-flow-generation-queue", "Queue name must match standard");

  console.log("\n🎉 ALL PHASE 3 AUTOMATION & VALIDATION TESTS PASSED SUCCESSFULLY!");
}

// importing the queue module opens a Redis connection that never closes: exit explicitly so CI does not hang
runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
