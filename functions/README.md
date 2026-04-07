# HydroSync Cloud Functions

This folder contains Firebase Cloud Functions for the HydroSync application.

## Setup

1. Install dependencies:
   ```bash
   cd functions
   npm install
   ```

2. Configure SendGrid API key:
   ```bash
   firebase functions:config:set sendgrid.key="YOUR_SENDGRID_API_KEY"
   ```
   
   Or set the `SENDGRID_API_KEY` environment variable.

3. Deploy functions:
   ```bash
   npm run deploy
   ```

## Functions

### `sendDeviceTokenEmail`

Triggered when a new document is created in the `email_tokens` collection. Sends an email with the device token to the user.

### `requestDeviceTokenEmail`

HTTP callable function that can be called directly from the client app to request a device token email.

## Email Provider

This uses SendGrid for email delivery. You can sign up for a free account at [sendgrid.com](https://sendgrid.com).

### SendGrid Setup

1. Create a SendGrid account
2. Generate an API key with "Mail Send" permissions
3. Verify your sender email (visiontech072025@gmail.com)
4. Configure the API key in Firebase

## Superuser

The superuser email `visiontech072025@gmail.com` has full control over the system and is used as the sender for automated emails.

## Firestore Collections

### `email_tokens`

Documents created by the client app to trigger email sending:
```js
{
  to: "user@example.com",
  deviceId: "HOME_01",
  deviceName: "Home Tank",
  token: "ABCD1234",
  userId: "auth_uid",
  status: "pending" | "sent" | "failed",
  createdAt: Timestamp,
  sentAt: Timestamp, // optional
  error: string // optional
}
```

### `device_tokens`

Documents for token verification:
```js
{
  device_id: "HOME_01",
  firestore_id: "document_id",
  user_id: "auth_uid",
  user_email: "user@example.com",
  token: "ABCD1234",
  expires_at: Date,
  used: false,
  created_at: Timestamp
}
```

## Local Development

To test functions locally:
```bash
npm run serve
```

This starts the Firebase emulators.
