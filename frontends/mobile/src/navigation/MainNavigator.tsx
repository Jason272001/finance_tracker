import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, List, CreditCard, Settings as SettingsIcon, MessageCircle, Briefcase } from 'lucide-react-native';
import { useAppMode } from '../context/AppModeContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { LoadingView } from '../components/LoadingView';
import { AuthScreen } from '../screens/AuthScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { TransactionsScreen } from '../screens/TransactionsScreen';
import { AccountsScreen } from '../screens/AccountsScreen';
import { BusinessScreen } from '../screens/BusinessScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SupportScreen } from '../screens/SupportScreen';

const Tab = createBottomTabNavigator();

const TabNavigator = () => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { mode, isBusinessMode } = useAppMode();

  return (
    <Tab.Navigator
      key={mode}
      initialRouteName={isBusinessMode ? 'Business' : 'Home'}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.cardBg,
          borderTopColor: theme.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.primaryStart,
        tabBarInactiveTintColor: theme.muted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
        },
      }}
    >
      {!isBusinessMode ? (
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: t('tab.home'),
            tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
          }}
        />
      ) : null}
      {!isBusinessMode ? (
        <>
          <Tab.Screen
            name="Transactions"
            component={TransactionsScreen}
            options={{
              title: t('tab.transactions'),
              tabBarIcon: ({ color, size }) => <List color={color} size={size} />,
            }}
          />
          <Tab.Screen
            name="Accounts"
            component={AccountsScreen}
            options={{
              title: t('tab.accounts'),
              tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} />,
            }}
          />
        </>
      ) : null}
      {isBusinessMode ? (
        <Tab.Screen
          name="Business"
          component={BusinessScreen}
          options={{
            title: t('tab.business'),
            tabBarIcon: ({ color, size }) => <Briefcase color={color} size={size} />,
          }}
        />
      ) : null}
      <Tab.Screen
        name="Support"
        component={SupportScreen}
        options={{
          title: t('tab.support'),
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: t('tab.settings'),
          tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
};

export const MainNavigator = () => {
  const { isReady, isAuthenticated } = useAuth();
  const { isReady: themeReady } = useTheme();
  const { isReady: languageReady, t } = useLanguage();
  const { isReady: modeReady } = useAppMode();

  if (!isReady || !themeReady || !languageReady || !modeReady) {
    return <LoadingView message={t('app.loading')} />;
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <TabNavigator /> : <AuthScreen />}
    </NavigationContainer>
  );
};
