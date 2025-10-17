// Test script to debug limit order connection issues
const BACKEND_URL = "http://localhost:8000";

async function testLimitOrderEndpoint() {
  console.log("Testing limit order endpoint...");

  // Test 1: Check if backend is accessible
  try {
    const response = await fetch(`${BACKEND_URL}/api/limit/my_orders`, {
      method: "GET",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
    });

    console.log("Backend response status:", response.status);
    const data = await response.text();
    console.log("Backend response:", data);

    if (response.status === 403) {
      console.log(
        "✅ Backend is running and limit order endpoint is accessible",
      );
      console.log("❌ Authentication is required (expected)");
    } else {
      console.log("❌ Unexpected response from backend");
    }
  } catch (error) {
    console.error("❌ Backend connection failed:", error.message);
    console.log("Make sure the backend server is running on port 8000");
  }

  // Test 2: Check if we can reach the create_order endpoint
  try {
    const response = await fetch(`${BACKEND_URL}/api/limit/create_order`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tokenAddress: "test-token",
        amount: 1,
        type: "Buy",
        direction: "Above",
        targetMC: 1000000,
      }),
    });

    console.log("Create order response status:", response.status);
    const data = await response.text();
    console.log("Create order response:", data);

    if (response.status === 403) {
      console.log("✅ Create order endpoint is accessible");
    } else {
      console.log("❌ Unexpected response from create order endpoint");
    }
  } catch (error) {
    console.error("❌ Create order endpoint connection failed:", error.message);
  }
}

// Run the test
testLimitOrderEndpoint();
