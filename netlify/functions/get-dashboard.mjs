// netlify/functions/get-dashboard.mjs - CORRECTED VERSION
// Uses Firebase Admin SDK (same as process-sale.mjs)

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

// 1. Initialize Firebase Admin SDK (SAME SETUP AS process-sale.mjs)
if (!admin.apps.length) {
  const serviceAccount = {
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || 'googleapis.com'
  };
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// 2. MAIN FUNCTION - FETCHES DATA FROM FIRESTORE
export const handler = async (event) => {
  // SECURITY CHECK: Require secret key
  const secret = event.queryStringParameters?.key;
  
  if (secret !== process.env.DASHBOARD_SECRET_KEY) {
    return { 
      statusCode: 401, 
      body: JSON.stringify({ error: 'Unauthorized. Invalid or missing dashboard key.' }) 
    };
  }

  try {
    console.log('📊 Dashboard data request received');
    
    // 3. Fetch last 50 sales from Firestore
    const salesSnap = await db.collection('sales')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const sales = [];
    let totalRevenue = 0;
    let successfulDeliveries = 0;
    
    salesSnap.forEach(doc => {
      const saleData = doc.data();
      sales.push({
        id: doc.id,
        orderId: saleData.orderId || doc.id,
        customerEmail: saleData.customerEmail || 'N/A',
        businessUrl: saleData.businessUrl || 'N/A',
        amount: saleData.amount || 0,
        currency: saleData.currency || 'ZAR',
        auditGenerated: saleData.auditGenerated || false,
        emailDelivered: saleData.emailDelivered || false,
        timestamp: saleData.timestamp?.toDate?.().toLocaleString('en-ZA') || 'N/A'
      });
      
      if (saleData.amount) totalRevenue += saleData.amount;
      if (saleData.emailDelivered === true) successfulDeliveries++;
    });

    const totalSales = sales.length;
    const successRate = totalSales > 0 
      ? ((successfulDeliveries / totalSales) * 100).toFixed(1)
      : 0;

    // 4. Return clean JSON response
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: {
          totalRevenue: totalRevenue.toFixed(2),
          totalSales: totalSales,
          successRate: successRate,
          successfulDeliveries: successfulDeliveries,
          lastUpdated: new Date().toISOString()
        },
        recentSales: sales
      })
    };

  } catch (error) {
    console.error('❌ Dashboard Function Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Failed to fetch dashboard data',
        message: error.message 
      })
    };
  }
};
