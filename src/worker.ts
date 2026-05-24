import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID } from "./manifest.js";

const CONFIG_NAMESPACE = "github-ship";
const CONFIG_STATE_KEY = "repo-config";
const DEFAULT_WORKFLOW_PATH = ".github/workflows/deploy.yml";
const GITHUB_API_BASE = "https://api.github.com";

export type GithubShipConfig = {
  owner: string;
  repo: string;
  baseBranch: string;
  deployBranch: string;
  tokenRef: string | null;
  workflowName: string;
  workflowPath: string;
  nodeVersion: string;
  environmentName: string;
  deployHostSecretName: string;
  deployUserSecretName: string;
  deployKeySecretName: string;
  deployPathSecretName: string;
  deployScriptSecretName: string;
};

type PullRequestActionInput = {
  companyId: string;
  title: string;
  head: string;
  body?: string | null;
  base?: string | null;
  draft?: boolean;
  owner?: string | null;
  repo?: string | null;
  tokenRef?: string | null;
  execute?: boolean;
};

type MergePullRequestActionInput = {
  companyId: string;
  prNumber: number;
  mergeMethod?: "merge" | "squash" | "rebase";
  commitTitle?: string | null;
  commitMessage?: string | null;
  owner?: string | null;
  repo?: string | null;
  tokenRef?: string | null;
  execute?: boolean;
};

type WorkflowPreviewInput = {
  companyId: string;
  deployBranch?: string | null;
  workflowPath?: string | null;
};

type GithubShipStatus = {
  configured: boolean;
  repo: string | null;
  baseBranch: string | null;
  deployBranch: string | null;
  workflowPath: string;
  tokenConfigured: boolean;
  availableActions: string[];
};

function asNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function configStateKey(companyId: string) {
  return {
    scopeKind: "company" as const,
    scopeId: companyId,
    namespace: CONFIG_NAMESPACE,
    stateKey: CONFIG_STATE_KEY,
  };
}

export function normalizeConfig(input: Record<string, unknown>): GithubShipConfig {
  return {
    owner: asNonEmptyString(input.owner),
    repo: asNonEmptyString(input.repo),
    baseBranch: asNonEmptyString(input.baseBranch, "main"),
    deployBranch: asNonEmptyString(input.deployBranch, "main"),
    tokenRef: asOptionalString(input.tokenRef),
    workflowName: asNonEmptyString(input.workflowName, "Deploy"),
    workflowPath: asNonEmptyString(input.workflowPath, DEFAULT_WORKFLOW_PATH),
    nodeVersion: asNonEmptyString(input.nodeVersion, "20"),
    environmentName: asNonEmptyString(input.environmentName, "production"),
    deployHostSecretName: asNonEmptyString(input.deployHostSecretName, "DEPLOY_HOST"),
    deployUserSecretName: asNonEmptyString(input.deployUserSecretName, "DEPLOY_USER"),
    deployKeySecretName: asNonEmptyString(input.deployKeySecretName, "DEPLOY_SSH_KEY"),
    deployPathSecretName: asNonEmptyString(input.deployPathSecretName, "DEPLOY_PATH"),
    deployScriptSecretName: asNonEmptyString(input.deployScriptSecretName, "DEPLOY_SCRIPT"),
  };
}

function requireRepoConfig(config: GithubShipConfig | null): GithubShipConfig {
  if (!config || !config.owner || !config.repo) {
    throw new Error("GitHub repository is not configured for this company.");
  }
  return config;
}

function sanitizeConfig(config: GithubShipConfig | null): GithubShipStatus {
  return {
    configured: Boolean(config?.owner && config?.repo),
    repo: config?.owner && config?.repo ? `${config.owner}/${config.repo}` : null,
    baseBranch: config?.baseBranch ?? null,
    deployBranch: config?.deployBranch ?? null,
    workflowPath: config?.workflowPath ?? DEFAULT_WORKFLOW_PATH,
    tokenConfigured: Boolean(config?.tokenRef),
    availableActions: ["save-repo-config", "preview-deploy-workflow", "create-pr", "merge-pr"],
  };
}

async function getConfig(ctx: PluginContext, companyId: string) {
  const raw = await ctx.state.get(configStateKey(companyId));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return normalizeConfig(raw as Record<string, unknown>);
}

export function buildDeployWorkflow(config: GithubShipConfig, overrides?: { deployBranch?: string | null }) {
  const deployBranch = asOptionalString(overrides?.deployBranch) ?? config.deployBranch;
  return [
    `name: ${config.workflowName}`,
    "",
    "on:",
    "  workflow_dispatch:",
    "  push:",
    "    branches:",
    `      - ${deployBranch}`,
    "",
    "jobs:",
    "  deploy:",
    `    runs-on: ubuntu-latest`,
    `    environment: ${config.environmentName}`,
    "    steps:",
    "      - name: Checkout",
    "        uses: actions/checkout@v4",
    "      - name: Setup pnpm",
    "        uses: pnpm/action-setup@v4",
    "        with:",
    "          version: 9",
    "      - name: Setup Node.js",
    "        uses: actions/setup-node@v4",
    "        with:",
    `          node-version: '${config.nodeVersion}'`,
    "          cache: pnpm",
    "      - name: Install",
    "        run: pnpm install --frozen-lockfile",
    "      - name: Build",
    "        run: pnpm build",
    "      - name: Configure SSH key",
    "        run: |",
    "          mkdir -p ~/.ssh",
    `          printf '%s' \"\${{ secrets.${config.deployKeySecretName} }}\" > ~/.ssh/id_ed25519`,
    "          chmod 600 ~/.ssh/id_ed25519",
    "      - name: Deploy over SSH",
    "        uses: appleboy/ssh-action@v1.0.3",
    "        with:",
    `          host: \${{ secrets.${config.deployHostSecretName} }}`,
    `          username: \${{ secrets.${config.deployUserSecretName} }}`,
    "          key_path: ~/.ssh/id_ed25519",
    "          script_stop: true",
    "          script: |",
    `            cd \${{ secrets.${config.deployPathSecretName} }}`,
    "            git fetch --all --prune",
    `            git checkout ${deployBranch}`,
    `            git pull --ff-only origin ${deployBranch}`,
    `            \${{ secrets.${config.deployScriptSecretName} }}`,
  ].join("\n");
}

function buildGithubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function githubRequest(
  ctx: PluginContext,
  input: {
    method: "POST" | "PUT";
    path: string;
    tokenRef: string;
    body: Record<string, unknown>;
  },
) {
  const token = await ctx.secrets.resolve(input.tokenRef);
  const response = await ctx.http.fetch(`${GITHUB_API_BASE}${input.path}`, {
    method: input.method,
    headers: buildGithubHeaders(token),
    body: JSON.stringify(input.body),
  });
  const rawBody = await response.text();
  let parsedBody: unknown = null;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsedBody = rawBody;
  }
  if (!response.ok) {
    throw new Error(`GitHub API ${input.method} ${input.path} failed: ${response.status} ${response.statusText}`);
  }
  return parsedBody;
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("github-ship-status", async (params) => {
      const companyId = asNonEmptyString(params.companyId);
      const config = companyId ? await getConfig(ctx, companyId) : null;
      return sanitizeConfig(config);
    });

    ctx.actions.register("save-repo-config", async (params) => {
      const companyId = asNonEmptyString(params.companyId);
      if (!companyId) throw new Error("companyId is required");
      const nextConfig = normalizeConfig(params);
      if (!nextConfig.owner || !nextConfig.repo) {
        throw new Error("owner and repo are required");
      }
      await ctx.state.set(configStateKey(companyId), nextConfig);
      await ctx.activity.log({
        companyId,
        entityType: "company",
        entityId: companyId,
        message: `Configured GitHub repo ${nextConfig.owner}/${nextConfig.repo} for GitHub Ship`,
        metadata: { plugin: PLUGIN_ID, repo: `${nextConfig.owner}/${nextConfig.repo}` },
      });
      return sanitizeConfig(nextConfig);
    });

    ctx.actions.register("preview-deploy-workflow", async (params) => {
      const companyId = asNonEmptyString(params.companyId);
      if (!companyId) throw new Error("companyId is required");
      const config = requireRepoConfig(await getConfig(ctx, companyId));
      const workflowPath = asOptionalString(params.workflowPath) ?? config.workflowPath;
      return {
        workflowPath,
        requiredSecrets: [
          config.deployHostSecretName,
          config.deployUserSecretName,
          config.deployKeySecretName,
          config.deployPathSecretName,
          config.deployScriptSecretName,
        ],
        content: buildDeployWorkflow(config, {
          deployBranch: asOptionalString(params.deployBranch),
        }),
      };
    });

    ctx.actions.register("create-pr", async (params) => {
      const companyId = asNonEmptyString(params.companyId);
      if (!companyId) throw new Error("companyId is required");
      const config = requireRepoConfig(await getConfig(ctx, companyId));
      const title = asNonEmptyString(params.title);
      const head = asNonEmptyString(params.head);
      if (!title || !head) {
        throw new Error("title and head are required");
      }

      const owner = asOptionalString(params.owner) ?? config.owner;
      const repo = asOptionalString(params.repo) ?? config.repo;
      const tokenRef = asOptionalString(params.tokenRef) ?? config.tokenRef;
      const body = {
        title,
        head,
        base: asOptionalString(params.base) ?? config.baseBranch,
        body: asOptionalString(params.body),
        draft: asBoolean(params.draft, false),
      };
      const path = `/repos/${owner}/${repo}/pulls`;

      if (!asBoolean(params.execute, false)) {
        return {
          execute: false,
          method: "POST",
          path,
          body,
        };
      }
      if (!tokenRef) {
        throw new Error("A GitHub token secret ref is required to execute create-pr.");
      }

      const result = await githubRequest(ctx, { method: "POST", path, tokenRef, body });
      await ctx.activity.log({
        companyId,
        entityType: "company",
        entityId: companyId,
        message: `Created PR in ${owner}/${repo}`,
        metadata: { plugin: PLUGIN_ID, owner, repo, head, base: body.base },
      });
      return result;
    });

    ctx.actions.register("merge-pr", async (params) => {
      const companyId = asNonEmptyString(params.companyId);
      if (!companyId) throw new Error("companyId is required");
      const config = requireRepoConfig(await getConfig(ctx, companyId));
      const prNumber = asNumber(params.prNumber);
      if (!prNumber) {
        throw new Error("prNumber is required");
      }

      const owner = asOptionalString(params.owner) ?? config.owner;
      const repo = asOptionalString(params.repo) ?? config.repo;
      const tokenRef = asOptionalString(params.tokenRef) ?? config.tokenRef;
      const body = {
        merge_method: asOptionalString(params.mergeMethod) ?? "squash",
        commit_title: asOptionalString(params.commitTitle),
        commit_message: asOptionalString(params.commitMessage),
      };
      const path = `/repos/${owner}/${repo}/pulls/${prNumber}/merge`;

      if (!asBoolean(params.execute, false)) {
        return {
          execute: false,
          method: "PUT",
          path,
          body,
        };
      }
      if (!tokenRef) {
        throw new Error("A GitHub token secret ref is required to execute merge-pr.");
      }

      const result = await githubRequest(ctx, { method: "PUT", path, tokenRef, body });
      await ctx.activity.log({
        companyId,
        entityType: "company",
        entityId: companyId,
        message: `Merged PR #${prNumber} in ${owner}/${repo}`,
        metadata: { plugin: PLUGIN_ID, owner, repo, prNumber, mergeMethod: body.merge_method },
      });
      return result;
    });
  },

  async onHealth() {
    return {
      status: "ok",
      message: "GitHub Ship plugin worker is running",
      details: {
        pluginId: PLUGIN_ID,
        actions: ["save-repo-config", "preview-deploy-workflow", "create-pr", "merge-pr"],
      },
    };
  }
});

export default plugin;
runWorker(plugin, import.meta.url);
