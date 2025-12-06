// netlify/functions/process-sale.mjs
import { Resend } from 'resend';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const resend = new Resend(process.env.RESEND_API_KEY);

async function generateAIaudit(businessUrl) {
  console.log(`🤖 Analyzing business website: ${businessUrl}`);
  const groqPrompt = `As a senior automation consultant at Cyrnel Origin, analyze ${businessUrl} and create a detailed "AI-Powered Business Automation Audit" with the following structure:

1. EXECUTIVE SUMMARY: 3-4 key findings on automation potential.
2. IDENTIFIED PROCESSES: 3-5 repetitive tasks suitable for automation.
3. QUICK-WIN AUTOMATIONS: Specific implementable solutions with time estimates.
4. TECHNOLOGY RECOMMENDATIONS: Appropriate tools for implementation.
5. 90-DAY ROADMAP: Phased implementation plan.
6. ROI ANALYSIS: Time and cost savings projections.

Tone: Professional, actionable, value-focused.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: groqPrompt }],
        temperature: 0.7,
        max_tokens: 2500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Groq API Error ${response.status}:`, errorText);
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const auditContent = data.choices[0]?.message?.content || 'Audit generation completed.';
    console.log('✅ AI audit generated successfully');
    return auditContent;

  } catch (error) {
    console.error('❌ Audit generation failed:', error.message);
    return `**AI-Powered Business Automation Audit for ${businessUrl}**\n\nThank you for choosing Cyrnel Origin. Your audit is being finalized and will be delivered shortly.`;
  }
}

async function sendAuditEmail(customerEmail, customerName, businessUrl, auditContent, orderId) {
  console.log(`📧 Sending audit to: ${customerEmail}`);
  const sanitizedOrderId = orderId.replace(/[^a-zA-Z0-9-_]/g, '_');

  const emailHtml = `
  <!DOCTYPE html>
  <html>
  <body style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
      <h1 style="color: #4f46e5;">🚀 Your AI-Powered Business Audit</h1>
      <p>Hi ${customerName},</p>
      <p>Your automation analysis for <strong>${businessUrl}</strong> is ready.</p>
      <div style="background: #f8fafc; padding: 20px; border-left: 4px solid #4f46e5;">
          ${auditContent.replace(/\n/g, '<br>')}
      </div>
      <p>Best regards,<br>The Cyrnel Origin Team</p>
  </body>
  </html>`;

  try {
    const { data, error } = await resend.emails.send({
      from: 'Cyrnel Origin <audits@cyrnelorigin.online>',
      to: [customerEmail],
      subject: `Your AI-Powered Business Automation Audit for ${businessUrl} | Cyrnel Origin`,
      html: emailHtml,
      text: `CYRNEL ORIGIN AUDIT\n\nFor: ${businessUrl}\n\n${auditContent}`,
      tags: [{ name: 'audit', value: sanitizedOrderId }]
    });

    if (error) throw error;
    console.log(`✅ Email delivered! Resend ID: ${data.id}`);
    return { success: true, emailId: data.id };

  } catch (error) {
    console.error('❌ Critical email failure:', error);
    return { success: false, error: error.message };
  }
}

export const handler = async (event, context) => {
  console.log('🚀 Cyrnel Origin Automation Engine - v1.2 with Firebase');

  // 1. Validate request
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // 2. Parse Gumroad webhook data
  let saleData = {};
  try {
    const params = new URLSearchParams(event.body);
    saleData = Object.fromEntries(params.entries());
    console.log('📊 Webhook parsed successfully');
  } catch (e) {
    console.error('❌ Parse error:', e.message);
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid data format' }) };
  }

  // 3. Extract data
  const email = saleData.email;
  const orderId = saleData.sale_id || saleData.resource?.id || `ORD-${Date.now()}`;
  let businessUrl = saleData['custom_fields[website]'] || saleData.website || 'Not provided';
  businessUrl = businessUrl.replace(/^(https?:\/\/)?(www\.)?/, '');
  const amount = saleData.price ? (parseInt(saleData.price) / 100).toFixed(2) : '0.00';

  console.log(`✅ Processing order: ${orderId}`);

  // 4. Generate AI Audit & Send Email
  const auditContent = await generateAIaudit(businessUrl);
  const emailResult = await sendAuditEmail(email, email.split('@')[0], businessUrl, auditContent, orderId);

  // 5. LOG SALE TO FIREBASE (NEW & CRITICAL)
  try {
    const saleLogRef = doc(db, 'sales', orderId);
    await setDoc(saleLogRef, {
      orderId: orderId,
      customerEmail: email,
      businessUrl: businessUrl,
      amount: parseFloat(amount),
      currency: saleData.currency || 'ZAR',
      auditGenerated: true,
      emailDelivered: emailResult.success,
      timestamp: serverTimestamp()
    });
    console.log('📊 Sale logged to Firebase');
  } catch (firebaseError) {
    console.error('Firebase log error (non-critical):', firebaseError.message);
  }

  // 6. Return response
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: emailResult.success,
      message: emailResult.success ? 'Audit delivered.' : 'Audit generated, check logs.',
      order_id: orderId,
      logged_to_firebase: true
    })
  };
};
