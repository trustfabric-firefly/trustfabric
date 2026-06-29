import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(resolve(__dirname, "../firestore.rules"), "utf8");

const PROJECT_ID = "trustfabric-rules-test";

let testEnv;

async function setup() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
}

async function teardown() {
  await testEnv?.cleanup();
}

async function seedMember(orgId, userId, role) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("organization_members").doc(`${orgId}_${userId}`).set({
      organization_id: orgId,
      user_id: userId,
      role,
      joined_at: new Date().toISOString(),
    });
  });
}

async function run(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function main() {
  await setup();

  await run("denies unauthenticated reads of systems", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection("systems").doc("1").get());
  });

  await run("denies cross-org system read", async () => {
    await seedMember("org-a", "user-a", "viewer");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("systems").doc("1").set({
        organization_id: "org-b",
        name: "Other org system",
      });
    });
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertFails(db.collection("systems").doc("1").get());
  });

  await run("allows org member to read own system", async () => {
    await seedMember("org-a", "user-a", "viewer");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("systems").doc("2").set({
        organization_id: "org-a",
        name: "My system",
      });
    });
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertSucceeds(db.collection("systems").doc("2").get());
  });

  await run("denies client access to integration secrets", async () => {
    await seedMember("org-a", "user-a", "owner");
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertFails(db.collection("organization_integrations").doc("org-a").get());
    await assertFails(
      db.collection("organization_integrations").doc("org-a").set({ github_access_token: "secret" })
    );
  });

  await run("denies viewer from reading llm logs", async () => {
    await seedMember("org-a", "user-a", "viewer");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("llm_logs").doc("1").set({
        organization_id: "org-a",
        prompt: "test",
      });
    });
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertFails(db.collection("llm_logs").doc("1").get());
  });

  await run("allows security admin to read llm logs", async () => {
    await seedMember("org-a", "admin-a", "security_admin");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("llm_logs").doc("2").set({
        organization_id: "org-a",
        prompt: "test",
      });
    });
    const db = testEnv.authenticatedContext("admin-a").firestore();
    await assertSucceeds(db.collection("llm_logs").doc("2").get());
  });

  await teardown();
  console.log("\nAll Firestore rules tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
