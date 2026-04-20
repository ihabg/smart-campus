import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, saveTokens, clearTokens } from '../api/index';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,        setUser]    = useState(null);
  const [loading,     setLoading] = useState(true);

  useEffect(() => {
    authAPI.getMe()
      .then(({ data }) => setUser(data.data.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await authAPI.login({ email, password });
    const { user: u, accessToken, refreshToken } = data.data;
    await saveTokens(accessToken, refreshToken);
    setUser(u);
    return u;
  };

  const register = async (form) => {
    const { data } = await authAPI.register(form);
    const { user: u, accessToken, refreshToken } = data.data;
    await saveTokens(accessToken, refreshToken);
    setUser(u);
    return u;
  };

  const logout = async () => {
    try { await authAPI.logout(); } catch {}
    await clearTokens();
    setUser(null);
  };

  const updateUser = updates => setUser(u => u ? { ...u, ...updates } : u);

  return (
    <AuthContext.Provider value={{
      user, loading,
      login, register, logout, updateUser,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
