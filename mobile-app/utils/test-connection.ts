/**
 * Test API Connection
 * Paste this code in Expo terminal (or put in a test screen)
 */

import { API_CONFIG } from '@/constants';

export async function testConnection() {
  console.log('\n=== Testing Backend Connection ===');
  console.log('API URL:', API_CONFIG.BASE_URL);
  
  try {
    // Test 1: Simple fetch
    console.log('\n[Test 1] Fetching /api/customer/profile (should get 401)...');
    const response1 = await fetch(`${API_CONFIG.BASE_URL}/api/customer/profile`);
    console.log('Status:', response1.status);
    console.log('OK:', response1.ok);
    
    if (response1.status === 401) {
      console.log('✅ Backend is reachable! (Got expected 401 Unauthorized)');
    } else {
      console.log('⚠️ Unexpected status code:', response1.status);
    }
    
    // Test 2: Login with test data
    console.log('\n[Test 2] Testing login API...');
    const response2 = await fetch(`${API_CONFIG.BASE_URL}/api/customer/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: '082214535152'
      }),
    });
    
    const data = await response2.json();
    console.log('Login Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('✅ Login API works! Token:', data.token.substring(0, 20) + '...');
    } else {
      console.log('❌ Login failed:', data.message);
    }
    
  } catch (error: any) {
    console.error('\n❌ Connection Error:');
    console.error('Message:', error.message);
    console.error('Type:', error.name);
    
    if (error.message.includes('Network request failed')) {
      console.error('\n🔥 FIREWALL/NETWORK ISSUE:');
      console.error('- Check if PC and phone are on same WiFi');
      console.error('- Check Windows Firewall settings');
      console.error('- Try accessing http://192.168.1.6:3000 from phone browser');
    }
  }
}

// To run: import and call testConnection()
