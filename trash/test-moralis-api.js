// Test script to verify Moralis API integration
// Run with: node test-moralis-api.js

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImM2ZjA1Y2Y2LTJiZWItNDM5Yi1hOTg2LWZiNzliYjQzOTc2OSIsIm9yZ0lkIjoiNDc0OTI1IiwidXNlcklkIjoiNDg4NTc0IiwidHlwZUlkIjoiMTU2N2UxYWYtZGFlOS00NTA4LThmODYtODgxODg1YTcyOWQzIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTk5NjY2MjcsImV4cCI6NDkxNTcyNjYyN30.1lM_JN0QQGVsTRpspgzvy-T5Ae9XlyEEpYlYMGvVhCs';

async function testMoralisAPI() {
  console.log('Testing Moralis API integration...');
  console.log('API Key:', API_KEY.substring(0, 20) + '...');
  console.log('---');

  // Example pair address from the curl command
  const pairAddress = '0xa3c2076eb97d573cc8842f1db1ecdf7b6f77ba27';
  const chainId = 'eth';
  const blocksAfterCreation = 1000;

  try {
    const url = `https://deep-index.moralis.io/api/v2.2/pairs/${pairAddress}/snipers?chain=${chainId}&blocksAfterCreation=${blocksAfterCreation}`;
    
    console.log(`Testing endpoint: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'X-API-Key': API_KEY,
      },
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Success! Response data structure:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('❌ Failed');
      const errorText = await response.text();
      console.log('Error response:', errorText);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testMoralisAPI();
