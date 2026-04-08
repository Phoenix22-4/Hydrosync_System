#pragma once

// =================================================================
//   HydroSync — secrets.h
//   Version 3.1
//
//   WHAT IS IN THIS FILE:
//   ─────────────────────────────────────────────────────────────
//   ✓ DEVICE_ID       — hardcoded, unique per physical unit
//   ✓ HIVEMQ_HOST     — hardcoded, same for all units on your cluster
//   ✓ HIVEMQ_ROOT_CA  — hardcoded, same for all units (public cert)
//
//   WHAT IS NOT IN THIS FILE (customer enters these via portal):
//   ✗ WiFi SSID        — saved to NVS by customer
//   ✗ WiFi Password    — saved to NVS by customer
//   ✗ HiveMQ Username  — saved to NVS by customer
//   ✗ HiveMQ Password  — saved to NVS by customer
//
//   BEFORE FLASHING EACH NEW DEVICE:
//   ─────────────────────────────────────────────────────────────
//   1. Change DEVICE_ID to the new device's unique ID
//      Examples:
//        "HydroSync_001"   (for first customer's first device)
//        "HydroSync_002"   (for second customer or second device)
//        "HydroSync_JK_01" (for customer with initials JK)
//
//   2. HIVEMQ_HOST stays the same for ALL devices on your cluster.
//      Only change it if you move to a different HiveMQ cluster.
//
//   3. Flash the firmware to the ESP32.
//
//   4. Ship the device with a card showing:
//        "Device ID: HydroSync_001"         (for your reference)
//        "HiveMQ Username: hydrosync_001"   (customer enters this)
//        "HiveMQ Password: [their password]"(customer enters this)
//
//   WHY DEVICE_ID IS HARDCODED AND NOT CUSTOMER-ENTERED:
//   ─────────────────────────────────────────────────────────────
//   • It defines which MQTT topics this device publishes to.
//     If the customer could change it, they could accidentally
//     publish to another customer's topic — data collision.
//   • It is the MQTT Client ID. HiveMQ rejects two connections
//     with the same client ID. You control uniqueness by flashing.
//   • It links the device to your backend database and billing.
//     Customer should have no way to change it.
//
//   WHY HIVEMQ_HOST IS HARDCODED:
//   ─────────────────────────────────────────────────────────────
//   • All your devices connect to the same HiveMQ cluster.
//   • The cluster hostname never changes once set up.
//   • Customers should not be able to redirect your device to a
//     different MQTT broker.
//
// =================================================================


// =================================================================
// 1. DEVICE IDENTITY — CHANGE THIS FOR EACH PHYSICAL UNIT
// =================================================================
//
// Format rule: only letters, numbers, and underscores. No spaces.
// This must EXACTLY match the MQTT credential you created in HiveMQ
// console for this device (used as the MQTT Client ID).
//
#define DEVICE_ID    "HydroSync_01"
//                    ▲ Change this before flashing each device


// =================================================================
// 2. HIVEMQ CLUSTER HOST — SAME FOR ALL DEVICES
// =================================================================
//
// Found in: HiveMQ Cloud console → your cluster → Cluster Details
// Format:   "xxxxxxxxxxxxxxxxxxxxxxxx.s1.eu.hivemq.cloud"
// DO NOT include "mqtt://" or "wss://" — just the hostname.
//
#define HIVEMQ_HOST  "70f11a2fa15842628bf9227997bb4ba9.s1.eu.hivemq.cloud"
//                    ▲ Same for all your devices. Only change if
//                      you migrate to a different HiveMQ cluster.


// =================================================================
// 3. HIVEMQ TLS ROOT CERTIFICATE (ISRG Root X1 — Let's Encrypt)
// =================================================================
//
// This is a PUBLIC certificate. It is safe to include in firmware.
// It is IDENTICAL for every HiveMQ Cloud cluster in the world.
// It tells the ESP32 to trust servers signed by Let's Encrypt.
//
// It does NOT grant access to your cluster — that requires the
// HiveMQ username and password (entered by customer in portal).
//
// Valid until: June 2035. No need to update before then.
//
static const char HIVEMQ_ROOT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRnXxCGmacTACCgYIKoZIzj0EAwIwRzEL
MAkGA1UEBhMCVVMxIjAgBgNVBAoTGUludGVybmV0IFNlY3VyaXR5IFJlc2VhcmNo
IEdyb3VwMRMwEQYDVQQDEwpJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4WhcN
MzUwNjA0MTEwNDM4WjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZSW50ZXJuZXQg
U2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxEzARBgNVBAMTCklTUkcgUm9vdCBYMTCC
AiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHovQnFEkUQSAv2t2k4K
WDtA5pYkGarGrxQAAFJUk8mK8dWvT5Z3sxiT9Z2y7aXHi4MHZM0v3wE+u/5bGp7
HwRBiGxLbGjW1VX2j0fXkP6lzGQPdaOgRi0cUwUv/c8UD1n/c5lHi3sAe6Eo+s
Hs8XVyJNL6oJ2Rf2p8aRdlRRCsAiYCJHB/CClKfBiPGRoFuGPBfFbpnBjXb02S
yUBX3BKRRbaSJDtBBdVaEdJ5q9tY29g9+nrNPfcWGwB7l3vx/Xyl4cAJBjkRJEX
VX2rBXFbB7jIJqxIj7oKzFo5bJlP0N3pZJ4CgVoRmfVk3l9jmFqm1BDtTVOFH5e
YVFfT8yXUq8tLFUTBFa2L/Y4q9T3WrZW2j+X2GS5JmU2O1/qFjh4nFnPFYBcRi
I31gFUbRBvZNbG2yTWo0PMpP0ioV5jXbdWkj3s9zDrwqOyFPZ7Rn3VNK8Kf3eH3
bFUt5XuaJn8K4+bSuYpnBPsxuJNTB3zB4lcfEEKSV8ePxcFhR0WbrS5k+hW4aZf
VJT6TXi5GU3ppFrr1oDSTN5y6xhqdYi8vNfKJfGk2G6eqAV0w2Uf+yxhDkCYCGb
J7kS8k/2W3KqO6aXQA/mfI1ZYKbJMXEWF5H9tHJGT6eKEgL9+Z7xY5K0ZYJTBpf
AgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNVHRMBAf8EBTADAQH/MB0GA1Ud
DgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkqhkiG9w0BAQsFAAOCAgEAVR9Y
qbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZLubhzEFnTIZd+50xx+7LSYK05
qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ3BebYhtF8GaV0nxvwuo77x/P
y9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KKNFtY2PwByVS5uCbMiogziUwt
hDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5ORAzI4JMPJ+GslWYHb4phowL
m8L2fOoG+MnUqJBJqHMpbBZHuU7cNvP42bxC7TmyJ0w8W8J6l8k1XpuB9E2LkZO
QJKF0fD5tXAHsNDVPM4vPJdvfhkQwOgWCHGAi8hAhMnMksTaH1cvI0/BNuqsU5T
BHuU7m2lDt6EB0JW2eaJhRMaRVOy1JWqQSmVXePv7K7aHyB8Yk8WnNPmSMN4gSQ
6rYmpVv3k0AiK9y/J9n5FVJCkO9Lmn2ZMNZFe6M5k6vE0bOMH2V8KwSd4a5k/Wm
Mu3cYo3LJxPZz7GUFTpZRvT+MJH/bL9q5jn9WkR0LMiK+Yq+YYTR89EzOx/DsaV
5nMbPIcq4jCZsVGp2VrSMl8y9bh1sGDH2T3/gZ2y5Qs+l5pSvNnG9GW9lz5cR0B
UHT0GhJ0JBMVfaWJ6yqGAMsQ6+MQDM0xnM8LFw==
-----END CERTIFICATE-----
)EOF";
