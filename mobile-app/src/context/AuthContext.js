import { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, TOKEN_KEY } from "../api/client";
import { registerPushTokenWithServer } from "../push";

const AuthContext = createContext(null);
const USER_KEY = "aifi_client_user";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(TOKEN_KEY), AsyncStorage.getItem(USER_KEY)]).then(([t, u]) => {
      setToken(t);
      setUser(u ? JSON.parse(u) : null);
      setBooting(false);
      if (t) {
        // Déjà connecté au démarrage de l'app : (ré)enregistre le token push
        registerPushTokenWithServer();
      }
    });
  }, []);

  const login = useCallback(async (phone, password) => {
    const { data } = await api.post("/auth/login", { phone, password });
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    registerPushTokenWithServer();
  }, []);

  const register = useCallback(async (name, phone, password, referralCode) => {
    const { data } = await api.post("/auth/register", {
      name, phone, password,
      referralCode: referralCode || undefined,
    });
    return data; // { id, referralCode }
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token,
        isAdmin: user?.role === "ADMIN",
        booting,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
