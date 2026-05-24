import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin, { buildDeployWorkflow, normalizeConfig } from "../src/worker.js";

describe("plugin-github-ship", () => {
  it("declares the capabilities needed for GitHub API and state-backed config", () => {
    expect(manifest.capabilities).toContain("plugin.state.read");
    expect(manifest.capabilities).toContain("plugin.state.write");
    expect(manifest.capabilities).toContain("http.outbound");
    expect(manifest.capabilities).toContain("secrets.read-ref");
  });

  it("builds a deploy workflow with configurable branch and secrets", () => {
    const config = normalizeConfig({
      owner: "acme",
      repo: "platform",
      deployBranch: "release",
      deployHostSecretName: "HOST",
      deployUserSecretName: "USER",
      deployKeySecretName: "SSH_KEY",
      deployPathSecretName: "PATH_SECRET",
      deployScriptSecretName: "DEPLOY_CMD",
    });
    const workflow = buildDeployWorkflow(config);
    expect(workflow).toContain("name: Deploy");
    expect(workflow).toContain("- release");
    expect(workflow).toContain("${{ secrets.HOST }}");
    expect(workflow).toContain("${{ secrets.DEPLOY_CMD }}".replace("DEPLOY_CMD", "DEPLOY_CMD"));
  });

  it("stores repo config and previews the workflow", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const saved = await harness.performAction<{
      configured: boolean;
      repo: string;
      tokenConfigured: boolean;
    }>("save-repo-config", {
      companyId: "company-1",
      owner: "acme",
      repo: "platform",
      tokenRef: "secret_ref",
    });

    expect(saved.configured).toBe(true);
    expect(saved.repo).toBe("acme/platform");
    expect(saved.tokenConfigured).toBe(true);

    const preview = await harness.performAction<{
      workflowPath: string;
      requiredSecrets: string[];
      content: string;
    }>("preview-deploy-workflow", {
      companyId: "company-1",
    });

    expect(preview.workflowPath).toBe(".github/workflows/deploy.yml");
    expect(preview.requiredSecrets).toContain("DEPLOY_HOST");
    expect(preview.content).toContain("appleboy/ssh-action");
  });

  it("returns dry-run payloads for PR creation and merge by default", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    await harness.performAction("save-repo-config", {
      companyId: "company-1",
      owner: "acme",
      repo: "platform",
      tokenRef: "secret_ref",
    });

    const createPayload = await harness.performAction<{
      execute: boolean;
      path: string;
      body: { head: string; base: string };
    }>("create-pr", {
      companyId: "company-1",
      title: "Add deploy workflow",
      head: "feature/deploy-workflow",
    });

    expect(createPayload.execute).toBe(false);
    expect(createPayload.path).toBe("/repos/acme/platform/pulls");
    expect(createPayload.body.head).toBe("feature/deploy-workflow");
    expect(createPayload.body.base).toBe("main");

    const mergePayload = await harness.performAction<{
      execute: boolean;
      path: string;
      body: { merge_method: string };
    }>("merge-pr", {
      companyId: "company-1",
      prNumber: 42,
    });

    expect(mergePayload.execute).toBe(false);
    expect(mergePayload.path).toBe("/repos/acme/platform/pulls/42/merge");
    expect(mergePayload.body.merge_method).toBe("squash");
  });
});
