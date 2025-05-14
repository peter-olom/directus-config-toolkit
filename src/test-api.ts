// Simple test script for the API server
import { ApiServer } from "./api.js";

// Create a new API server instance
const apiServer = new ApiServer();

// Start the server
console.log("Starting API server for testing...");
apiServer.start();

console.log(`
Dashboard API server is now running.

The dashboard API is available at:
http://localhost:${process.env.DIRECTUS_CT_API_PORT || 3001}/

Available endpoints:
- GET  /health                 Health check
- GET  /status                 Get configuration statuses
- GET  /diff/:type             View differences for a config type
- POST /sync                   Sync a configuration type
- GET  /jobs                   Get job history
- GET  /connection             Check Directus connection
- POST /snapshot               Create a snapshot

To stop the server, press Ctrl+C
`);
