import { createDirectus, rest, authentication, readMe, RestCommand } from '@directus/sdk';

// Common interface for test instances
export interface TestInstance {
  id: string;
  apiUrl: string;
  apiPort: string;
  adminToken?: string;
  cleanup: () => Promise<void>;
}

export interface SetupResult {
  roles: Record<string, string>;
  policies: Record<string, string>;
  users: Record<string, string>;
}

// Define response types
interface RoleResponse {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

interface PolicyResponse {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  ip_access?: string | null;
  enforce_tfa?: boolean;
  admin_access?: boolean;
  app_access?: boolean;
}

interface AccessResponse {
  id: string;
  role?: string;
  user?: string;
  policy: string;
  sort?: number;
}

interface PermissionResponse {
  id: string;
  collection: string;
  action: string;
  permissions?: any;
  validation?: any;
  presets?: any;
  fields?: string[] | null;
  policy: string;
}

interface UserResponse {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
}

// Custom request functions with proper typing
function createRole(data: any): RestCommand<RoleResponse, RoleResponse> {
  return () => ({
    path: '/roles',
    method: 'POST',
    body: data
  });
}

function createPolicy(data: any): RestCommand<PolicyResponse, PolicyResponse> {
  return () => ({
    path: '/policies',
    method: 'POST',
    body: data
  });
}

function createAccess(data: any): RestCommand<AccessResponse, AccessResponse> {
  return () => ({
    path: '/access',
    method: 'POST',
    body: data
  });
}

function createPermission(data: any): RestCommand<PermissionResponse, PermissionResponse> {
  return () => ({
    path: '/permissions',
    method: 'POST',
    body: data
  });
}

function createUser(data: any): RestCommand<UserResponse, UserResponse> {
  return () => ({
    path: '/users',
    method: 'POST',
    body: data
  });
}

export async function setupDirectusTestData(instance: TestInstance): Promise<SetupResult> {
  const client = createDirectus(instance.apiUrl)
    .with(rest())
    .with(authentication());

  // Set admin token for all requests
  client.setToken(instance.adminToken!);

  const roleIds: Record<string, string> = {};
  const policyIds: Record<string, string> = {};
  const userIds: Record<string, string> = {};

  try {
    // Step 1: Create Roles
    console.log('Creating roles...');
    
    // VendorRole
    const vendorRole = await client.request<RoleResponse>(createRole({
      name: 'VendorRole',
      icon: 'store',
      description: 'Role for vendors/merchants'
    }));
    roleIds.VendorRole = vendorRole.id;

    // ConsumerRole
    const consumerRole = await client.request<RoleResponse>(createRole({
      name: 'ConsumerRole',
      icon: 'person',
      description: 'Role for consumers'
    }));
    roleIds.ConsumerRole = consumerRole.id;

    // Promoter
    const promoterRole = await client.request<RoleResponse>(createRole({
      name: 'Promoter',
      icon: 'campaign',
      description: 'Role for promoters'
    }));
    roleIds.Promoter = promoterRole.id;

    // Supervisor
    const supervisorRole = await client.request<RoleResponse>(createRole({
      name: 'Supervisor',
      icon: 'supervisor_account',
      description: 'Role for supervisors'
    }));
    roleIds.Supervisor = supervisorRole.id;

    // Step 2: Create Policies
    console.log('Creating policies...');

    // Authenticated Policy
    const authenticatedPolicy = await client.request<PolicyResponse>(createPolicy({
      name: 'Authenticated',
      icon: 'verified_user',
      description: 'Default policy for authenticated users',
      ip_access: null,
      enforce_tfa: false,
      admin_access: false,
      app_access: true
    }));
    policyIds.Authenticated = authenticatedPolicy.id;

    // Promoter Policy
    const promoterPolicy = await client.request<PolicyResponse>(createPolicy({
      name: 'Promoter Policy',
      icon: 'policy',
      description: 'Policy for promoter operations',
      ip_access: null,
      enforce_tfa: false,
      admin_access: false,
      app_access: true
    }));
    policyIds.PromoterPolicy = promoterPolicy.id;

    // Supervisor Policy
    const supervisorPolicy = await client.request<PolicyResponse>(createPolicy({
      name: 'Supervisor Policy',
      icon: 'admin_panel_settings',
      description: 'Policy for supervisor operations',
      ip_access: null,
      enforce_tfa: false,
      admin_access: false,
      app_access: true
    }));
    policyIds.SupervisorPolicy = supervisorPolicy.id;

    // Step 3: Create Access mappings (Role-Policy associations)
    console.log('Creating access mappings...');

    // All roles get Authenticated policy
    await client.request(createAccess({
      role: roleIds.VendorRole,
      policy: policyIds.Authenticated,
      sort: 1
    }));

    await client.request(createAccess({
      role: roleIds.ConsumerRole,
      policy: policyIds.Authenticated,
      sort: 1
    }));

    await client.request(createAccess({
      role: roleIds.Promoter,
      policy: policyIds.Authenticated,
      sort: 1
    }));

    await client.request(createAccess({
      role: roleIds.Supervisor,
      policy: policyIds.Authenticated,
      sort: 1
    }));

    // Additional policies for specific roles
    await client.request(createAccess({
      role: roleIds.Promoter,
      policy: policyIds.PromoterPolicy,
      sort: 2
    }));

    await client.request(createAccess({
      role: roleIds.Supervisor,
      policy: policyIds.SupervisorPolicy,
      sort: 2
    }));

    // Step 4: Create Permissions
    console.log('Creating permissions...');

    // Authenticated users can read their own data
    await client.request(createPermission({
      collection: 'directus_users',
      action: 'read',
      permissions: {
        _and: [
          {
            id: {
              _eq: '$CURRENT_USER'
            }
          }
        ]
      },
      fields: [
        'id',
        'first_name', 
        'last_name',
        'email',
        'avatar',
        'role',
        'role.id',
        'role.name',
        'role.icon',
        'status',
        'language',
        'theme',
        'tfa_secret',
        'provider',
        'external_identifier'
      ],
      policy: policyIds.Authenticated
    }));

    // Authenticated users can update their own profile
    await client.request(createPermission({
      collection: 'directus_users',
      action: 'update',
      permissions: {
        _and: [
          {
            id: {
              _eq: '$CURRENT_USER'
            }
          }
        ]
      },
      fields: [
        'first_name',
        'last_name',
        'email',
        'password',
        'avatar',
        'language',
        'theme'
      ],
      policy: policyIds.Authenticated
    }));

    // Example collection permissions
    await client.request(createPermission({
      collection: 'directus_files',
      action: 'read',
      permissions: {},
      fields: ['*'],
      policy: policyIds.Authenticated
    }));

    await client.request(createPermission({
      collection: 'directus_folders',
      action: 'read',
      permissions: {},
      fields: ['*'],
      policy: policyIds.Authenticated
    }));

    // Supervisor-specific permissions
    await client.request(createPermission({
      collection: 'directus_users',
      action: 'read',
      permissions: {},
      fields: ['*'],
      policy: policyIds.SupervisorPolicy
    }));

    await client.request(createPermission({
      collection: 'directus_roles',
      action: 'read',
      permissions: {},
      fields: ['*'],
      policy: policyIds.SupervisorPolicy
    }));

    // Step 5: Create test users
    console.log('Creating test users...');

    const vendorUser = await client.request<UserResponse>(createUser({
      email: 'vendor@test.local',
      password: 'vendor123456',
      first_name: 'Test',
      last_name: 'Vendor',
      role: roleIds.VendorRole,
      status: 'active'
    }));
    userIds.vendor = vendorUser.id;

    const consumerUser = await client.request<UserResponse>(createUser({
      email: 'consumer@test.local',
      password: 'consumer123456',
      first_name: 'Test',
      last_name: 'Consumer',
      role: roleIds.ConsumerRole,
      status: 'active'
    }));
    userIds.consumer = consumerUser.id;

    const promoterUser = await client.request<UserResponse>(createUser({
      email: 'promoter@test.local',
      password: 'promoter123456',
      first_name: 'Test',
      last_name: 'Promoter',
      role: roleIds.Promoter,
      status: 'active'
    }));
    userIds.promoter = promoterUser.id;

    const supervisorUser = await client.request<UserResponse>(createUser({
      email: 'supervisor@test.local',
      password: 'supervisor123456',
      first_name: 'Test',
      last_name: 'Supervisor',
      role: roleIds.Supervisor,
      status: 'active'
    }));
    userIds.supervisor = supervisorUser.id;

    console.log('Test data setup complete!');

    return {
      roles: roleIds,
      policies: policyIds,
      users: userIds
    };
  } catch (error) {
    console.error('Error setting up test data:', error);
    throw error;
  }
}

export async function verifyUserAccess(instance: TestInstance, userEmail: string, userPassword: string): Promise<any> {
  const client = createDirectus(instance.apiUrl)
    .with(rest())
    .with(authentication());

  try {
    // Login as the user - proper login method signature
    await client.login({ email: userEmail, password: userPassword });

    // Try to read own user data
    const userData = await client.request(readMe({
      fields: ['id', 'first_name', 'last_name', 'email', 'role.name', 'role.id']
    }));

    return userData;
  } catch (error) {
    console.error(`Failed to verify access for ${userEmail}:`, error);
    throw error;
  }
}