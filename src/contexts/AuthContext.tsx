import React, { createContext, useContext, useEffect, useState } from "react";
import apiClient from "@/lib/api-client";

interface AuthContextType {
  user: { id: string; email: string } | null;
  session: { access_token: string } | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const email = localStorage.getItem("auth_email");
    const userId = localStorage.getItem("auth_user_id");
    if (token && email && userId) {
      apiClient.setAuthToken(token);
      apiClient.getMe().then(({ data, error }) => {
        if (error || !data?.user) {
          apiClient.setAuthToken(null);
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_email");
          localStorage.removeItem("auth_user_id");
          setSession(null);
          setUser(null);
        } else {
          setSession({ access_token: token });
          setUser({ id: data.user.id, email: data.user.email });
        }
        setLoading(false);
      });
      return;
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await apiClient.login(email, password);
    if (error || !data) {
      return { error: error || new Error("Login failed") };
    }
    apiClient.setAuthToken(data.token);
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_email", data.user.email);
    localStorage.setItem("auth_user_id", data.user.id);
    setSession({ access_token: data.token });
    setUser({ id: data.user.id, email: data.user.email });
    return { error: null };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await apiClient.register(email, password);
    if (error || !data) {
      return { error: error || new Error("Registration failed") };
    }
    apiClient.setAuthToken(data.token);
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_email", data.user.email);
    localStorage.setItem("auth_user_id", data.user.id);
    setSession({ access_token: data.token });
    setUser({ id: data.user.id, email: data.user.email });
    return { error: null };
  };

  const signOut = async () => {
    apiClient.setAuthToken(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_email");
    localStorage.removeItem("auth_user_id");
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
