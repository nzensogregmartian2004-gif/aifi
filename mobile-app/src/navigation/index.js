import React, { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";
import { api } from "../api/client";

import OnboardingScreen, { ONBOARDING_SEEN_KEY } from "../screens/OnboardingScreen";
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import DashboardScreen from "../screens/DashboardScreen";
import AidRequestsScreen from "../screens/AidRequestsScreen";
import NewAidRequestScreen from "../screens/NewAidRequestScreen";
import WalletScreen from "../screens/WalletScreen";
import ReferralsScreen from "../screens/ReferralsScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import MessagesScreen from "../screens/MessagesScreen";

import AdminDashboardScreen from "../screens/admin/AdminDashboardScreen";
import AdminAidRequestsScreen from "../screens/admin/AdminAidRequestsScreen";
import AdminRepaymentDeclarationsScreen from "../screens/admin/AdminRepaymentDeclarationsScreen";
import AdminWithdrawalsScreen from "../screens/admin/AdminWithdrawalsScreen";
import AdminQuickDepositScreen from "../screens/admin/AdminQuickDepositScreen";
import AdminUsersScreen from "../screens/admin/AdminUsersScreen";
import AdminUserDetailScreen from "../screens/admin/AdminUserDetailScreen";
import AdminConversationsScreen from "../screens/admin/AdminConversationsScreen";
import AdminChatScreen from "../screens/admin/AdminChatScreen";
import AdminAuditLogScreen from "../screens/admin/AdminAuditLogScreen";

const RootStack = createNativeStackNavigator();
const AidStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const AdminUsersStack = createNativeStackNavigator();
const AdminMessagesStack = createNativeStackNavigator();
const AdminHomeStack = createNativeStackNavigator();
const AdminTab = createBottomTabNavigator();

function AidNavigator() {
  return (
    <AidStack.Navigator screenOptions={{ headerShown: false }}>
      <AidStack.Screen name="AidRequestsList" component={AidRequestsScreen} />
      <AidStack.Screen name="NewAidRequest" component={NewAidRequestScreen} />
    </AidStack.Navigator>
  );
}

function AdminUsersNavigator() {
  return (
    <AdminUsersStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminUsersStack.Screen name="AdminUsersList" component={AdminUsersScreen} />
      <AdminUsersStack.Screen name="AdminUserDetail" component={AdminUserDetailScreen} />
      <AdminUsersStack.Screen name="AdminChat" component={AdminChatScreen} />
    </AdminUsersStack.Navigator>
  );
}

function AdminMessagesNavigator() {
  return (
    <AdminMessagesStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminMessagesStack.Screen name="AdminConversationsList" component={AdminConversationsScreen} />
      <AdminMessagesStack.Screen name="AdminChat" component={AdminChatScreen} />
    </AdminMessagesStack.Navigator>
  );
}

function AdminHomeNavigator() {
  return (
    <AdminHomeStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminHomeStack.Screen name="AdminDashboardHome" component={AdminDashboardScreen} />
      <AdminHomeStack.Screen name="AdminDeclarations" component={AdminRepaymentDeclarationsScreen} />
      <AdminHomeStack.Screen name="AdminArchives" component={AdminAuditLogScreen} />
    </AdminHomeStack.Navigator>
  );
}

function AdminTabs() {
  return (
    <AdminTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: { backgroundColor: colors.ink, borderTopWidth: 0, height: 64, paddingBottom: 10, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: "600" },
      }}
    >
      <AdminTab.Screen name="AdminAccueil" component={AdminHomeNavigator} options={{ tabBarLabel: "Accueil" }} />
      <AdminTab.Screen name="AdminAides" component={AdminAidRequestsScreen} options={{ tabBarLabel: "Aides" }} />
      <AdminTab.Screen name="AdminDepot" component={AdminQuickDepositScreen} options={{ tabBarLabel: "Dépôt" }} />
      <AdminTab.Screen name="AdminRetraits" component={AdminWithdrawalsScreen} options={{ tabBarLabel: "Retraits" }} />
      <AdminTab.Screen name="AdminUtilisateurs" component={AdminUsersNavigator} options={{ tabBarLabel: "Clients" }} />
      <AdminTab.Screen name="AdminMessages" component={AdminMessagesNavigator} options={{ tabBarLabel: "Messages" }} />
      <AdminTab.Screen name="AdminProfil" component={ProfileScreen} options={{ tabBarLabel: "Profil" }} />
    </AdminTab.Navigator>
  );
}

function MainTabs() {
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications/unread-count");
      setUnread(data.count);
    } catch {
      // silencieux
    }
  }, []);

  useEffect(() => {
    refreshUnread();
    const id = setInterval(refreshUnread, 30000);
    return () => clearInterval(id);
  }, [refreshUnread]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: { backgroundColor: colors.ink, borderTopWidth: 0, height: 64, paddingBottom: 10, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarBadgeStyle: { backgroundColor: colors.gold, color: colors.ink },
      }}
      screenListeners={{
        tabPress: (e) => {
          if (e.target?.startsWith("Notifications")) {
            setTimeout(refreshUnread, 500);
          }
        },
      }}
    >
      <Tab.Screen name="Accueil" component={DashboardScreen} />
      <Tab.Screen name="Aides" component={AidNavigator} />
      <Tab.Screen name="Portefeuille" component={WalletScreen} />
      <Tab.Screen name="Parrainage" component={ReferralsScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ tabBarBadge: unread > 0 ? unread : undefined }}
      />
      <Tab.Screen name="Profil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { isAuthenticated, isAdmin, booting } = useAuth();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingSeen, setOnboardingSeen] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((value) => {
      setOnboardingSeen(!!value);
      setCheckingOnboarding(false);
    });
  }, []);

  if (booting || checkingOnboarding) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.ink }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          isAdmin ? (
            <RootStack.Screen name="Main" component={AdminTabs} />
          ) : (
            <>
              <RootStack.Screen name="Main" component={MainTabs} />
              <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
            </>
          )
        ) : (
          <>
            {!onboardingSeen && <RootStack.Screen name="Onboarding" component={OnboardingScreen} />}
            <RootStack.Screen name="Login" component={LoginScreen} />
            <RootStack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
