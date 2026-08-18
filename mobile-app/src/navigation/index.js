import React, { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
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
import AdminManageAdminsScreen from "../screens/admin/AdminManageAdminsScreen";
import AdminSettingsScreen from "../screens/admin/AdminSettingsScreen";

const RootStack = createNativeStackNavigator();
const AidStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const AdminUsersStack = createNativeStackNavigator();
const AdminMessagesStack = createNativeStackNavigator();
const AdminHomeStack = createNativeStackNavigator();
const AdminTab = createBottomTabNavigator();

const ADMIN_TAB_ICONS = {
  AdminAccueil: "home-outline",
  AdminAides: "cash-outline",
  AdminDepot: "arrow-down-circle-outline",
  AdminRetraits: "arrow-up-circle-outline",
  AdminUtilisateurs: "people-outline",
  AdminMessages: "chatbubbles-outline",
  AdminProfil: "person-circle-outline",
};

const CLIENT_TAB_ICONS = {
  Accueil: "home-outline",
  Aides: "cash-outline",
  Portefeuille: "wallet-outline",
  Parrainage: "people-outline",
  Messages: "chatbubbles-outline",
  Notifications: "notifications-outline",
  Profil: "person-circle-outline",
};

function makeTabBarIcon(iconName) {
  return ({ color, size }) => <Ionicons name={iconName} size={size} color={color} />;
}

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
      <AdminTab.Screen
        name="AdminAccueil"
        component={AdminHomeNavigator}
        options={{ tabBarLabel: "Accueil", tabBarIcon: makeTabBarIcon(ADMIN_TAB_ICONS.AdminAccueil) }}
      />
      <AdminTab.Screen
        name="AdminAides"
        component={AdminAidRequestsScreen}
        options={{ tabBarLabel: "Aides", tabBarIcon: makeTabBarIcon(ADMIN_TAB_ICONS.AdminAides) }}
      />
      <AdminTab.Screen
        name="AdminDepot"
        component={AdminQuickDepositScreen}
        options={{ tabBarLabel: "Dépôt", tabBarIcon: makeTabBarIcon(ADMIN_TAB_ICONS.AdminDepot) }}
      />
      <AdminTab.Screen
        name="AdminRetraits"
        component={AdminWithdrawalsScreen}
        options={{ tabBarLabel: "Retraits", tabBarIcon: makeTabBarIcon(ADMIN_TAB_ICONS.AdminRetraits) }}
      />
      <AdminTab.Screen
        name="AdminUtilisateurs"
        component={AdminUsersNavigator}
        options={{ tabBarLabel: "Clients", tabBarIcon: makeTabBarIcon(ADMIN_TAB_ICONS.AdminUtilisateurs) }}
      />
      <AdminTab.Screen
        name="AdminMessages"
        component={AdminMessagesNavigator}
        options={{ tabBarLabel: "Messages", tabBarIcon: makeTabBarIcon(ADMIN_TAB_ICONS.AdminMessages) }}
      />
      <AdminTab.Screen
        name="AdminProfil"
        component={ProfileScreen}
        options={{ tabBarLabel: "Profil", tabBarIcon: makeTabBarIcon(ADMIN_TAB_ICONS.AdminProfil) }}
      />
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
      <Tab.Screen name="Accueil" component={DashboardScreen} options={{ tabBarIcon: makeTabBarIcon(CLIENT_TAB_ICONS.Accueil) }} />
      <Tab.Screen name="Aides" component={AidNavigator} options={{ tabBarIcon: makeTabBarIcon(CLIENT_TAB_ICONS.Aides) }} />
      <Tab.Screen name="Portefeuille" component={WalletScreen} options={{ tabBarIcon: makeTabBarIcon(CLIENT_TAB_ICONS.Portefeuille) }} />
      <Tab.Screen name="Parrainage" component={ReferralsScreen} options={{ tabBarIcon: makeTabBarIcon(CLIENT_TAB_ICONS.Parrainage) }} />
      <Tab.Screen name="Messages" component={MessagesScreen} options={{ tabBarIcon: makeTabBarIcon(CLIENT_TAB_ICONS.Messages) }} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ tabBarBadge: unread > 0 ? unread : undefined, tabBarIcon: makeTabBarIcon(CLIENT_TAB_ICONS.Notifications) }}
      />
      <Tab.Screen name="Profil" component={ProfileScreen} options={{ tabBarIcon: makeTabBarIcon(CLIENT_TAB_ICONS.Profil) }} />
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
            <>
              <RootStack.Screen name="Main" component={AdminTabs} />
              <RootStack.Screen name="AdminManageAdmins" component={AdminManageAdminsScreen} />
              <RootStack.Screen name="AdminSettings" component={AdminSettingsScreen} />
            </>
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
