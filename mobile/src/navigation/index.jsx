import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import { Text, View }                 from 'react-native';
import { useAuth }                    from '../context/AuthContext';
import { COLORS }                     from '../theme';

import { LoginScreen, RegisterScreen } from '../screens/auth/AuthScreens';
import MapScreen        from '../screens/MapScreen';
import ScheduleScreen, { SearchScreen, NotifScreen, ProfileScreen } from '../screens/ScheduleScreen';
import ChatScreen       from '../screens/ChatScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const TAB_ICONS = { Map:'🗺️', Schedule:'📅', Chat:'🤖', Alerts:'🔔', Profile:'👤' };

function TabIcon({ name, focused }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{TAB_ICONS[name]}</Text>;
}

function StudentTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: COLORS.najahBlue,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: { backgroundColor: COLORS.panel, borderTopColor: COLORS.border, borderTopWidth: 1, height: 60, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      })}
    >
      <Tab.Screen name="Map"      component={MapScreen} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} />
      <Tab.Screen name="Chat"     component={ChatScreen} />
      <Tab.Screen name="Alerts"   component={NotifScreen} />
      <Tab.Screen name="Profile"  component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login"    component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.najahBlue }}>
        <Text style={{ color: COLORS.gold, fontSize: 28, fontWeight: '700' }}>AN</Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 8, fontSize: 13 }}>Smart Campus</Text>
      </View>
    );
  }
  return isAuthenticated ? <StudentTabs /> : <AuthStack />;
}
