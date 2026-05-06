import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  DatabaseBackup,
  DownloadCloud,
  Folder,
  HardDrive,
  History,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  TimerReset,
  XCircle
} from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { apiRequest } from "../lib/api";
import { useToast } from "../ui/ToastProvider";

type BackupFrequency = "MANUAL" | "DAILY" | "WEEKLY" | "MONTHLY";
type BackupTarget = "LOCAL" | "GOOGLE_DRIVE";
type BackupStatus = "SUCCESS" | "FAILED" | "RUNNING";

type BackupSetting = {
  id: string;
  frequency: BackupFrequency;
  localBackupEnabled: boolean;
  localBackupPath: string;
  googleDriveEnabled: boolean;
  googleAccountEmail: string | null;
  googleDriveFolderId: string | null;
  googleDriveConnectedAt?: string | null;
  isGoogleDriveConnected?: boolean;
  lastBackupAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type BackupHistoryItem = {
  id: string;
  target: BackupTarget;
  status: BackupStatus;
  fileName: string | null;
  filePath: string | null;
  googleDriveFileId: string | null;
  googleAccountEmail: string | null;
  sizeBytes: number | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

const initialBackupForm = {
  frequency: "MANUAL" as BackupFrequency,
  localBackupEnabled: true,
  localBackupPath: "./backups",
  googleDriveEnabled: false,
  googleAccountEmail: "",
  googleDriveFolderId: ""
};

const frequencyOptions: Array<{
  value: BackupFrequency;
  label: string;
  description: string;
}> = [
  {
    value: "MANUAL",
    label: "Manual",
    description: "Run backups only when user clicks Run Backup."
  },
  {
    value: "DAILY",
    label: "Daily",
    description: "Prepare system for automatic daily backup."
  },
  {
    value: "WEEKLY",
    label: "Weekly",
    description: "Prepare system for automatic weekly backup."
  },
  {
    value: "MONTHLY",
    label: "Monthly",
    description: "Prepare system for automatic monthly backup."
  }
];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-LK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatFileSize(value: number | null | undefined) {
  const bytes = Number(value || 0);

  if (bytes <= 0) return "—";

  const kb = bytes / 1024;
  const mb = kb / 1024;
  const gb = mb / 1024;

  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  if (kb >= 1) return `${kb.toFixed(2)} KB`;

  return `${bytes} B`;
}

function formatFrequency(value: BackupFrequency) {
  return frequencyOptions.find((option) => option.value === value)?.label || value;
}

function formatTarget(value: BackupTarget) {
  if (value === "GOOGLE_DRIVE") return "Google Drive";
  return "Local";
}

export function SettingsPage() {
  const toast = useToast();

  const [backupSetting, setBackupSetting] = useState<BackupSetting | null>(null);
  const [backupForm, setBackupForm] = useState(initialBackupForm);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isRunningBackup, setIsRunningBackup] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isDisconnectingDrive, setIsDisconnectingDrive] = useState(false);
  const [error, setError] = useState("");

  const latestBackup = history[0];

  const historyStats = useMemo(() => {
    return {
      total: history.length,
      success: history.filter((item) => item.status === "SUCCESS").length,
      failed: history.filter((item) => item.status === "FAILED").length,
      local: history.filter((item) => item.target === "LOCAL").length,
      drive: history.filter((item) => item.target === "GOOGLE_DRIVE").length,
      totalSize: history.reduce(
        (sum, item) => sum + Number(item.sizeBytes || 0),
        0
      )
    };
  }, [history]);

  async function loadSettings(showToast = false) {
    setIsLoading(true);
    setError("");

    try {
      const [settingsData, historyData] = await Promise.all([
        apiRequest<{ backupSetting: BackupSetting }>("/settings/backup"),
        apiRequest<{ history: BackupHistoryItem[] }>("/settings/backups/history")
      ]);

      setBackupSetting(settingsData.backupSetting);

      setBackupForm({
        frequency: settingsData.backupSetting.frequency,
        localBackupEnabled: settingsData.backupSetting.localBackupEnabled,
        localBackupPath: settingsData.backupSetting.localBackupPath,
        googleDriveEnabled: settingsData.backupSetting.googleDriveEnabled,
        googleAccountEmail: settingsData.backupSetting.googleAccountEmail || "",
        googleDriveFolderId: settingsData.backupSetting.googleDriveFolderId || ""
      });

      setHistory(historyData.history);

      if (showToast) {
        toast.success("Settings refreshed");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load settings";
      setError(message);
      toast.error("Failed to load settings", message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function handleSaveBackupSettings(event: FormEvent) {
    event.preventDefault();

    setIsSavingSettings(true);
    setError("");

    try {
      const data = await apiRequest<{ backupSetting: BackupSetting }>(
        "/settings/backup",
        {
          method: "PUT",
          body: JSON.stringify({
            frequency: backupForm.frequency,
            localBackupEnabled: backupForm.localBackupEnabled,
            localBackupPath: backupForm.localBackupPath,
            googleDriveEnabled: backupForm.googleDriveEnabled,
            googleAccountEmail: backupForm.googleAccountEmail.trim() || null,
            googleDriveFolderId: backupForm.googleDriveFolderId.trim() || null
          })
        }
      );

      setBackupSetting(data.backupSetting);

      toast.success("Backup settings saved");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save backup settings";
      setError(message);
      toast.error("Save failed", message);
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleConnectGoogleDrive() {
    setIsConnectingDrive(true);
    setError("");

    try {
      if (!backupForm.googleDriveEnabled) {
        toast.info(
          "Enable Google Drive Backup",
          "Turn on Google Drive Backup before connecting your Google account."
        );
        return;
      }

      const data = await apiRequest<{ authUrl: string }>(
        "/settings/google-drive/auth-url"
      );

      window.location.href = data.authUrl;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect Google Drive";
      setError(message);
      toast.error("Google Drive connection failed", message);
    } finally {
      setIsConnectingDrive(false);
    }
  }

  async function handleDisconnectGoogleDrive() {
    setIsDisconnectingDrive(true);
    setError("");

    try {
      await apiRequest("/settings/google-drive/disconnect", {
        method: "POST"
      });

      toast.success("Google Drive disconnected");
      await loadSettings();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disconnect Google Drive";
      setError(message);
      toast.error("Disconnect failed", message);
    } finally {
      setIsDisconnectingDrive(false);
    }
  }

  async function handleRunBackupNow() {
    setIsRunningBackup(true);
    setError("");

    try {
      const data = await apiRequest<{
        message: string;
        backup?: BackupHistoryItem | null;
        localBackup?: BackupHistoryItem | null;
        driveBackup?: BackupHistoryItem | null;
      }>("/settings/backups/run", {
        method: "POST"
      });

      const completedBackup = data.driveBackup || data.localBackup || data.backup;

      toast.success(
        "Backup completed",
        completedBackup?.fileName || data.message
      );

      await loadSettings();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to run backup";
      setError(message);
      toast.error("Backup failed", message);

      await loadSettings();
    } finally {
      setIsRunningBackup(false);
    }
  }

  return (
    <AppLayout
      activeItem="Settings"
      title="Settings"
      subtitle="Manage PostgreSQL database backup settings, storage location and backup history."
      actions={
        <>
          <button
            onClick={() => loadSettings(true)}
            className="flex items-center gap-2 rounded-2xl border border-bauraBrown/10 bg-bauraSoft px-4 py-3 text-sm font-semibold shadow-sm"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={handleRunBackupNow}
            disabled={isRunningBackup || isLoading}
            className="flex items-center gap-2 rounded-2xl bg-bauraBrown px-5 py-3 text-sm font-bold text-bauraCream shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <DatabaseBackup size={16} />
            {isRunningBackup ? "Running Backup..." : "Run Backup Now"}
          </button>
        </>
      }
    >
      <div className="grid gap-5">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Backup Frequency"
            value={
              isLoading
                ? "Loading..."
                : backupSetting
                ? formatFrequency(backupSetting.frequency)
                : "—"
            }
            note="Configured backup schedule"
            icon={<TimerReset size={22} />}
          />

          <SummaryCard
            title="Last Backup"
            value={
              isLoading
                ? "Loading..."
                : backupSetting?.lastBackupAt
                ? formatDateTime(backupSetting.lastBackupAt)
                : "Not yet"
            }
            note="Most recent successful backup time"
            icon={<ShieldCheck size={22} />}
          />

          <SummaryCard
            title="Backup History"
            value={isLoading ? "Loading..." : String(historyStats.total)}
            note={`${historyStats.success} success · ${historyStats.failed} failed`}
            icon={<History size={22} />}
            alert={historyStats.failed > 0}
          />

          <SummaryCard
            title="Stored Backup Size"
            value={
              isLoading ? "Loading..." : formatFileSize(historyStats.totalSize)
            }
            note={`${historyStats.local} local · ${historyStats.drive} drive`}
            icon={<DownloadCloud size={22} />}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bauraGold">
                Backup Configuration
              </p>
              <h3 className="mt-1 text-xl font-bold">Backup Settings</h3>
              <p className="mt-1 text-sm text-bauraBrown/60">
                Configure local and Google Drive backup options for the
                PostgreSQL database only.
              </p>
            </div>

            <form onSubmit={handleSaveBackupSettings} className="grid gap-5">
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Backup Frequency
                </label>

                <select
                  value={backupForm.frequency}
                  onChange={(event) =>
                    setBackupForm((prev) => ({
                      ...prev,
                      frequency: event.target.value as BackupFrequency
                    }))
                  }
                  className="w-full rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-bauraGold"
                >
                  {frequencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <p className="mt-2 text-xs text-bauraBrown/50">
                  {
                    frequencyOptions.find(
                      (option) => option.value === backupForm.frequency
                    )?.description
                  }
                </p>
              </div>

              <div className="rounded-3xl border border-bauraBrown/10 bg-white/60 p-4">
                <ToggleRow
                  icon={<HardDrive size={20} />}
                  title="Local Backup"
                  description="Store PostgreSQL database dump files on this computer or local server."
                  checked={backupForm.localBackupEnabled}
                  onChange={(checked) =>
                    setBackupForm((prev) => ({
                      ...prev,
                      localBackupEnabled: checked
                    }))
                  }
                />

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold">
                    Local Backup Location
                  </label>

                  <div className="flex items-center gap-3 rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3">
                    <Folder size={17} className="shrink-0 text-bauraBrown/45" />
                    <input
                      value={backupForm.localBackupPath}
                      disabled={!backupForm.localBackupEnabled}
                      onChange={(event) =>
                        setBackupForm((prev) => ({
                          ...prev,
                          localBackupPath: event.target.value
                        }))
                      }
                      placeholder="./backups"
                      className="w-full bg-transparent text-sm font-semibold outline-none disabled:opacity-50"
                    />
                  </div>

                  <p className="mt-2 text-xs text-bauraBrown/50">
                    Example: <span className="font-semibold">./backups</span> or{" "}
                    <span className="font-semibold">D:/BauraBackups</span>
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-bauraBrown/10 bg-white/60 p-4">
                <ToggleRow
                  icon={<Cloud size={20} />}
                  title="Google Drive Backup"
                  description="Upload the PostgreSQL database dump file to Google Drive after OAuth connection."
                  checked={backupForm.googleDriveEnabled}
                  onChange={(checked) =>
                    setBackupForm((prev) => ({
                      ...prev,
                      googleDriveEnabled: checked
                    }))
                  }
                />

                <div className="mt-4 grid gap-3">
                  <Input
                    label="Google Account Email"
                    value={backupForm.googleAccountEmail}
                    disabled={!backupForm.googleDriveEnabled}
                    onChange={(value) =>
                      setBackupForm((prev) => ({
                        ...prev,
                        googleAccountEmail: value
                      }))
                    }
                    placeholder="example@gmail.com"
                    required={false}
                  />

                  <Input
                    label="Google Drive Folder ID"
                    value={backupForm.googleDriveFolderId}
                    disabled={!backupForm.googleDriveEnabled}
                    onChange={(value) =>
                      setBackupForm((prev) => ({
                        ...prev,
                        googleDriveFolderId: value
                      }))
                    }
                    placeholder="Drive folder id"
                    required={false}
                  />

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleConnectGoogleDrive}
                      disabled={
                        !backupForm.googleDriveEnabled ||
                        isConnectingDrive ||
                        isSavingSettings
                      }
                      className="flex items-center justify-center gap-2 rounded-2xl bg-bauraBrown px-5 py-3 text-sm font-bold text-bauraCream disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Cloud size={16} />
                      {isConnectingDrive
                        ? "Opening Google..."
                        : backupSetting?.isGoogleDriveConnected
                        ? "Reconnect Google Drive"
                        : "Connect Google Drive"}
                    </button>

                    {backupSetting?.isGoogleDriveConnected && (
                      <button
                        type="button"
                        onClick={handleDisconnectGoogleDrive}
                        disabled={isDisconnectingDrive}
                        className="rounded-2xl border border-red-100 bg-red-50 px-5 py-3 text-sm font-bold text-red-700 disabled:opacity-60"
                      >
                        {isDisconnectingDrive ? "Disconnecting..." : "Disconnect"}
                      </button>
                    )}
                  </div>

                  {backupSetting?.isGoogleDriveConnected ? (
                    <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                      Connected to Google Drive
                      {backupSetting.googleAccountEmail
                        ? ` as ${backupSetting.googleAccountEmail}`
                        : ""}
                      {backupSetting.googleDriveConnectedAt
                        ? ` · Connected ${formatDateTime(
                            backupSetting.googleDriveConnectedAt
                          )}`
                        : ""}
                      .
                    </div>
                  ) : backupForm.googleDriveEnabled ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Connect Google Drive before running Drive backup. After
                      clicking Connect, Google will open a browser page to select
                      account and allow permission.
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-bauraBrown/10 bg-white/70 px-4 py-3 text-sm text-bauraBrown/60">
                      Turn on Google Drive Backup to connect a Google account.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => loadSettings()}
                  disabled={isSavingSettings}
                  className="rounded-2xl border border-bauraBrown/10 bg-white px-5 py-3 text-sm font-bold text-bauraBrown disabled:opacity-60"
                >
                  Reset
                </button>

                <button
                  disabled={isSavingSettings}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-bauraBrown px-5 py-3 text-sm font-bold text-bauraCream disabled:opacity-60"
                >
                  <Save size={16} />
                  {isSavingSettings ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </form>
          </div>

          <div className="grid gap-5">
            <section className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bauraGold">
                    Backup Health
                  </p>
                  <h3 className="mt-1 text-xl font-bold">
                    Current Backup Status
                  </h3>
                  <p className="mt-1 text-sm text-bauraBrown/60">
                    Monitor the most recent backup and enabled backup targets.
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bauraBrown text-bauraGold">
                  <Settings size={22} />
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <StatusBox
                  title="Local Backup"
                  value={backupForm.localBackupEnabled ? "Enabled" : "Disabled"}
                  status={backupForm.localBackupEnabled ? "SUCCESS" : "FAILED"}
                  note={backupForm.localBackupPath || "No path configured"}
                />

                <StatusBox
                  title="Google Drive"
                  value={
                    backupSetting?.isGoogleDriveConnected
                      ? "Connected"
                      : backupForm.googleDriveEnabled
                      ? "Prepared"
                      : "Disabled"
                  }
                  status={
                    backupSetting?.isGoogleDriveConnected
                      ? "SUCCESS"
                      : backupForm.googleDriveEnabled
                      ? "RUNNING"
                      : "FAILED"
                  }
                  note={
                    backupSetting?.isGoogleDriveConnected
                      ? backupSetting.googleAccountEmail ||
                        "Google account connected"
                      : backupForm.googleDriveEnabled
                      ? "Waiting for OAuth connection"
                      : "Drive backup is disabled"
                  }
                />

                <StatusBox
                  title="Latest Backup"
                  value={latestBackup ? latestBackup.status : "No backup"}
                  status={latestBackup?.status || "RUNNING"}
                  note={
                    latestBackup
                      ? `${formatTarget(latestBackup.target)} · ${formatFileSize(
                          latestBackup.sizeBytes
                        )}`
                      : "Run your first backup"
                  }
                />

                <StatusBox
                  title="Frequency"
                  value={formatFrequency(backupForm.frequency)}
                  status="SUCCESS"
                  note="Saved schedule preference"
                />
              </div>

              <button
                onClick={handleRunBackupNow}
                disabled={
                  isRunningBackup ||
                  isLoading ||
                  (!backupForm.localBackupEnabled && !backupForm.googleDriveEnabled)
                }
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-bauraBrown px-5 py-4 text-sm font-bold text-bauraCream shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <DatabaseBackup size={17} />
                {isRunningBackup ? "Creating Backup..." : "Run Backup Now"}
              </button>
            </section>

            <section className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
              <div>
                <h3 className="text-xl font-bold">Backup Instructions</h3>
                <p className="mt-1 text-sm text-bauraBrown/60">
                  Local backup works immediately. Google Drive needs one-time
                  OAuth connection.
                </p>
              </div>

              <div className="mt-4 grid gap-3">
                <InstructionStep
                  number="1"
                  title="Set local backup path"
                  text="Use ./backups for project folder backups or a full path like D:/BauraBackups."
                />
                <InstructionStep
                  number="2"
                  title="Save Drive folder and connect"
                  text="Enable Google Drive Backup, paste folder ID, save settings, then click Connect Google Drive."
                />
                <InstructionStep
                  number="3"
                  title="Run database backup"
                  text="The system creates a PostgreSQL .dump file locally and uploads the same database dump to Drive when connected."
                />
              </div>
            </section>
          </div>
        </section>

        <section className="rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bauraGold">
                Backup Records
              </p>
              <h3 className="mt-1 text-xl font-bold">Backup History</h3>
              <p className="mt-1 text-sm text-bauraBrown/60">
                View local and Google Drive backup attempts with status, size and
                path.
              </p>
            </div>

            <button
              onClick={() => loadSettings(true)}
              className="flex w-fit items-center gap-2 rounded-2xl border border-bauraBrown/10 bg-white/70 px-4 py-2 text-sm font-semibold"
            >
              <RefreshCw size={15} />
              Refresh History
            </button>
          </div>

          <div className="baura-scrollbar max-h-[520px] overflow-auto pr-1">
            {isLoading ? (
              <EmptyState text="Loading backup history..." />
            ) : history.length === 0 ? (
              <EmptyState text="No backups created yet." />
            ) : (
              <div className="grid gap-3">
                {history.map((item) => (
                  <BackupHistoryCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function SummaryCard({
  title,
  value,
  note,
  icon,
  alert = false
}: {
  title: string;
  value: string;
  note: string;
  icon: ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-[2rem] border p-5 shadow-sm ${
        alert
          ? "border-amber-200 bg-amber-50"
          : "border-bauraBrown/10 bg-bauraSoft"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-bauraBrown/60">{title}</p>

        <div
          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
            alert
              ? "bg-amber-100 text-amber-700"
              : "bg-bauraBrown text-bauraGold"
          }`}
        >
          {icon}
        </div>
      </div>

      <h3 className="mt-3 truncate text-xl font-black text-bauraBrown">
        {value}
      </h3>

      <p className="mt-1 text-xs text-bauraBrown/50">{note}</p>
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange
}: {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-bauraBrown text-bauraGold">
          {icon}
        </div>

        <div>
          <h4 className="font-bold text-bauraBrown">{title}</h4>
          <p className="mt-1 text-sm leading-6 text-bauraBrown/60">
            {description}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${
          checked ? "bg-bauraBrown" : "bg-bauraBrown/20"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition ${
            checked ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  required = true
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <input
        className="w-full rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-bauraGold disabled:bg-white/50 disabled:text-bauraBrown/40"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
      />
    </label>
  );
}

function StatusBox({
  title,
  value,
  status,
  note
}: {
  title: string;
  value: string;
  status: BackupStatus;
  note: string;
}) {
  const isSuccess = status === "SUCCESS";
  const isFailed = status === "FAILED";
  const isRunning = status === "RUNNING";

  return (
    <div
      className={`rounded-3xl border p-4 ${
        isSuccess
          ? "border-green-200 bg-green-50"
          : isFailed
          ? "border-red-200 bg-red-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-bauraBrown/60">{title}</p>
          <h4 className="mt-1 font-bold text-bauraBrown">{value}</h4>
        </div>

        <div
          className={`rounded-full p-2 ${
            isSuccess
              ? "bg-green-100 text-green-700"
              : isFailed
              ? "bg-red-100 text-red-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {isSuccess ? (
            <CheckCircle2 size={17} />
          ) : isFailed ? (
            <XCircle size={17} />
          ) : (
            <AlertTriangle size={17} />
          )}
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-xs text-bauraBrown/55">{note}</p>

      {isRunning && (
        <p className="mt-2 text-xs font-semibold text-amber-700">
          Prepared / waiting for setup
        </p>
      )}
    </div>
  );
}

function InstructionStep({
  number,
  title,
  text
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border border-bauraBrown/10 bg-white/60 p-4">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-bauraBrown text-sm font-bold text-bauraGold">
          {number}
        </div>

        <div>
          <h4 className="font-bold text-bauraBrown">{title}</h4>
          <p className="mt-1 text-sm leading-6 text-bauraBrown/60">{text}</p>
        </div>
      </div>
    </div>
  );
}

function BackupHistoryCard({ item }: { item: BackupHistoryItem }) {
  const isSuccess = item.status === "SUCCESS";
  const isFailed = item.status === "FAILED";
  const isRunning = item.status === "RUNNING";

  return (
    <div
      className={`rounded-3xl border p-4 ${
        isSuccess
          ? "border-green-200 bg-green-50"
          : isFailed
          ? "border-red-200 bg-red-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                isSuccess
                  ? "bg-green-100 text-green-700"
                  : isFailed
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {item.status}
            </span>

            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-bauraBrown/65">
              {formatTarget(item.target)}
            </span>

            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-bauraBrown/65">
              {formatFileSize(item.sizeBytes)}
            </span>
          </div>

          <h4 className="mt-3 truncate font-bold text-bauraBrown">
            {item.fileName || "Database backup attempt"}
          </h4>

          <p className="mt-1 text-sm text-bauraBrown/60">
            Started: {formatDateTime(item.startedAt)} · Completed:{" "}
            {formatDateTime(item.completedAt)}
          </p>

          {item.filePath && (
            <p className="mt-1 truncate text-xs text-bauraBrown/45">
              Path: {item.filePath}
            </p>
          )}

          {item.googleAccountEmail && (
            <p className="mt-1 truncate text-xs text-bauraBrown/45">
              Drive Account: {item.googleAccountEmail}
            </p>
          )}

          {item.googleDriveFileId && (
            <p className="mt-1 truncate text-xs text-bauraBrown/45">
              Drive File ID: {item.googleDriveFileId}
            </p>
          )}

          {item.errorMessage && (
            <p className="mt-2 rounded-2xl bg-white/70 px-3 py-2 text-xs text-red-700">
              {item.errorMessage}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
              isSuccess
                ? "bg-green-100 text-green-700"
                : isFailed
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {item.target === "GOOGLE_DRIVE" ? (
              <Cloud size={22} />
            ) : (
              <HardDrive size={22} />
            )}
          </div>

          <div className="text-right">
            <p className="text-xs text-bauraBrown/45">Target</p>
            <p className="font-bold text-bauraBrown">
              {formatTarget(item.target)}
            </p>
          </div>
        </div>
      </div>

      {isRunning && (
        <p className="mt-3 text-xs font-semibold text-amber-700">
          Backup is currently running.
        </p>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl bg-white/50 p-6 text-center text-sm text-bauraBrown/60">
      {text}
    </div>
  );
}