// Test script to debug authentication issues
const BACKEND_URL = "http://localhost:8000";

async function testAuthentication() {
  console.log("Testing authentication flow...");

  // Test 1: Try to get user info without token
  try {
    const response = await fetch(`${BACKEND_URL}/api/users/me`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("User info response status:", response.status);
    const data = await response.text();
    console.log("User info response:", data);
  } catch (error) {
    console.error("❌ User info endpoint failed:", error.message);
  }

  // Test 2: Check if we can reach the user endpoints
  try {
    const response = await fetch(`${BACKEND_URL}/api/users/auth/google`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("Google auth response status:", response.status);
    console.log(
      "Google auth response headers:",
      Object.fromEntries(response.headers.entries()),
    );
  } catch (error) {
    console.error("❌ Google auth endpoint failed:", error.message);
  }

  // Test 3: Check if the backend is properly configured
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("Health check response status:", response.status);
    const data = await response.text();
    console.log("Health check response:", data);
  } catch (error) {
    console.log("ℹ️  No health check endpoint (this is normal)");
  }
}

// Run the test
testAuthentication();
