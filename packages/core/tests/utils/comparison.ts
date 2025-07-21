import { isEqual, omit, pick } from 'lodash';

export interface ComparisonResult {
  isEqual: boolean;
  differences: Difference[];
}

export interface Difference {
  path: string;
  type: 'missing' | 'extra' | 'different';
  source?: any;
  target?: any;
  message?: string;
}

export class ConfigComparator {
  /**
   * Compare two role configurations, ignoring ID differences
   */
  static compareRoles(sourceRoles: any[], targetRoles: any[]): ComparisonResult {
    const differences: Difference[] = [];
    
    // Create maps by name for comparison
    const sourceMap = new Map(sourceRoles.map(r => [r.name, r]));
    const targetMap = new Map(targetRoles.map(r => [r.name, r]));

    // Check for missing roles
    for (const [name, sourceRole] of sourceMap) {
      if (!targetMap.has(name)) {
        differences.push({
          path: `roles.${name}`,
          type: 'missing',
          source: sourceRole,
          message: `Role '${name}' exists in source but not in target`
        });
      } else {
        // Compare role properties (excluding IDs)
        const targetRole = targetMap.get(name);
        const sourceProps = omit(sourceRole, ['id', 'users', 'children', 'policies']);
        const targetProps = omit(targetRole, ['id', 'users', 'children', 'policies']);
        
        if (!isEqual(sourceProps, targetProps)) {
          differences.push({
            path: `roles.${name}`,
            type: 'different',
            source: sourceProps,
            target: targetProps,
            message: `Role '${name}' properties differ`
          });
        }
      }
    }

    // Check for extra roles
    for (const [name, targetRole] of targetMap) {
      if (!sourceMap.has(name)) {
        differences.push({
          path: `roles.${name}`,
          type: 'extra',
          target: targetRole,
          message: `Role '${name}' exists in target but not in source`
        });
      }
    }

    return {
      isEqual: differences.length === 0,
      differences
    };
  }

  /**
   * Compare two policy configurations
   */
  static comparePolicies(sourcePolicies: any[], targetPolicies: any[]): ComparisonResult {
    const differences: Difference[] = [];
    
    const sourceMap = new Map(sourcePolicies.map(p => [p.name, p]));
    const targetMap = new Map(targetPolicies.map(p => [p.name, p]));

    for (const [name, sourcePolicy] of sourceMap) {
      if (!targetMap.has(name)) {
        differences.push({
          path: `policies.${name}`,
          type: 'missing',
          source: sourcePolicy,
          message: `Policy '${name}' exists in source but not in target`
        });
      } else {
        const targetPolicy = targetMap.get(name);
        const sourceProps = omit(sourcePolicy, ['id', 'users', 'roles', 'permissions']);
        const targetProps = omit(targetPolicy, ['id', 'users', 'roles', 'permissions']);
        
        if (!isEqual(sourceProps, targetProps)) {
          differences.push({
            path: `policies.${name}`,
            type: 'different',
            source: sourceProps,
            target: targetProps,
            message: `Policy '${name}' properties differ`
          });
        }
      }
    }

    for (const [name, targetPolicy] of targetMap) {
      if (!sourceMap.has(name)) {
        differences.push({
          path: `policies.${name}`,
          type: 'extra',
          target: targetPolicy,
          message: `Policy '${name}' exists in target but not in source`
        });
      }
    }

    return {
      isEqual: differences.length === 0,
      differences
    };
  }

  /**
   * Compare access mappings (role-policy associations)
   */
  static compareAccess(sourceAccess: any[], targetAccess: any[], roleMap: Map<string, string>, policyMap: Map<string, string>): ComparisonResult {
    const differences: Difference[] = [];
    
    // Normalize access entries for comparison
    const normalizeAccess = (access: any, useSourceIds: boolean = true) => {
      const normalized = {
        role: access.role,
        user: access.user,
        policy: access.policy,
        sort: access.sort
      };

      // Map IDs if comparing across instances
      if (!useSourceIds && roleMap && policyMap) {
        if (normalized.role) {
          normalized.role = Array.from(roleMap.entries()).find(([srcId]) => srcId === access.role)?.[1] || access.role;
        }
        if (normalized.policy) {
          normalized.policy = Array.from(policyMap.entries()).find(([srcId]) => srcId === access.policy)?.[1] || access.policy;
        }
      }

      return normalized;
    };

    // Create comparable keys for access entries
    const getAccessKey = (access: any) => `${access.role || 'null'}-${access.user || 'null'}-${access.policy}`;

    const sourceAccessMap = new Map(sourceAccess.map(a => [getAccessKey(normalizeAccess(a)), a]));
    const targetAccessMap = new Map(targetAccess.map(a => [getAccessKey(normalizeAccess(a, false)), a]));

    // Compare access entries
    for (const [key, sourceEntry] of sourceAccessMap) {
      if (!targetAccessMap.has(key)) {
        differences.push({
          path: `access.${key}`,
          type: 'missing',
          source: sourceEntry,
          message: `Access mapping missing in target`
        });
      }
    }

    for (const [key, targetEntry] of targetAccessMap) {
      if (!sourceAccessMap.has(key)) {
        differences.push({
          path: `access.${key}`,
          type: 'extra',
          target: targetEntry,
          message: `Extra access mapping in target`
        });
      }
    }

    return {
      isEqual: differences.length === 0,
      differences
    };
  }

  /**
   * Compare permissions
   */
  static comparePermissions(sourcePerms: any[], targetPerms: any[], policyMap: Map<string, string>): ComparisonResult {
    const differences: Difference[] = [];
    
    // Normalize permissions for comparison
    const normalizePermission = (perm: any, useSourceIds: boolean = true) => {
      const normalized = {
        collection: perm.collection,
        action: perm.action,
        permissions: perm.permissions,
        validation: perm.validation,
        presets: perm.presets,
        fields: perm.fields ? [...perm.fields].sort() : null,
        policy: perm.policy
      };

      // Map policy IDs if comparing across instances
      if (!useSourceIds && policyMap && normalized.policy) {
        normalized.policy = Array.from(policyMap.entries()).find(([srcId]) => srcId === perm.policy)?.[1] || perm.policy;
      }

      return normalized;
    };

    // Create comparable keys for permissions
    const getPermKey = (perm: any) => `${perm.collection}-${perm.action}-${perm.policy || 'system'}`;

    const sourcePermMap = new Map(sourcePerms.map(p => [getPermKey(normalizePermission(p)), normalizePermission(p)]));
    const targetPermMap = new Map(targetPerms.map(p => [getPermKey(normalizePermission(p, false)), normalizePermission(p, false)]));

    // Compare permissions
    for (const [key, sourcePerm] of sourcePermMap) {
      const targetPerm = targetPermMap.get(key);
      
      if (!targetPerm) {
        differences.push({
          path: `permissions.${key}`,
          type: 'missing',
          source: sourcePerm,
          message: `Permission missing in target`
        });
      } else {
        // Deep comparison of permission properties
        if (!isEqual(sourcePerm.permissions, targetPerm.permissions)) {
          differences.push({
            path: `permissions.${key}.permissions`,
            type: 'different',
            source: sourcePerm.permissions,
            target: targetPerm.permissions,
            message: `Permission conditions differ`
          });
        }

        if (!isEqual(sourcePerm.fields, targetPerm.fields)) {
          differences.push({
            path: `permissions.${key}.fields`,
            type: 'different',
            source: sourcePerm.fields,
            target: targetPerm.fields,
            message: `Permission fields differ`
          });
        }

        if (!isEqual(sourcePerm.validation, targetPerm.validation)) {
          differences.push({
            path: `permissions.${key}.validation`,
            type: 'different',
            source: sourcePerm.validation,
            target: targetPerm.validation,
            message: `Permission validation differs`
          });
        }

        if (!isEqual(sourcePerm.presets, targetPerm.presets)) {
          differences.push({
            path: `permissions.${key}.presets`,
            type: 'different',
            source: sourcePerm.presets,
            target: targetPerm.presets,
            message: `Permission presets differ`
          });
        }
      }
    }

    for (const [key, targetPerm] of targetPermMap) {
      if (!sourcePermMap.has(key)) {
        differences.push({
          path: `permissions.${key}`,
          type: 'extra',
          target: targetPerm,
          message: `Extra permission in target`
        });
      }
    }

    return {
      isEqual: differences.length === 0,
      differences
    };
  }

  /**
   * Compare complete role manager configurations
   */
  static compareRoleManagerConfigs(source: any, target: any): ComparisonResult {
    const allDifferences: Difference[] = [];
    
    // Compare roles
    const roleResult = this.compareRoles(source.roles || [], target.roles || []);
    allDifferences.push(...roleResult.differences);

    // Compare policies
    const policyResult = this.comparePolicies(source.policies || [], target.policies || []);
    allDifferences.push(...policyResult.differences);

    // Build ID maps for cross-instance comparison
    const roleMap = new Map<string, string>();
    const policyMap = new Map<string, string>();

    // Map roles by name
    const sourceRoles = new Map((source.roles || []).map((r: any) => [r.name, r.id]));
    const targetRoles = new Map((target.roles || []).map((r: any) => [r.name, r.id]));
    for (const [name, sourceId] of sourceRoles) {
      const targetId = targetRoles.get(name);
      if (targetId) {
        roleMap.set(String(sourceId), String(targetId));
      }
    }

    // Map policies by name
    const sourcePolicies = new Map((source.policies || []).map((p: any) => [p.name, p.id]));
    const targetPolicies = new Map((target.policies || []).map((p: any) => [p.name, p.id]));
    for (const [name, sourceId] of sourcePolicies) {
      const targetId = targetPolicies.get(name);
      if (targetId) {
        policyMap.set(String(sourceId), String(targetId));
      }
    }

    // Compare access with ID mapping
    const accessResult = this.compareAccess(source.access || [], target.access || [], roleMap, policyMap);
    allDifferences.push(...accessResult.differences);

    // Compare permissions with ID mapping
    const permResult = this.comparePermissions(source.permissions || [], target.permissions || [], policyMap);
    allDifferences.push(...permResult.differences);

    return {
      isEqual: allDifferences.length === 0,
      differences: allDifferences
    };
  }
}