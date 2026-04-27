import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { ModeSwitch } from '../components/ModeSwitch';
import { OptionSelect } from '../components/OptionSelect';
import { WEB_BASE_URL } from '../constants/config';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { businessApi, getApiErrorInfo } from '../services/api';
import { BusinessEmployeeRecord, BusinessPermissions, BusinessRecord } from '../types/app';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/theme';
import { formatPlanName } from '../utils/format';

const emptyPermissions = (): BusinessPermissions => ({
  can_sales: false,
  can_purchase: false,
  can_inventory: false,
  can_reports: false,
  can_customers: false,
  can_suppliers: false,
  can_settings: false,
});

const roleDefaults: Record<string, BusinessPermissions> = {
  owner: {
    can_sales: true,
    can_purchase: true,
    can_inventory: true,
    can_reports: true,
    can_customers: true,
    can_suppliers: true,
    can_settings: true,
  },
  manager: {
    can_sales: true,
    can_purchase: true,
    can_inventory: true,
    can_reports: true,
    can_customers: true,
    can_suppliers: true,
    can_settings: true,
  },
  sales: {
    can_sales: true,
    can_purchase: false,
    can_inventory: false,
    can_reports: false,
    can_customers: true,
    can_suppliers: false,
    can_settings: false,
  },
  purchase: {
    can_sales: false,
    can_purchase: true,
    can_inventory: true,
    can_reports: false,
    can_customers: false,
    can_suppliers: true,
    can_settings: false,
  },
  inventory: {
    can_sales: false,
    can_purchase: false,
    can_inventory: true,
    can_reports: false,
    can_customers: false,
    can_suppliers: false,
    can_settings: false,
  },
  accountant: {
    can_sales: false,
    can_purchase: true,
    can_inventory: false,
    can_reports: true,
    can_customers: false,
    can_suppliers: true,
    can_settings: false,
  },
  staff: emptyPermissions(),
};

const permissionKeys: Array<keyof BusinessPermissions> = [
  'can_sales',
  'can_purchase',
  'can_inventory',
  'can_reports',
  'can_customers',
  'can_suppliers',
  'can_settings',
];

const businessTypeOptions = [
  { value: 'retail', label: 'Retail' },
  { value: 'service', label: 'Service' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'education', label: 'Education' },
  { value: 'other', label: 'Other' },
];

const roleOptions = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'sales', label: 'Sales' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'staff', label: 'Staff' },
];

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const moduleDefinitions = [
  {
    key: 'business_page',
    title: 'Business Page',
    description: 'Public page with business details, services, hours, and contact information.',
  },
  {
    key: 'business_website',
    title: 'Starter Website',
    description: 'Small business website bundle connected to your business workspace.',
  },
  {
    key: 'employee_management',
    title: 'Employee Access',
    description: 'Manage employee roles, permissions, and team access from mobile.',
  },
  {
    key: 'sales_tools',
    title: 'Sales Tools',
    description: 'POS and sales workflows are unlocked for your business workspace.',
  },
  {
    key: 'purchase_tools',
    title: 'Purchase Tools',
    description: 'Track purchasing and supplier workflows under the business plan.',
  },
  {
    key: 'customer_records',
    title: 'Customer Records',
    description: 'Customer management is included with the business workspace foundation.',
  },
  {
    key: 'supplier_records',
    title: 'Supplier Records',
    description: 'Keep supplier details and purchasing contacts organized.',
  },
  {
    key: 'product_catalog',
    title: 'Products and Inventory',
    description: 'Product and inventory support is enabled for business-capable plans.',
  },
];

export const BusinessScreen: React.FC = () => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [businesses, setBusinesses] = useState<BusinessRecord[]>([]);
  const [employees, setEmployees] = useState<BusinessEmployeeRecord[]>([]);
  const [maxBusinesses, setMaxBusinesses] = useState(0);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [businessMessage, setBusinessMessage] = useState<string | null>(null);
  const [businessMessageIsError, setBusinessMessageIsError] = useState(false);
  const [employeeMessage, setEmployeeMessage] = useState<string | null>(null);
  const [employeeMessageIsError, setEmployeeMessageIsError] = useState(false);
  const [submittingBusiness, setSubmittingBusiness] = useState(false);
  const [submittingEmployee, setSubmittingEmployee] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('service');
  const [industry, setIndustry] = useState('');
  const [pageSlug, setPageSlug] = useState('');
  const [websiteSlug, setWebsiteSlug] = useState('');
  const [aboutText, setAboutText] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [pageEnabled, setPageEnabled] = useState(true);
  const [websiteEnabled, setWebsiteEnabled] = useState(true);

  const [employeeName, setEmployeeName] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeePhone, setEmployeePhone] = useState('');
  const [employeeRole, setEmployeeRole] = useState('staff');
  const [employeeStatus, setEmployeeStatus] = useState('active');
  const [employeePermissions, setEmployeePermissions] = useState<BusinessPermissions>(emptyPermissions());

  const planName = formatPlanName(user?.plan_code, Boolean(user?.is_lifetime));
  const featureFlags = user?.feature_flags ?? {};
  const businessUnlocked = Boolean(user?.is_lifetime || featureFlags.business_profile);
  const employeeUnlocked = Boolean(user?.is_lifetime || featureFlags.employee_management);

  const selectedBusiness = useMemo(
    () => businesses.find((item) => String(item.business_id) === selectedBusinessId) ?? null,
    [businesses, selectedBusinessId]
  );
  const selectedEmployee = useMemo(
    () => employees.find((item) => String(item.employee_id) === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId]
  );

  const canEditBusiness = !selectedBusiness || Boolean(selectedBusiness.is_owner);
  const canManageEmployees = Boolean(
    selectedBusiness &&
    employeeUnlocked &&
    (selectedBusiness.is_owner || selectedBusiness.permissions?.can_settings)
  );

  const businessOptions = useMemo(
    () => businesses.map((item) => ({ value: String(item.business_id), label: item.business_name })),
    [businesses]
  );

  const employeeOptions = useMemo(
    () =>
      employees.map((item) => ({
        value: String(item.employee_id),
        label: `${item.employee_name} (${item.role_code})`,
      })),
    [employees]
  );

  const availableRoleOptions = useMemo(() => {
    if (selectedBusiness?.is_owner) return roleOptions;
    return roleOptions.filter((item) => item.value !== 'owner' && item.value !== 'manager');
  }, [selectedBusiness?.is_owner]);

  const permissionLabels: Record<keyof BusinessPermissions, string> = useMemo(
    () => ({
      can_sales: t('business.permissionSales'),
      can_purchase: t('business.permissionPurchase'),
      can_inventory: t('business.permissionInventory'),
      can_reports: t('business.permissionReports'),
      can_customers: t('business.permissionCustomers'),
      can_suppliers: t('business.permissionSuppliers'),
      can_settings: t('business.permissionSettings'),
    }),
    [t]
  );

  const resetBusinessForm = useCallback((business?: BusinessRecord | null) => {
    setBusinessName(business?.business_name ?? '');
    setBusinessType(business?.business_type || 'service');
    setIndustry(business?.industry ?? '');
    setPageSlug(business?.page_slug ?? '');
    setWebsiteSlug(business?.website_slug ?? '');
    setAboutText(business?.about_text ?? '');
    setPhone(business?.phone ?? '');
    setEmail(business?.email ?? user?.email ?? '');
    setAddress(business?.address ?? '');
    setLogoUrl(business?.logo_url ?? '');
    setCoverUrl(business?.cover_url ?? '');
    setPageEnabled(business?.page_enabled ?? true);
    setWebsiteEnabled(business?.website_enabled ?? true);
  }, [user?.email]);

  const resetEmployeeForm = useCallback((employee?: BusinessEmployeeRecord | null) => {
    setEmployeeName(employee?.employee_name ?? '');
    setEmployeeEmail(employee?.email ?? '');
    setEmployeePhone(employee?.phone ?? '');
    setEmployeeRole(employee?.role_code ?? 'staff');
    setEmployeeStatus(employee?.status ?? 'active');
    setEmployeePermissions(employee?.permissions ?? roleDefaults.staff);
  }, []);

  const loadBusinesses = useCallback(async () => {
    if (!user?.user_id || !businessUnlocked) {
      setBusinesses([]);
      setEmployees([]);
      setSelectedBusinessId(null);
      setSelectedEmployeeId(null);
      setMaxBusinesses(0);
      return;
    }

    try {
      const response = await businessApi.getBusinesses(user.user_id);
      setBusinesses(response.items);
      setMaxBusinesses(response.max_businesses);
      setSelectedBusinessId((current) => {
        if (current && response.items.some((item) => String(item.business_id) === current)) {
          return current;
        }
        return response.items[0] ? String(response.items[0].business_id) : null;
      });
      setStatusMessage(null);
    } catch (error) {
      setStatusMessage(getApiErrorInfo(error).message);
    }
  }, [businessUnlocked, user?.user_id]);

  const loadEmployees = useCallback(async () => {
    if (!user?.user_id || !selectedBusinessId || !employeeUnlocked) {
      setEmployees([]);
      return;
    }

    try {
      const response = await businessApi.getEmployees(Number(selectedBusinessId), user.user_id);
      setEmployees(response.items);
      setStatusMessage(null);
    } catch (error) {
      setEmployees([]);
      setStatusMessage(getApiErrorInfo(error).message);
    }
  }, [employeeUnlocked, selectedBusinessId, user?.user_id]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  useEffect(() => {
    if (selectedBusinessId) {
      loadEmployees();
    } else {
      setEmployees([]);
      setSelectedEmployeeId(null);
    }
  }, [loadEmployees, selectedBusinessId]);

  useEffect(() => {
    resetBusinessForm(selectedBusiness);
    setBusinessMessage(null);
  }, [resetBusinessForm, selectedBusiness]);

  useEffect(() => {
    resetEmployeeForm(selectedEmployee);
    setEmployeeMessage(null);
  }, [resetEmployeeForm, selectedEmployee]);

  useEffect(() => {
    if (!selectedBusinessId) {
      resetEmployeeForm(null);
      setSelectedEmployeeId(null);
    }
  }, [resetEmployeeForm, selectedBusinessId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBusinesses();
    setRefreshing(false);
  }, [loadBusinesses]);

  const handleSaveBusiness = useCallback(async () => {
    if (!user?.user_id) return;

    const name = businessName.trim();
    if (!name) {
      setBusinessMessage(t('business.nameRequired'));
      setBusinessMessageIsError(true);
      return;
    }

    const payload = {
      user_id: user.user_id,
      business_name: name,
      business_type: businessType,
      industry: industry.trim(),
      page_slug: pageSlug.trim(),
      website_slug: websiteSlug.trim(),
      about_text: aboutText.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      logo_url: logoUrl.trim(),
      cover_url: coverUrl.trim(),
      page_enabled: pageEnabled,
      website_enabled: websiteEnabled,
    };

    try {
      setSubmittingBusiness(true);
      if (selectedBusinessId) {
        const response = await businessApi.updateBusiness(Number(selectedBusinessId), payload);
        setSelectedBusinessId(String(response.business.business_id));
        setBusinessMessage(t('business.savedBusiness'));
      } else {
        const response = await businessApi.createBusiness(payload);
        setSelectedBusinessId(String(response.business.business_id));
        setBusinessMessage(t('business.createdBusiness'));
      }
      setBusinessMessageIsError(false);
      await loadBusinesses();
    } catch (error) {
      setBusinessMessage(getApiErrorInfo(error).message);
      setBusinessMessageIsError(true);
    } finally {
      setSubmittingBusiness(false);
    }
  }, [
    aboutText,
    businessName,
    businessType,
    coverUrl,
    email,
    industry,
    loadBusinesses,
    logoUrl,
    pageEnabled,
    pageSlug,
    phone,
    selectedBusinessId,
    t,
    user?.user_id,
    websiteEnabled,
    websiteSlug,
    address,
  ]);

  const handleRoleChange = useCallback((nextRole: string) => {
    setEmployeeRole(nextRole);
    setEmployeePermissions(roleDefaults[nextRole] ?? emptyPermissions());
  }, []);

  const handleSaveEmployee = useCallback(async () => {
    if (!user?.user_id || !selectedBusinessId) return;

    const name = employeeName.trim();
    if (!name) {
      setEmployeeMessage(t('business.employeeNameRequired'));
      setEmployeeMessageIsError(true);
      return;
    }

    const payload = {
      user_id: user.user_id,
      employee_name: name,
      email: employeeEmail.trim(),
      phone: employeePhone.trim(),
      role_code: employeeRole,
      status: employeeStatus,
      ...employeePermissions,
    };

    try {
      setSubmittingEmployee(true);
      if (selectedEmployeeId) {
        const response = await businessApi.updateEmployee(
          Number(selectedBusinessId),
          Number(selectedEmployeeId),
          payload
        );
        setSelectedEmployeeId(String(response.employee.employee_id));
        setEmployeeMessage(t('business.employeeSaved'));
      } else {
        const response = await businessApi.createEmployee(Number(selectedBusinessId), payload);
        setSelectedEmployeeId(String(response.employee.employee_id));
        setEmployeeMessage(t('business.employeeCreated'));
      }
      setEmployeeMessageIsError(false);
      await loadEmployees();
    } catch (error) {
      setEmployeeMessage(getApiErrorInfo(error).message);
      setEmployeeMessageIsError(true);
    } finally {
      setSubmittingEmployee(false);
    }
  }, [
    employeeEmail,
    employeeName,
    employeePermissions,
    employeePhone,
    employeeRole,
    employeeStatus,
    loadEmployees,
    selectedBusinessId,
    selectedEmployeeId,
    t,
    user?.user_id,
  ]);

  const confirmDeleteEmployee = useCallback((employee: BusinessEmployeeRecord) => {
    if (!user?.user_id || !selectedBusinessId) return;

    Alert.alert(
      t('business.deleteEmployeeTitle'),
      t('business.deleteEmployeeMessage', { name: employee.employee_name }),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('business.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await businessApi.deleteEmployee(Number(selectedBusinessId), employee.employee_id, user.user_id);
              setEmployeeMessage(t('business.employeeDeleted'));
              setEmployeeMessageIsError(false);
              if (selectedEmployeeId === String(employee.employee_id)) {
                setSelectedEmployeeId(null);
              }
              await loadEmployees();
            } catch (error) {
              setEmployeeMessage(getApiErrorInfo(error).message);
              setEmployeeMessageIsError(true);
            }
          },
        },
      ]
    );
  }, [loadEmployees, selectedBusinessId, selectedEmployeeId, t, user?.user_id]);

  const moduleCards = useMemo(
    () =>
      moduleDefinitions.map((item) => ({
        ...item,
        enabled: Boolean(user?.is_lifetime || featureFlags[item.key as keyof typeof featureFlags]),
      })),
    [featureFlags, user?.is_lifetime]
  );

  if (!businessUnlocked) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.bgTop }]}
        contentContainerStyle={styles.content}
      >
        <Card>
          <Text style={[styles.heading, { color: theme.heading }]}>{t('business.heading')}</Text>
          <Text style={[styles.subheading, { color: theme.muted }]}>{t('business.lockedMessage')}</Text>
          <Text style={[styles.planLine, { color: theme.text }]}>
            {t('business.currentPlan', { plan: planName })}
          </Text>
          <View style={styles.buttonRow}>
            <Button
              title={t('business.openWebsite')}
              onPress={() => Linking.openURL(`${WEB_BASE_URL}/?mobile=1`)}
              style={styles.halfButton}
            />
            <Button
              title={t('business.contactSupport')}
              variant="outline"
              onPress={() => Linking.openURL('mailto:support@keeperbma.com')}
              style={styles.halfButton}
            />
          </View>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bgTop }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryStart} />}
    >
      <ModeSwitch />

      <Card>
        <Text style={[styles.heading, { color: theme.heading }]}>{t('business.heading')}</Text>
        <Text style={[styles.subheading, { color: theme.muted }]}>{t('business.subheading')}</Text>
        <Text style={[styles.planLine, { color: theme.text }]}>{t('business.currentPlan', { plan: planName })}</Text>
        <Text style={[styles.helperText, { color: theme.muted }]}>
          {user?.is_lifetime ? t('business.lifetimeUnlocked') : t('business.phoneWorkspaceNote')}
        </Text>
        <View style={styles.buttonRow}>
          <Button
            title={t('business.openWebsite')}
            onPress={() => Linking.openURL(`${WEB_BASE_URL}/?mobile=1`)}
            style={styles.halfButton}
          />
          <Button
            title={t('business.openSupport')}
            variant="outline"
            onPress={() => Linking.openURL('mailto:support@keeperbma.com')}
            style={styles.halfButton}
          />
        </View>
      </Card>

      {statusMessage ? (
        <Card>
          <Text style={[styles.feedbackText, { color: theme.dangerStart }]}>{statusMessage}</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>{t('business.workspaceTitle')}</Text>
        <Text style={[styles.sectionCaption, { color: theme.muted }]}>
          {t('business.workspaceCaption', { count: maxBusinesses || 1 })}
        </Text>
        {businessOptions.length ? (
          <OptionSelect
            label={t('business.selectWorkspace')}
            placeholder={t('business.selectWorkspace')}
            value={selectedBusinessId}
            options={businessOptions}
            onChange={setSelectedBusinessId}
          />
        ) : null}
        {!selectedBusiness && maxBusinesses > 0 ? (
          <Text style={[styles.helperText, { color: theme.secondaryStart }]}>{t('business.createFirst')}</Text>
        ) : null}
        {selectedBusiness && !selectedBusiness.is_owner ? (
          <Text style={[styles.helperText, { color: theme.muted }]}>
            {t('business.readOnlyMessage', { role: selectedBusiness.access_role ?? 'staff' })}
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>
          {selectedBusiness ? t('business.editBusinessTitle') : t('business.createBusinessTitle')}
        </Text>
        <Input
          label={t('business.businessName')}
          placeholder={t('business.businessName')}
          value={businessName}
          onChangeText={setBusinessName}
          editable={canEditBusiness}
        />
        <OptionSelect
          label={t('business.businessType')}
          placeholder={t('business.businessType')}
          value={businessType}
          options={businessTypeOptions}
          onChange={setBusinessType}
          disabled={!canEditBusiness}
        />
        <Input
          label={t('business.industry')}
          placeholder={t('business.industry')}
          value={industry}
          onChangeText={setIndustry}
          editable={canEditBusiness}
        />
        <Input
          label={t('business.phone')}
          placeholder={t('business.phone')}
          value={phone}
          onChangeText={setPhone}
          editable={canEditBusiness}
        />
        <Input
          label={t('business.email')}
          placeholder={t('business.email')}
          value={email}
          onChangeText={setEmail}
          editable={canEditBusiness}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label={t('business.address')}
          placeholder={t('business.address')}
          value={address}
          onChangeText={setAddress}
          editable={canEditBusiness}
        />
        <Input
          label={t('business.pageSlug')}
          placeholder="your-business-page"
          value={pageSlug}
          onChangeText={setPageSlug}
          editable={canEditBusiness}
          autoCapitalize="none"
        />
        <Input
          label={t('business.websiteSlug')}
          placeholder="your-business-site"
          value={websiteSlug}
          onChangeText={setWebsiteSlug}
          editable={canEditBusiness}
          autoCapitalize="none"
        />
        <Input
          label={t('business.logoUrl')}
          placeholder="https://..."
          value={logoUrl}
          onChangeText={setLogoUrl}
          editable={canEditBusiness}
          autoCapitalize="none"
        />
        <Input
          label={t('business.coverUrl')}
          placeholder="https://..."
          value={coverUrl}
          onChangeText={setCoverUrl}
          editable={canEditBusiness}
          autoCapitalize="none"
        />
        <Input
          label={t('business.about')}
          placeholder={t('business.aboutPlaceholder')}
          value={aboutText}
          onChangeText={setAboutText}
          editable={canEditBusiness}
          multiline
          style={styles.textArea}
        />

        <View style={styles.toggleRow}>
          <View style={styles.toggleBody}>
            <Text style={[styles.toggleTitle, { color: theme.text }]}>{t('business.enablePage')}</Text>
            <Text style={[styles.toggleText, { color: theme.muted }]}>{t('business.enablePageHint')}</Text>
          </View>
          <Switch
            value={pageEnabled}
            onValueChange={setPageEnabled}
            disabled={!canEditBusiness}
            thumbColor="#ffffff"
            trackColor={{ false: theme.borderStrong, true: theme.secondaryStart }}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleBody}>
            <Text style={[styles.toggleTitle, { color: theme.text }]}>{t('business.enableWebsite')}</Text>
            <Text style={[styles.toggleText, { color: theme.muted }]}>{t('business.enableWebsiteHint')}</Text>
          </View>
          <Switch
            value={websiteEnabled}
            onValueChange={setWebsiteEnabled}
            disabled={!canEditBusiness}
            thumbColor="#ffffff"
            trackColor={{ false: theme.borderStrong, true: theme.secondaryStart }}
          />
        </View>

        {businessMessage ? (
          <Text style={[styles.feedbackText, { color: businessMessageIsError ? theme.dangerStart : theme.secondaryStart }]}>
            {businessMessage}
          </Text>
        ) : null}

        <Button
          title={
            submittingBusiness
              ? t('business.savingBusiness')
              : selectedBusiness
                ? t('business.saveBusiness')
                : t('business.createBusiness')
          }
          onPress={handleSaveBusiness}
          disabled={submittingBusiness || !canEditBusiness}
        />
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>{t('business.moduleTitle')}</Text>
        <Text style={[styles.sectionCaption, { color: theme.muted }]}>{t('business.moduleCaption')}</Text>
        <View style={styles.moduleGrid}>
          {moduleCards.map((item) => (
            <View
              key={item.key}
              style={[
                styles.moduleCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: item.enabled ? theme.secondaryStart : theme.border,
                },
              ]}
            >
              <Text style={[styles.moduleTitle, { color: theme.heading }]}>{item.title}</Text>
              <Text
                style={[
                  styles.moduleBadge,
                  { color: item.enabled ? theme.secondaryStart : theme.muted },
                ]}
              >
                {item.enabled ? t('business.included') : t('business.locked')}
              </Text>
              <Text style={[styles.moduleDescription, { color: theme.muted }]}>{item.description}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>{t('business.employeeTitle')}</Text>
        <Text style={[styles.sectionCaption, { color: theme.muted }]}>{t('business.employeeCaption')}</Text>
        {!selectedBusiness ? (
          <EmptyState
            title={t('business.noBusinessTitle')}
            message={t('business.noBusinessMessage')}
          />
        ) : !employeeUnlocked ? (
          <EmptyState
            title={t('business.employeeLockedTitle')}
            message={t('business.employeeLockedMessage')}
          />
        ) : !canManageEmployees ? (
          <EmptyState
            title={t('business.employeeReadOnlyTitle')}
            message={t('business.employeeReadOnlyMessage')}
          />
        ) : (
          <>
            {employeeOptions.length ? (
              <OptionSelect
                label={t('business.selectEmployee')}
                placeholder={t('business.selectEmployee')}
                value={selectedEmployeeId}
                options={employeeOptions}
                onChange={setSelectedEmployeeId}
              />
            ) : null}
            <Input
              label={t('business.employeeName')}
              placeholder={t('business.employeeName')}
              value={employeeName}
              onChangeText={setEmployeeName}
            />
            <Input
              label={t('business.employeeEmail')}
              placeholder={t('business.employeeEmail')}
              value={employeeEmail}
              onChangeText={setEmployeeEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              label={t('business.employeePhone')}
              placeholder={t('business.employeePhone')}
              value={employeePhone}
              onChangeText={setEmployeePhone}
            />
            <OptionSelect
              label={t('business.employeeRole')}
              placeholder={t('business.employeeRole')}
              value={employeeRole}
              options={availableRoleOptions}
              onChange={handleRoleChange}
            />
            <OptionSelect
              label={t('business.employeeStatus')}
              placeholder={t('business.employeeStatus')}
              value={employeeStatus}
              options={statusOptions}
              onChange={setEmployeeStatus}
            />

            <View style={styles.permissionBlock}>
              <Text style={[styles.permissionTitle, { color: theme.heading }]}>{t('business.permissionTitle')}</Text>
              {permissionKeys.map((key) => (
                <View key={key} style={styles.toggleRow}>
                  <View style={styles.toggleBody}>
                    <Text style={[styles.toggleTitle, { color: theme.text }]}>{permissionLabels[key]}</Text>
                  </View>
                  <Switch
                    value={employeePermissions[key]}
                    onValueChange={(value) =>
                      setEmployeePermissions((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                    disabled={!selectedBusiness?.is_owner && key === 'can_settings'}
                    thumbColor="#ffffff"
                    trackColor={{ false: theme.borderStrong, true: theme.primaryStart }}
                  />
                </View>
              ))}
            </View>

            {employeeMessage ? (
              <Text style={[styles.feedbackText, { color: employeeMessageIsError ? theme.dangerStart : theme.secondaryStart }]}>
                {employeeMessage}
              </Text>
            ) : null}

            <View style={styles.buttonRow}>
              <Button
                title={
                  submittingEmployee
                    ? t('business.savingEmployee')
                    : selectedEmployee
                      ? t('business.saveEmployee')
                      : t('business.addEmployee')
                }
                onPress={handleSaveEmployee}
                disabled={submittingEmployee}
                style={styles.halfButton}
              />
              <Button
                title={selectedEmployee ? t('business.delete') : t('business.clearEmployee')}
                variant={selectedEmployee ? 'danger' : 'outline'}
                onPress={() => {
                  if (selectedEmployee) {
                    confirmDeleteEmployee(selectedEmployee);
                    return;
                  }
                  setSelectedEmployeeId(null);
                  resetEmployeeForm(null);
                }}
                style={styles.halfButton}
              />
            </View>

            <View style={styles.employeeList}>
              {employees.length ? (
                employees.map((item) => (
                  <View key={item.employee_id} style={[styles.employeeRow, { borderBottomColor: theme.border }]}>
                    <View style={styles.employeeBody}>
                      <Text style={[styles.employeeName, { color: theme.text }]}>{item.employee_name}</Text>
                      <Text style={[styles.employeeMeta, { color: theme.muted }]}>
                        {item.role_code} | {item.status}
                      </Text>
                    </View>
                    <Button
                      title={selectedEmployeeId === String(item.employee_id) ? t('business.editing') : t('business.edit')}
                      variant="outline"
                      onPress={() => setSelectedEmployeeId(String(item.employee_id))}
                    />
                  </View>
                ))
              ) : (
                <EmptyState title={t('business.noEmployeesTitle')} message={t('business.noEmployeesMessage')} />
              )}
            </View>
          </>
        )}
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  heading: { ...typography.h2 },
  subheading: { ...typography.body, marginTop: spacing.xs },
  planLine: { ...typography.body, fontWeight: '700', marginTop: spacing.md },
  helperText: { ...typography.caption, marginTop: spacing.sm },
  sectionTitle: { ...typography.h3, marginBottom: spacing.xs },
  sectionCaption: { ...typography.caption, marginBottom: spacing.md },
  feedbackText: { ...typography.body, marginBottom: spacing.md },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  halfButton: { flex: 1 },
  textArea: { minHeight: 108, textAlignVertical: 'top', paddingTop: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  toggleBody: { flex: 1 },
  toggleTitle: { ...typography.body, fontWeight: '700' },
  toggleText: { ...typography.caption, marginTop: spacing.xs },
  moduleGrid: { gap: spacing.sm },
  moduleCard: { borderWidth: 1, borderRadius: 14, padding: spacing.md },
  moduleTitle: { ...typography.body, fontWeight: '700' },
  moduleBadge: { ...typography.caption, fontWeight: '700', marginTop: spacing.xs },
  moduleDescription: { ...typography.caption, marginTop: spacing.sm },
  permissionBlock: { marginBottom: spacing.md },
  permissionTitle: { ...typography.body, fontWeight: '700', marginBottom: spacing.sm },
  employeeList: { marginTop: spacing.md },
  employeeRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  employeeBody: { flex: 1 },
  employeeName: { ...typography.body, fontWeight: '700' },
  employeeMeta: { ...typography.caption, marginTop: spacing.xs, textTransform: 'capitalize' },
});
