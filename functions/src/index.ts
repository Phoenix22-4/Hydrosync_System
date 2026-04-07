import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';

// Initialize Firebase Admin
admin.initializeApp();

// Configure SendGrid with API key from environment
// Set via: firebase functions:config:set sendgrid.key="YOUR_SENDGRID_API_KEY"
const SENDGRID_KEY = functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY;
if (SENDGRID_KEY) {
  sgMail.setApiKey(SENDGRID_KEY);
}

// Superuser email (system sender)
const SUPERUSER_EMAIL = 'visiontech072025@gmail.com';

// Interface for email token document
interface EmailToken {
  to: string;
  deviceName: string;
  deviceId: string;
  token: string;
  createdAt: admin.firestore.Timestamp;
  status: 'pending' | 'sent' | 'failed';
}

/**
 * Cloud Function triggered when a new document is created in email_tokens collection
 * Sends an email with the device token to the user
 */
export const sendDeviceTokenEmail = functions.firestore
  .document('email_tokens/{tokenId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() as EmailToken;
    const tokenId = context.params.tokenId;

    console.log(`Processing email token ${tokenId} for ${data.to}`);

    // Skip if already processed
    if (data.status !== 'pending') {
      console.log(`Token ${tokenId} already processed: ${data.status}`);
      return null;
    }

    // Validate required fields
    if (!data.to || !data.token || !data.deviceId) {
      console.error(`Missing required fields in token ${tokenId}`);
      await snap.ref.update({
        status: 'failed',
        error: 'Missing required fields',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return null;
    }

    // Check if SendGrid is configured
    if (!SENDGRID_KEY) {
      console.error('SendGrid API key not configured');
      // Log the email details for manual processing
      console.log('========================================');
      console.log('DEVICE TOKEN EMAIL');
      console.log(`To: ${data.to}`);
      console.log(`Device: ${data.deviceName || data.deviceId}`);
      console.log(`Token: ${data.token}`);
      console.log('========================================');
      
      await snap.ref.update({
        status: 'failed',
        error: 'SendGrid not configured - check logs',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return null;
    }

    // Compose email
    const msg = {
      to: data.to,
      from: {
        email: SUPERUSER_EMAIL,
        name: 'HydroSync System',
      },
      subject: `Your HydroSync Device Token - ${data.deviceName || data.deviceId}`,
      text: `
Hello,

Your HydroSync device registration is ready!

Device: ${data.deviceName || data.deviceId}
Device ID: ${data.deviceId}

Your verification token is: ${data.token}

Please enter this token in the HydroSync app to complete your device setup.

If you did not request this token, please ignore this email.

Best regards,
HydroSync Team
      `.trim(),
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0066cc, #00bfff); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .token-box { background: #e3f2fd; border: 2px dashed #0066cc; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; margin: 20px 0; border-radius: 8px; }
    .device-info { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>HydroSync</h1>
      <p>Device Registration Token</p>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p>Your HydroSync device registration is ready!</p>
      
      <div class="device-info">
        <p><strong>Device:</strong> ${data.deviceName || data.deviceId}</p>
        <p><strong>Device ID:</strong> ${data.deviceId}</p>
      </div>
      
      <p>Your verification token is:</p>
      <div class="token-box">${data.token}</div>
      
      <p>Please enter this token in the HydroSync app to complete your device setup.</p>
      <p><em>If you did not request this token, please ignore this email.</em></p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} HydroSync. All rights reserved.</p>
      <p>This is an automated message from HydroSync System.</p>
    </div>
  </div>
</body>
</html>
      `,
    };

    try {
      await sgMail.send(msg);
      console.log(`Email sent successfully to ${data.to}`);
      
      // Update status to sent
      await snap.ref.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      return { success: true };
    } catch (error: any) {
      console.error('Error sending email:', error);
      
      // Update status to failed
      await snap.ref.update({
        status: 'failed',
        error: error.message || 'Unknown error',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      return { success: false, error: error.message };
    }
  });

/**
 * HTTP callable function for sending device token emails
 * Can be called directly from the client app
 */
export const requestDeviceTokenEmail = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { to, deviceId, deviceName, token } = data;

  // Validate required fields
  if (!to || !deviceId || !token) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: to, deviceId, token');
  }

  // Create email token document
  const emailTokenRef = await admin.firestore().collection('email_tokens').add({
    to,
    deviceId,
    deviceName: deviceName || deviceId,
    token,
    userId: context.auth.uid,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Created email token ${emailTokenRef.id} for ${to}`);

  return {
    success: true,
    tokenId: emailTokenRef.id,
    message: 'Email request queued successfully',
  };
});
