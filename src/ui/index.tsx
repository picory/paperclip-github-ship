import {
  usePluginAction,
  usePluginData,
  type PluginDetailTabProps,
  type PluginSettingsPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import React, { useState } from "react";

type GithubShipStatus = {
  configured: boolean;
  repo: string | null;
  baseBranch: string | null;
  deployBranch: string | null;
  workflowPath: string;
  tokenConfigured: boolean;
  availableActions: string[];
};

type WorkflowPreview = {
  workflowPath: string;
  requiredSecrets: string[];
  content: string;
};

const panelStyle = {
  display: "grid",
  gap: 10,
  fontSize: 13,
  lineHeight: 1.45,
} satisfies React.CSSProperties;

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
} satisfies React.CSSProperties;

const buttonStyle = {
  border: "1px solid #1f2937",
  background: "#111827",
  color: "#fff",
  borderRadius: 6,
  padding: "6px 10px",
  font: "inherit",
  cursor: "pointer",
} satisfies React.CSSProperties;

const codeStyle = {
  whiteSpace: "pre-wrap",
  fontSize: 12,
  background: "#0b1220",
  color: "#dbeafe",
  padding: 12,
  borderRadius: 8,
  overflowX: "auto",
} satisfies React.CSSProperties;

function StatusRows({ data }: { data: GithubShipStatus }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={rowStyle}><span>Configured</span><strong>{data.configured ? "yes" : "no"}</strong></div>
      <div style={rowStyle}><span>Repo</span><code>{data.repo ?? "not set"}</code></div>
      <div style={rowStyle}><span>Base</span><code>{data.baseBranch ?? "not set"}</code></div>
      <div style={rowStyle}><span>Deploy</span><code>{data.deployBranch ?? "not set"}</code></div>
      <div style={rowStyle}><span>Token</span><strong>{data.tokenConfigured ? "configured" : "missing"}</strong></div>
    </div>
  );
}

export function DashboardWidget({ context }: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<GithubShipStatus>("github-ship-status", {
    companyId: context.companyId,
  });

  if (loading) return <div>Loading GitHub Ship status...</div>;
  if (error) return <div>GitHub Ship error: {error.message}</div>;
  if (!data) return null;

  return (
    <div style={panelStyle}>
      <strong>GitHub Ship</strong>
      <StatusRows data={data} />
      <div>Actions: {data.availableActions.join(", ")}</div>
    </div>
  );
}

export function IssuePanel({ context }: PluginDetailTabProps) {
  const { data, loading, error } = usePluginData<GithubShipStatus>("github-ship-status", {
    companyId: context.companyId,
  });
  const previewWorkflow = usePluginAction("preview-deploy-workflow");
  const [preview, setPreview] = useState<WorkflowPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  if (loading) return <div>Loading GitHub Ship issue panel...</div>;
  if (error) return <div>GitHub Ship error: {error.message}</div>;
  if (!data) return null;

  return (
    <div style={panelStyle}>
      <div style={rowStyle}>
        <strong>GitHub Ship</strong>
        <button
          style={buttonStyle}
          onClick={async () => {
            setPreviewError(null);
            try {
              const result = await previewWorkflow({ companyId: context.companyId });
              setPreview(result as WorkflowPreview);
            } catch (err) {
              setPreviewError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          Preview Deploy Workflow
        </button>
      </div>
      <StatusRows data={data} />
      <div>Suggested issue branch: <code>issue/{context.entityId}</code></div>
      {previewError ? <div>Preview failed: {previewError}</div> : null}
      {preview ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div>Workflow path: <code>{preview.workflowPath}</code></div>
          <div>Required secrets: <code>{preview.requiredSecrets.join(", ")}</code></div>
          <pre style={codeStyle}>{preview.content}</pre>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsPage({ context }: PluginSettingsPageProps) {
  const { data, loading, error } = usePluginData<GithubShipStatus>("github-ship-status", {
    companyId: context.companyId,
  });

  if (loading) return <div>Loading GitHub Ship settings...</div>;
  if (error) return <div>GitHub Ship settings error: {error.message}</div>;
  if (!data) return null;

  return (
    <div style={panelStyle}>
      <strong>GitHub Ship Settings</strong>
      <StatusRows data={data} />
      <div>Use the plugin actions to save repo config, preview workflows, create PRs, and merge PRs.</div>
      <div>Default workflow path: <code>{data.workflowPath}</code></div>
    </div>
  );
}
