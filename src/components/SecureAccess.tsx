import React, { useState, useEffect } from 'react';
import { authService, AuthUser } from '../services/auth-service';
import { deviceCrypto } from '../services/device-crypto';
import { ShieldCheck, Key, Lock, AlertCircle, Loader2, User, Eye, EyeOff, Sliders, Smartphone, RefreshCw } from 'lucide-react';

interface SecureAccessProps {
  onAuthenticated: (user: AuthUser) => void;
  initialError?: string | null;
}

export const SecureAccess: React.FC<SecureAccessProps> = ({ onAuthenticated, initialError }) => {
  const [activeTab, setActiveTab] = useState<'USER' | 'ADMIN'>('USER');

  // User Activation Form State
  const [keyInput, setKeyInput] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [userError, setUserError] = useState<string | null>(initialError || null);
  const [hasEnrolledDevice, setHasEnrolledDevice] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Admin Login Form State
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  useEffect(() => {
    setHasEnrolledDevice(deviceCrypto.hasEnrolledDevice());
  }, []);

  // Format activation key as user types (DLMS-XXXX-XXXX-XXXX)
  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw.startsWith('DLMS')) {
      raw = raw.substring(4);
    }
    // Limit to 12 alphanumeric characters after DLMS
    raw = raw.substring(0, 12);

    let formatted = 'DLMS';
    if (raw.length > 0) {
      formatted += '-' + raw.substring(0, 4);
    }
    if (raw.length > 4) {
      formatted += '-' + raw.substring(4, 8);
    }
    if (raw.length > 8) {
      formatted += '-' + raw.substring(8, 12);
    }

    setKeyInput(formatted);
    setUserError(null);
  };

  // Submit Activation Key
  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim() || keyInput.length < 10) {
      setUserError('INVALID ACTIVATION KEY');
      return;
    }

    setIsActivating(true);
    setUserError(null);

    const result = await authService.activateKey(keyInput);
    setIsActivating(false);

    if (result.success && result.user) {
      onAuthenticated(result.user);
    } else {
      setUserError(result.error || 'INVALID ACTIVATION KEY');
    }
  };

  // Quick Reconnect for previously bound device
  const handleDeviceReconnect = async () => {
    setIsReconnecting(true);
    setUserError(null);

    const result = await authService.reauthenticateDevice();
    setIsReconnecting(false);

    if (result.success && result.user) {
      onAuthenticated(result.user);
    } else {
      setUserError(result.error || 'RECONNECT FAILED');
      setHasEnrolledDevice(deviceCrypto.hasEnrolledDevice());
    }
  };

  // Submit Admin Login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUsername.trim() || !adminPassword) {
      setAdminError('Please enter both username and password');
      return;
    }

    setIsLoggingIn(true);
    setAdminError(null);

    const result = await authService.adminLogin(adminUsername, adminPassword);
    setIsLoggingIn(false);

    if (result.success && result.user) {
      onAuthenticated(result.user);
    } else {
      setAdminError(result.error || 'ADMIN LOGIN FAILED');
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center p-4 selection:bg-cyan-500 selection:text-black">
      {/* Background Accent Gradients */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-cyan-600/30 to-amber-600/30 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative w-full max-w-md bg-[#090d18] border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl">
        {/* Top Header */}
        <div className="p-6 border-b border-neutral-800/80 bg-neutral-950/60 text-center relative">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-600 to-amber-500 shadow-lg shadow-cyan-500/20 mb-3">
            <Sliders className="w-6 h-6 text-white" />
          </div>

          <h1 className="text-lg font-black tracking-wider uppercase font-mono text-white flex items-center justify-center gap-2">
            <span>REMIX DLMS VIRTUAL</span>
          </h1>
          <p className="text-xs text-neutral-400 font-mono mt-1">
            SECURE ACCESS GATEWAY • HARDWARE AUTHENTICATION
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/40 text-xs font-mono">
          <button
            type="button"
            onClick={() => {
              setActiveTab('USER');
              setUserError(null);
            }}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 font-bold transition cursor-pointer border-b-2 ${
              activeTab === 'USER'
                ? 'border-cyan-500 text-cyan-400 bg-neutral-900/60'
                : 'border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>ACTIVATION KEY</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('ADMIN');
              setAdminError(null);
            }}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 font-bold transition cursor-pointer border-b-2 ${
              activeTab === 'ADMIN'
                ? 'border-amber-500 text-amber-400 bg-neutral-900/60'
                : 'border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>ADMIN LOGIN</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'USER' ? (
            /* User Activation Form */
            <form onSubmit={handleActivate} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase tracking-wider mb-2 font-semibold flex items-center justify-between">
                  <span>ENTER ACTIVATION KEY</span>
                  <span className="text-[10px] text-cyan-400">SINGLE-USE KEY</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="h-4 w-4 text-cyan-500" />
                  </div>
                  <input
                    type="text"
                    value={keyInput}
                    onChange={handleKeyChange}
                    placeholder="DLMS-XXXX-XXXX-XXXX"
                    maxLength={19}
                    autoFocus
                    className="w-full pl-9 pr-4 py-3 bg-neutral-950 border border-neutral-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl text-neutral-100 placeholder-neutral-600 font-mono tracking-widest text-center text-sm uppercase transition outline-none"
                  />
                </div>
              </div>

              {/* Error Message */}
              {userError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 font-mono text-xs flex items-center gap-2 animate-shake">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span className="leading-snug">{userError}</span>
                </div>
              )}

              {/* Action Button */}
              <button
                type="submit"
                disabled={isActivating || !keyInput.trim()}
                className="w-full py-3 px-4 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-black font-black font-mono tracking-wider rounded-xl transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20 cursor-pointer"
              >
                {isActivating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>ENROLLING HARDWARE BINDING...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>ACTIVATE & BIND THIS DEVICE</span>
                  </>
                )}
              </button>

              {/* Previously Enrolled Device Quick-Login */}
              {hasEnrolledDevice && (
                <div className="pt-2 border-t border-neutral-800/80">
                  <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-left">
                    <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold mb-1">
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>REGISTERED HARDWARE DETECTED</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 font-mono mb-2">
                      This device already holds a valid cryptographic identity.
                    </p>
                    <button
                      type="button"
                      onClick={handleDeviceReconnect}
                      disabled={isReconnecting}
                      className="w-full py-2 px-3 bg-neutral-900 hover:bg-neutral-800 border border-cyan-500/40 text-cyan-300 hover:text-cyan-200 text-xs font-mono font-bold rounded-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isReconnecting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>VERIFYING CRYPTOGRAPHIC PROOF...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>RE-AUTHENTICATE THIS DEVICE</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2 text-center">
                <p className="text-[11px] font-mono text-neutral-500 leading-relaxed">
                  <strong className="text-neutral-400">Device Binding V2:</strong> Keys are bound permanently to the first hardware device upon activation. Cannot be shared across devices.
                </p>
              </div>
            </form>
          ) : (
            /* Admin Login Form */
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase tracking-wider mb-2 font-semibold">
                  ADMIN USERNAME
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-amber-500" />
                  </div>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full pl-9 pr-4 py-2.5 bg-neutral-950 border border-neutral-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-neutral-100 placeholder-neutral-600 font-mono text-sm transition outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-300 uppercase tracking-wider mb-2 font-semibold">
                  ADMIN PASSWORD
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-amber-500" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-10 py-2.5 bg-neutral-950 border border-neutral-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-neutral-100 placeholder-neutral-600 font-mono text-sm transition outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500 hover:text-neutral-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {adminError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 font-mono text-xs flex items-center gap-2 animate-shake">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{adminError}</span>
                </div>
              )}

              {/* Action Button */}
              <button
                type="submit"
                disabled={isLoggingIn || !adminPassword}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black font-mono tracking-wider rounded-xl transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>AUTHENTICATING...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>LOGIN TO ADMIN PANEL</span>
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <p className="text-[11px] font-mono text-neutral-500 leading-relaxed">
                  Administrator console controls key generation, session revocation, and security audit logs.
                </p>
              </div>
            </form>
          )}
        </div>

        {/* Footer Security Badges */}
        <div className="px-6 py-3 bg-neutral-950/90 border-t border-neutral-800/80 flex items-center justify-between text-[10px] font-mono text-neutral-500">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            SERVER ENCRYPTION ACTIVE
          </span>
          <span>DLMS SECURE v3.2</span>
        </div>
      </div>
    </div>
  );
};
