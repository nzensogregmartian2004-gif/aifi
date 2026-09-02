import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

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
import PremiumScreen from "../screens/PremiumScreen";

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
  Portefeuille: "wallet-outline",
  Parrainage: "people-outline",
  Profil: "person-circle-outline",
};

function makeTabBarIcon(iconName) {
  return ({ color, size }) => <Ionicons name={iconName} size={size} color={color} />;
}

// Bouton central surélevé pour l'onglet Messages — c'est ici que se joue la
// relation admin/client, donc on le distingue visuellement du reste de la
// barre plutôt que d'en faire un simple onglet parmi d'autres.
function CenterMessagesButton({ children, onPress, accessibilityState }) {
  const focused = accessibilityState?.selected;
  return (
    <Pressable onPress={onPress} style={centerStyles.wrap}>
      <View style={[centerStyles.bubble, focused && centerStyles.bubbleFocused]}>{children}</View>
    </Pressable>
  );
}

const centerStyles = StyleSheet.create({
  wrap: { top: -18, alignItems: "center", justifyContent: "center" },
  bubble: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.gold,
    alignItems: "center", justifyContent: "center",
    shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6,
    borderWidth: 4, borderColor: colors.paper,
  },
  bubbleFocused: { backgroundColor: colors.ink, borderColor: colors.paper },
});

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
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: {
          backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: colors.line,
          height: 64, paddingBottom: 10, paddingTop: 8,
          shadowColor: colors.ink, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, elevation: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tab.Screen name="Accueil" component={DashboardScreen} options={{ tabBarIcon: makeTabBarIcon(CLIENT_TAB_ICONS.Accueil) }} />
      <Tab.Screen name="Portefeuille" component={WalletScreen} options={{ tabBarIcon: makeTabBarIcon(CLIENT_TAB_ICONS.Portefeuille) }} />
      {/* Bouton central, seul vrai "5ème" logique de la barre — la demande
          d'aide se fait déjà depuis le tableau de bord, donc "Aides" n'a plus
          besoin d'être un onglet séparé ici (elle reste accessible via les
          boutons du dashboard, voir RootStack ci-dessous). */}
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          tabBarLabel: "",
          tabBarIcon: () => <Ionicons name="chatbubble-ellipses" size={24} color={colors.white} />,
          tabBarButton: (props) => <CenterMessagesButton {...props} />,
        }}
      />
      <Tab.Screen name="Parrainage" component={ReferralsScreen} options={{ tabBarIcon: makeTabBarIcon(CLIENT_TAB_ICONS.Parrainage) }} />
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
              <RootStack.Screen name="Notifications" component={NotificationsScreen} />
              <RootStack.Screen name="Aides" component={AidNavigator} />
              <RootStack.Screen name="Premium" component={PremiumScreen} />
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
