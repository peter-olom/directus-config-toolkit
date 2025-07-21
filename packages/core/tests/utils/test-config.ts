/**
 * Test configuration constants
 */

// Directus versions to test against
export const DIRECTUS_VERSIONS = {
  // Version specified in the debug guide
  STABLE: '11.2.0',
  // Latest version
  LATEST: '11.9.3',
  // Test both by default
  DEFAULT: process.env.DIRECTUS_TEST_VERSION || '11.9.3'
};

// Test configuration
export const TEST_CONFIG = {
  // Docker images
  DIRECTUS_IMAGE: `directus/directus:${DIRECTUS_VERSIONS.DEFAULT}`,
  POSTGRES_IMAGE: 'postgres:15-alpine',
  
  // Timeouts
  CONTAINER_STARTUP_TIMEOUT: 60000,
  HEALTH_CHECK_INTERVAL: 5,
  HEALTH_CHECK_TIMEOUT: 3,
  HEALTH_CHECK_RETRIES: 5,
  
  // Port range for random ports
  PORT_MIN: 10000,
  PORT_MAX: 60000,
  
  // Test data
  DEFAULT_ADMIN_EMAIL: 'admin@test.local',
  DEFAULT_ADMIN_PASSWORD: 'admin123456',
  
  // Environment
  IS_CI: process.env.CI === 'true'
};