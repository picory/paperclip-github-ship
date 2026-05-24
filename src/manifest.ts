import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "picory.paperclip-github-ship";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "GitHub Ship",
  description: "Preview deploy workflows and drive PR create/merge flows through GitHub.",
  author: "picory",
  categories: ["connector", "ui", "automation"],
  capabilities: [
    "plugin.state.read",
    "plugin.state.write",
    "http.outbound",
    "secrets.read-ref",
    "activity.log.write",
    "ui.dashboardWidget.register",
    "ui.detailTab.register",
    "instance.settings.register"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "github-ship-widget",
        displayName: "GitHub Ship",
        exportName: "DashboardWidget"
      },
      {
        type: "taskDetailView",
        id: "github-ship-issue-panel",
        displayName: "GitHub Ship",
        exportName: "IssuePanel",
        entityTypes: ["issue"]
      },
      {
        type: "settingsPage",
        id: "github-ship-settings",
        displayName: "GitHub Ship",
        exportName: "SettingsPage"
      }
    ]
  }
};

export default manifest;
