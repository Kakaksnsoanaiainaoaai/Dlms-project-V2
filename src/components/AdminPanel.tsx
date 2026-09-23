import React, { useState, useEffect } from 'react';
import {
  authService,
  ActivationKeyData,
  DeviceData,
  SessionData,
  AuditLogData,
  AdminStats,
  AuthUser,
} from '../services/auth-service';
import {
  ShieldAlert,
  Key,
  Smartphone,
  Users,
  FileText,
  Lock,
  LogOut,
  RefreshCw,
  Plus,
  Copy,
  Check,
  Download,
  AlertTriangle,
  Sliders,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from 'lucide-react';

interface AdminPanelProps {
  currentUser: AuthUser;
  onOpenDLMS: () => void;
  onLogout: () => void;
}

type TabType = 'DASHBOARD' | 'KEYS' | 'DEVICES' | 'SESSIONS' | 'AUDIT' | 'ACCOUNT';

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onOpenDLMS, onLogout }) => {
  const [activeTab, setActiveTab] = useState<TabType>('DASHBOARD');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [keys, setKeys] = useState<ActivationKeyData[]>([]);
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Key Generation State
  const [generateCount, setGenerateCount] = useState<number>(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newlyGeneratedKeys, setNewlyGeneratedKeys] = useState<ActivationKeyData[] | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Key Search & Filter
  const [keyFilter, setKeyFilter] = useState<'ALL' | 'UNUSED' | 'USED' | 'REVOKED'>('ALL');
  const [keySearch, setKeySearch] = useState('');

  // Device Search & Filter
  const [deviceFilter, setDeviceFilter] = useState<'ALL' | 'ACTIVE' | 'REVOKED'>('ALL');
  const [deviceSearch, setDeviceSearch] = useState('');

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Confirmation Modal State
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ type, text });
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, keysRes, devRes, sessRes, logsRes] = await Promise.all([
        authService.getStats(),
        authService.getKeys(),
        authService.getDevices(),
        authService.getSessions(),
        authService.getAuditLogs(),
      ]);

      if (statsRes.success && statsRes.stats) setStats(statsRes.stats);
      if (keysRes.success && keysRes.keys) setKeys(keysRes.keys);
      if (devRes.success && devRes.devices) setDevices(devRes.devices);
      if (sessRes.success && sessRes.sessions) setSessions(sessRes.sessions);
      if (logsRes.success && logsRes.logs) setAuditLogs(logsRes.logs);
    } catch {
      showToast('Error refreshing data from server', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  // Handle Generate Keys
  const handleGenerateKeys = async () => {
    setIsGenerating(true);
    const res = await authService.generateKeys(generateCount);
    setIsGenerating(false);

    if (res.success && res.keys) {
      setNewlyGeneratedKeys(res.keys);
      showToast(`Successfully generated ${res.keys.length} activation key(s)!`);
      loadData();
    } else {
      showToast(res.error || 'Failed to generate keys', 'error');
    }
  };

  // Handle Revoke Key
  const handleRevokeKey = (keyId: string, keyCode: string) => {
    setConfirmAction({
      title: 'Revoke Activation Key?',
      description: `Are you sure you want to revoke '${keyCode}'? Any active user session and bound device will be instantly invalidated.`,
      onConfirm: async () => {
        setConfirmAction(null);
        const res = await authService.revokeKey(keyId);
        if (res.success) {
          showToast(`Key ${keyCode} has been revoked.`);
          loadData();
        } else {
          showToast(res.error || 'Failed to revoke key', 'error');
        }
      },
    });
  };

  // Handle Revoke Device
  const handleRevokeDevice = (deviceId: string) => {
    setConfirmAction({
      title: 'Revoke Device Binding?',
      description: `Are you sure you want to revoke '${deviceId}'? This hardware will be permanently disconnected from DLMS Virtual and cannot re-authenticate.`,
      onConfirm: async () => {
        setConfirmAction(null);
        const res = await authService.revokeDevice(deviceId);
        if (res.success) {
          showToast(`Device ${deviceId} has been revoked.`);
          loadData();
        } else {
          showToast(res.error || 'Failed to revoke device', 'error');
        }
      },
    });
  };

  // Handle Device Recovery & Reset Binding
  const handleResetDeviceBinding = (deviceId: string, maskedKey: string) => {
    setConfirmAction({
      title: 'Reset Device Binding (Recovery)?',
      description: `Resetting device binding will revoke old hardware '${deviceId}' and unlock activation key '${maskedKey}'. The user will be authorized to bind a new legitimate device. Continue?`,
      onConfirm: async () => {
        setConfirmAction(null);
        const res = await authService.resetDeviceBinding(deviceId);
        if (res.success) {
          showToast(res.message || `Binding reset for ${deviceId}. Key unlocked.`);
          loadData();
        } else {
          showToast(res.error || 'Failed to reset device binding', 'error');
        }
      },
    });
  };

  // Handle Revoke Session
  const handleRevokeSession = (sessionId: string, userId: string) => {
    setConfirmAction({
      title: 'Revoke User Session?',
      description: `Are you sure you want to terminate the session for '${userId}'? The user will immediately be locked out of DLMS Virtual.`,
      onConfirm: async () => {
        setConfirmAction(null);
        const res = await authService.revokeSession(sessionId);
        if (res.success) {
          showToast(`Session for ${userId} revoked.`);
          loadData();
        } else {
          showToast(res.error || 'Failed to revoke session', 'error');
        }
      },
    });
  };

  // Handle Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      showToast('Please fill all fields', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }
    if (newPassword.length < 8) {
      showToast('New password must be at least 8 characters', 'error');
      return;
    }

    setIsChangingPass(true);
    const res = await authService.changeAdminPassword(currentPassword, newPassword);
    setIsChangingPass(false);

    if (res.success) {
      showToast('Admin password changed successfully! Please log in again.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => onLogout(), 1500);
    } else {
      showToast(res.error || 'Failed to change password', 'error');
    }
  };

  // Copy to clipboard helper
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Download keys as .txt file
  const handleDownloadKeys = (keysList: ActivationKeyData[]) => {
    const text = keysList.map((k) => `${k.keyCode} [Status: ${k.status}]`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dlms-activation-keys-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter keys
  const filteredKeys = keys.filter((k) => {
    if (keyFilter !== 'ALL' && k.status !== keyFilter) return false;
    if (keySearch.trim()) {
      const q = keySearch.trim().toUpperCase();
      return k.keyCode.includes(q) || (k.userId && k.userId.toUpperCase().includes(q));
    }
    return true;
  });

  // Filter devices
  const filteredDevices = devices.filter((d) => {
    if (deviceFilter !== 'ALL' && d.status !== deviceFilter) return false;
    if (deviceSearch.trim()) {
      const q = deviceSearch.trim().toLowerCase();
      return (
        d.id.toLowerCase().includes(q) ||
        (d.userAgentSnippet && d.userAgentSnippet.toLowerCase().includes(q)) ||
        (d.keyCodeMasked && d.keyCodeMasked.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#070b14] text-neutral-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
      {/* Top Header Bar */}
      <header className="border-b border-neutral-800 bg-[#090d18] sticky top-0 z-30 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <ShieldAlert className="w-5 h-5 text-black" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-sm tracking-wider uppercase font-mono text-white">
                REMIX DLMS VIRTUAL
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold">
                ADMIN SECURITY CONSOLE
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 font-mono">
              AUTHENTICATED AS: <span className="text-amber-400 font-bold">{currentUser.userId}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          {/* Refresh button */}
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Switch to DLMS DSP Button */}
          <button
            onClick={onOpenDLMS}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-black font-bold transition shadow-md shadow-cyan-600/30 cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>BUKA DLMS VIRTUAL</span>
          </button>

          {/* Logout Button */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 font-bold transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">LOGOUT</span>
          </button>
        </div>
      </header>

      {/* Toast Feedback */}
      {feedbackMessage && (
        <div
          className={`fixed top-16 right-4 z-50 px-4 py-2.5 rounded-xl border text-xs font-mono flex items-center gap-2 shadow-2xl transition animate-fade-in ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-700 text-emerald-300'
              : 'bg-rose-950/90 border-rose-700 text-rose-300'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 flex flex-col md:flex-row gap-5">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-60 flex md:flex-col gap-1.5 bg-neutral-900/60 p-2 rounded-2xl border border-neutral-800/80 shrink-0 font-mono text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('DASHBOARD')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'DASHBOARD'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>DASHBOARD</span>
          </button>

          <button
            onClick={() => setActiveTab('KEYS')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'KEYS'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Key className="w-4 h-4 shrink-0" />
            <span>KEY MANAGEMENT</span>
          </button>

          <button
            onClick={() => setActiveTab('DEVICES')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'DEVICES'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>DEVICE BINDINGS</span>
          </button>

          <button
            onClick={() => setActiveTab('SESSIONS')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'SESSIONS'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>SESSION MANAGER</span>
          </button>

          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'AUDIT'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>AUDIT LOG</span>
          </button>

          <button
            onClick={() => setActiveTab('ACCOUNT')}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'ACCOUNT'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Lock className="w-4 h-4 shrink-0" />
            <span>ACCOUNT SECURITY</span>
          </button>
        </aside>

        {/* Tab Content Panel */}
        <main className="flex-1 bg-neutral-900/40 border border-neutral-800/80 rounded-2xl p-4 sm:p-6 overflow-hidden flex flex-col">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-bold font-mono text-neutral-100 uppercase tracking-wider">
                  SYSTEM OVERVIEW & METRICS
                </h2>
                <p className="text-xs text-neutral-400 font-mono mt-0.5">
                  Server-side security state on Google Cloud deployment
                </p>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
                <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                  <div className="text-[11px] text-neutral-400">TOTAL KEYS</div>
                  <div className="text-2xl font-black text-white mt-1">{stats?.totalKeys ?? '-'}</div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/50">
                  <div className="text-[11px] text-emerald-400">UNUSED (READY)</div>
                  <div className="text-2xl font-black text-emerald-300 mt-1">{stats?.unused ?? '-'}</div>
                </div>

                <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/50">
                  <div className="text-[11px] text-cyan-400">USED (ACTIVATED)</div>
                  <div className="text-2xl font-black text-cyan-300 mt-1">{stats?.used ?? '-'}</div>
                </div>

                <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-700/50">
                  <div className="text-[11px] text-cyan-400 flex items-center gap-1">
                    <Smartphone className="w-3 h-3" />
                    <span>BOUND DEVICES</span>
                  </div>
                  <div className="text-2xl font-black text-cyan-200 mt-1">
                    {devices.filter((d) => d.status === 'ACTIVE').length}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50">
                  <div className="text-[11px] text-amber-400">ACTIVE SESSIONS</div>
                  <div className="text-2xl font-black text-amber-300 mt-1">{stats?.activeSessions ?? '-'}</div>
                </div>

                <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/50">
                  <div className="text-[11px] text-rose-400">REVOKED KEYS</div>
                  <div className="text-2xl font-black text-rose-300 mt-1">{stats?.revoked ?? '-'}</div>
                </div>
              </div>

              {/* Quick Actions Card */}
              <div className="p-5 rounded-2xl bg-neutral-950/80 border border-neutral-800 space-y-4">
                <h3 className="text-xs font-bold font-mono text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <Key className="w-4 h-4 text-amber-400" />
                  <span>QUICK KEY GENERATOR</span>
                </h3>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-neutral-400">QUANTITY:</span>
                    {[1, 5, 10, 20].map((num) => (
                      <button
                        key={num}
                        onClick={() => setGenerateCount(num)}
                        className={`px-3 py-1.5 rounded-lg border font-bold transition cursor-pointer ${
                          generateCount === num
                            ? 'bg-amber-500 text-black border-amber-400'
                            : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:text-white'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleGenerateKeys}
                    disabled={isGenerating}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono text-xs transition shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isGenerating ? 'GENERATING...' : 'GENERATE NOW'}</span>
                  </button>
                </div>
              </div>

              {/* Recent Audit Feed */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold font-mono text-neutral-300 uppercase tracking-wider flex items-center justify-between">
                  <span>RECENT SECURITY AUDIT EVENTS</span>
                  <button
                    onClick={() => setActiveTab('AUDIT')}
                    className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                  >
                    View All &rarr;
                  </button>
                </h3>

                <div className="bg-neutral-950 rounded-xl border border-neutral-800 divide-y divide-neutral-800/80 font-mono text-xs overflow-hidden">
                  {auditLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            log.result === 'SUCCESS' ? 'bg-emerald-400' : 'bg-rose-500'
                          }`}
                        />
                        <span className="font-bold text-neutral-200">{log.action}</span>
                        <span className="text-neutral-500 text-[11px] hidden sm:inline">{log.details}</span>
                      </div>
                      <div className="text-[11px] text-neutral-500 text-right shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: KEY MANAGEMENT */}
          {activeTab === 'KEYS' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold font-mono text-neutral-100 uppercase tracking-wider">
                    ACTIVATION KEYS
                  </h2>
                  <p className="text-xs text-neutral-400 font-mono mt-0.5">
                    Single-use cryptographically secure activation keys
                  </p>
                </div>

                {/* Generate Action Button */}
                <div className="flex items-center gap-2 font-mono text-xs">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={generateCount}
                    onChange={(e) => setGenerateCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    className="w-16 px-2.5 py-1.5 bg-neutral-950 border border-neutral-700 rounded-lg text-neutral-100 text-center"
                  />
                  <button
                    onClick={handleGenerateKeys}
                    disabled={isGenerating}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Generate</span>
                  </button>
                  <button
                    onClick={() => handleDownloadKeys(filteredKeys)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 font-bold rounded-lg transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Export</span>
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-neutral-950 rounded-xl border border-neutral-800 text-xs font-mono">
                <div className="flex items-center gap-1">
                  {(['ALL', 'UNUSED', 'USED', 'REVOKED'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setKeyFilter(st)}
                      className={`px-2.5 py-1 rounded-lg transition cursor-pointer font-bold ${
                        keyFilter === st
                          ? 'bg-neutral-800 text-white'
                          : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <div className="w-full sm:w-64">
                  <input
                    type="text"
                    placeholder="Search key or user..."
                    value={keySearch}
                    onChange={(e) => setKeySearch(e.target.value)}
                    className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-neutral-200 placeholder-neutral-600 text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Keys Table */}
              <div className="border border-neutral-800 rounded-xl overflow-x-auto bg-neutral-950 font-mono text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-800 text-[11px] text-neutral-400 bg-neutral-900/60 uppercase">
                      <th className="py-2.5 px-3">Activation Key Code</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Bound Hardware</th>
                      <th className="py-2.5 px-3">Created</th>
                      <th className="py-2.5 px-3">Activated / User</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {filteredKeys.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-neutral-500">
                          No activation keys found. Click 'Generate' to create new keys.
                        </td>
                      </tr>
                    ) : (
                      filteredKeys.map((k) => (
                        <tr key={k.id} className="hover:bg-neutral-900/40">
                          <td className="py-2.5 px-3 font-bold text-neutral-200 flex items-center gap-2">
                            <span>{k.keyCode}</span>
                            <button
                              onClick={() => handleCopyText(k.keyCode)}
                              title="Copy Key Code"
                              className="text-neutral-500 hover:text-amber-400 cursor-pointer"
                            >
                              {copiedKey === k.keyCode ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                k.status === 'UNUSED'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80'
                                  : k.status === 'USED'
                                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/80'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800/80'
                              }`}
                            >
                              {k.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px]">
                            {k.boundDeviceId ? (
                              <div className="flex items-center gap-1.5 text-cyan-400">
                                <Smartphone className="w-3 h-3 shrink-0" />
                                <span className="truncate max-w-[130px]">{k.boundDeviceId}</span>
                              </div>
                            ) : (
                              <span className="text-neutral-600">Unbound</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-400 text-[11px]">
                            {new Date(k.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-400 text-[11px]">
                            {k.status === 'USED' ? (
                              <div>
                                <span className="text-cyan-400 font-semibold">{k.userId}</span>
                                <div className="text-[10px] text-neutral-500">
                                  {k.activatedAt ? new Date(k.activatedAt).toLocaleString() : ''}
                                </div>
                              </div>
                            ) : (
                              <span className="text-neutral-600">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {k.status !== 'REVOKED' && (
                              <button
                                onClick={() => handleRevokeKey(k.id, k.keyCode)}
                                className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[11px] rounded transition cursor-pointer font-bold"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: DEVICE MANAGEMENT (DEVICE BINDING V2) */}
          {activeTab === 'DEVICES' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold font-mono text-neutral-100 uppercase tracking-wider flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-cyan-400" />
                  <span>DEVICE BINDING V2 REGISTRY</span>
                </h2>
                <p className="text-xs text-neutral-400 font-mono mt-0.5">
                  Hardware-bound cryptographic credentials (ECDSA P-256) enforcing single-device access
                </p>
              </div>

              {/* Status and Search Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  {(['ALL', 'ACTIVE', 'REVOKED'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setDeviceFilter(filter)}
                      className={`px-3 py-1.5 rounded-lg border font-bold transition cursor-pointer ${
                        deviceFilter === filter
                          ? 'bg-cyan-500 text-black border-cyan-400'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:text-white'
                      }`}
                    >
                      {filter} (
                      {filter === 'ALL'
                        ? devices.length
                        : devices.filter((d) => d.status === filter).length}
                      )
                    </button>
                  ))}
                </div>

                <div className="w-full sm:w-64">
                  <input
                    type="text"
                    value={deviceSearch}
                    onChange={(e) => setDeviceSearch(e.target.value)}
                    placeholder="Search Device / Key / User..."
                    className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-neutral-200 placeholder-neutral-600 text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Devices Table */}
              <div className="border border-neutral-800 rounded-xl overflow-x-auto bg-neutral-950 font-mono text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-800 text-[11px] text-neutral-400 bg-neutral-900/60 uppercase">
                      <th className="py-2.5 px-3">Device ID</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Credential Type</th>
                      <th className="py-2.5 px-3">Bound Key</th>
                      <th className="py-2.5 px-3">Client Hardware / OS</th>
                      <th className="py-2.5 px-3">Enrolled At</th>
                      <th className="py-2.5 px-3">Last Active</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {filteredDevices.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-neutral-500">
                          No device bindings found matching criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredDevices.map((d) => (
                        <tr key={d.id} className="hover:bg-neutral-900/40">
                          <td className="py-2.5 px-3 font-bold text-neutral-200">
                            <div className="flex items-center gap-1.5">
                              <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span className="font-mono text-xs">{d.id}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                d.status === 'ACTIVE'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800/80'
                              }`}
                            >
                              {d.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                d.credentialType === 'ECDSA_P256'
                                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80'
                                  : 'bg-neutral-900 text-neutral-400 border border-neutral-700'
                              }`}
                            >
                              {d.credentialType}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-neutral-300 text-[11px]">
                            {d.keyCodeMasked || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-300 text-[11px] max-w-[150px] truncate" title={d.userAgentSnippet}>
                            {d.userAgentSnippet || 'Web Device'}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-400 text-[11px]">
                            {new Date(d.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-400 text-[11px]">
                            {new Date(d.lastSeen).toLocaleTimeString()}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {d.status === 'ACTIVE' && (
                                <button
                                  onClick={() => handleResetDeviceBinding(d.id, d.keyCodeMasked || 'KEY')}
                                  title="Unbind Key for New Device Recovery"
                                  className="px-2 py-1 bg-amber-950/60 hover:bg-amber-900 border border-amber-800 text-amber-300 text-[11px] rounded transition cursor-pointer font-bold flex items-center gap-1"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Reset Binding</span>
                                </button>
                              )}
                              {d.status === 'ACTIVE' && (
                                <button
                                  onClick={() => handleRevokeDevice(d.id)}
                                  className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[11px] rounded transition cursor-pointer font-bold"
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: SESSION MANAGEMENT */}
          {activeTab === 'SESSIONS' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold font-mono text-neutral-100 uppercase tracking-wider">
                  ACTIVE USER SESSIONS
                </h2>
                <p className="text-xs text-neutral-400 font-mono mt-0.5">
                  Currently authenticated client connections and hardware bindings
                </p>
              </div>

              <div className="border border-neutral-800 rounded-xl overflow-x-auto bg-neutral-950 font-mono text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-800 text-[11px] text-neutral-400 bg-neutral-900/60 uppercase">
                      <th className="py-2.5 px-3">User ID</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Device ID</th>
                      <th className="py-2.5 px-3">Last Active</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {sessions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-neutral-500">
                          No active sessions currently recorded.
                        </td>
                      </tr>
                    ) : (
                      sessions.map((s) => (
                        <tr key={s.id} className="hover:bg-neutral-900/40">
                          <td className="py-2.5 px-3 font-bold text-neutral-200">{s.userId}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                s.role === 'admin'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                              }`}
                            >
                              {s.role.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-neutral-400 text-[11px] max-w-[120px] truncate">
                            {s.deviceId}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-400 text-[11px]">
                            {new Date(s.lastSeen).toLocaleTimeString()}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                s.status === 'ACTIVE'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}
                            >
                              {s.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {s.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleRevokeSession(s.id, s.userId)}
                                className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[11px] rounded transition cursor-pointer font-bold"
                              >
                                Revoke Session
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT LOG */}
          {activeTab === 'AUDIT' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold font-mono text-neutral-100 uppercase tracking-wider">
                  SECURITY AUDIT LOGS
                </h2>
                <p className="text-xs text-neutral-400 font-mono mt-0.5">
                  Immutable server-side trail of logins, key activations, and administrative changes
                </p>
              </div>

              <div className="border border-neutral-800 rounded-xl overflow-x-auto bg-neutral-950 font-mono text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-800 text-[11px] text-neutral-400 bg-neutral-900/60 uppercase">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Actor</th>
                      <th className="py-2.5 px-3">Result</th>
                      <th className="py-2.5 px-3">Details</th>
                      <th className="py-2.5 px-3 text-right">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-neutral-500">
                          No audit logs found.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-neutral-900/40">
                          <td className="py-2.5 px-3 text-neutral-400 text-[11px]">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-neutral-200">{log.action}</td>
                          <td className="py-2.5 px-3 text-neutral-300">{log.actor}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                log.result === 'SUCCESS'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}
                            >
                              {log.result}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-neutral-400 text-[11px] max-w-xs truncate">
                            {log.details}
                          </td>
                          <td className="py-2.5 px-3 text-right text-neutral-500 text-[11px]">
                            {log.ip}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: ACCOUNT SECURITY */}
          {activeTab === 'ACCOUNT' && (
            <div className="max-w-md space-y-6">
              <div>
                <h2 className="text-base font-bold font-mono text-neutral-100 uppercase tracking-wider">
                  CHANGE ADMIN PASSWORD
                </h2>
                <p className="text-xs text-neutral-400 font-mono mt-0.5">
                  Update administrative credentials. All previous admin sessions will be terminated.
                </p>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4 font-mono text-xs">
                <div>
                  <label className="block text-neutral-300 uppercase tracking-wider mb-1.5 font-semibold">
                    CURRENT PASSWORD
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 uppercase tracking-wider mb-1.5 font-semibold">
                    NEW PASSWORD (MIN 8 CHARACTERS)
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={8}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 uppercase tracking-wider mb-1.5 font-semibold">
                    CONFIRM NEW PASSWORD
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={8}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-xl text-neutral-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isChangingPass}
                  className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono tracking-wider rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  {isChangingPass ? 'UPDATING PASSWORD...' : 'UPDATE ADMIN PASSWORD'}
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Pop-up for Newly Generated Keys */}
      {newlyGeneratedKeys && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#090d18] border border-amber-500/50 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black font-mono text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>NEW ACTIVATION KEYS GENERATED</span>
              </h3>
              <button
                onClick={() => setNewlyGeneratedKeys(null)}
                className="text-neutral-500 hover:text-white font-mono text-xs cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-neutral-400 font-mono">
              Save or copy these keys. Distribute them to authorized sound engineers or clients:
            </p>

            <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 space-y-2 max-h-60 overflow-y-auto font-mono text-xs">
              {newlyGeneratedKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between p-2 rounded bg-neutral-900 border border-neutral-800">
                  <span className="font-bold text-amber-300">{k.keyCode}</span>
                  <button
                    onClick={() => handleCopyText(k.keyCode)}
                    className="text-neutral-400 hover:text-white cursor-pointer"
                  >
                    {copiedKey === k.keyCode ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 font-mono text-xs">
              <button
                onClick={() => {
                  const allText = newlyGeneratedKeys.map((k) => k.keyCode).join('\n');
                  handleCopyText(allText);
                }}
                className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold rounded-xl transition cursor-pointer"
              >
                Copy All Keys
              </button>
              <button
                onClick={() => handleDownloadKeys(newlyGeneratedKeys)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition cursor-pointer"
              >
                Download .txt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#090d18] border border-rose-800/80 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold font-mono text-sm tracking-wider uppercase">
                {confirmAction.title}
              </h3>
            </div>

            <p className="text-xs text-neutral-300 font-mono leading-relaxed">
              {confirmAction.description}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 font-mono text-xs">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.onConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition cursor-pointer"
              >
                Confirm Revocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
