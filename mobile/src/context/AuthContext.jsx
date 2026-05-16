import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authAPI, clearTokens, getToken, saveTokens } from '../api';
import { unwrapApi } from '../utils/helpers';

const AuthContext = createContext(null);

function extractAuthPayload(response) {
  const payload = unwrapApi(response);

  return {
    user: payload.user,
    accessToken:
      payload.accessToken || payload.access_token || payload.token,
    refreshToken: payload.refreshToken || payload.refresh_token,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const token = await getToken();

        if (!token) {
          return;
        }

        const response = await authAPI.getMe();
        const payload = unwrapApi(response);

        if (mounted) {
          setUser(payload.user || payload);
        }
      } catch {
        await clearTokens();
      } finally {
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  async function login(email, password) {
    const response = await authAPI.login({ email, password });
    const payload = extractAuthPayload(response);

    await saveTokens(payload.accessToken, payload.refreshToken);
    setUser(payload.user);

    return payload.user;
  }

  async function register(form) {
    const response = await authAPI.register(form);
    const payload = extractAuthPayload(response);

    await saveTokens(payload.accessToken, payload.refreshToken);
    setUser(payload.user);

    return payload.user;
  }

  async function logout() {
    try {
      await authAPI.logout();
    } catch {}

    await clearTokens();
    setUser(null);
  }

  function updateUser(updates) {
    setUser((current) => (current ? { ...current, ...updates } : current));
  }

  const value = useMemo(() => {
    const role = user?.role;

    return {
      user,
      loading,
      initialized,
      login,
      register,
      logout,
      updateUser,
      isAuthenticated: Boolean(user),
      isAdmin: role === 'admin' || role === 'super_admin',
      isStudent: !role || role === 'student',
    };
  }, [user, loading, initialized]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
