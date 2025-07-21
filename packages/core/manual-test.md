# Manual Test Guide for DCT Integration

Since we have a running Directus instance, let's create a manual test to verify DCT works correctly.

## Prerequisites

1. Directus instance running at http://localhost:8055
2. DCT built (`npm run build`)

## Test Steps

### 1. Set up environment

```bash
export DCT_API_URL=http://localhost:8055
export DCT_TOKEN=<your-admin-token>
export DCT_CONFIG_PATH=./test-config
```

### 2. Export current configuration

```bash
# Create test directory
mkdir -p test-config

# Export roles (includes policies, access, permissions)
node dist/cli.js export roles

# Check exported files
ls -la test-config/
# Should see: roles.json, policies.json, access.json, permissions.json
```

### 3. Verify permission fields

```bash
# Check if permission fields are properly exported
cat test-config/permissions.json | jq '.[] | select(.collection == "directus_users" and .action == "read" and .permissions._and[0].id._eq == "$CURRENT_USER") | .fields'
```

This should show an array with multiple fields like:
- "id"
- "first_name"
- "last_name" 
- "email"
- "role"
- etc.

### 4. Test import (dry-run first)

```bash
# Test with dry-run to see what would change
node dist/cli.js import roles --dry-run

# If looks good, do actual import
node dist/cli.js import roles
```

### 5. Verify user access

Create a test user and verify they can see their profile fields:

```bash
# Use Directus API or UI to:
# 1. Create a non-admin role
# 2. Create a user with that role
# 3. Login as that user
# 4. Check if they can see their profile fields (not just ID)
```

## Expected Results

✅ Export creates 4 JSON files
✅ permissions.json contains field arrays (not just ["id"])
✅ Import preserves all permission fields
✅ Users can access their full profile after import

## Troubleshooting

If users can only see their ID field:
1. Check permissions.json - the fields array should have multiple entries
2. Verify the policy is linked to the role correctly in access.json
3. Check that the permission has the correct policy ID