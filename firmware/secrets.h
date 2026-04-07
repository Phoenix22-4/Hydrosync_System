#pragma once

// =================================================================
//   HydroSync — secrets.h
//   Version 3.0
// =================================================================
//
//   WHAT THIS FILE NOW CONTAINS:
//   ─────────────────────────────────────────────────────────────
//   ONLY the HiveMQ Root CA certificate.
//
//   WiFi SSID, WiFi Password, Device ID, HiveMQ Host,
//   HiveMQ Username, and HiveMQ Password are NO LONGER HERE.
//
//   They are entered ONCE by the customer through the captive
//   portal setup page and stored permanently in the ESP32's
//   NVS (non-volatile flash storage). They survive reboots,
//   power cuts, and firmware updates.
//
//   WHY THE CERTIFICATE IS STILL HERE (and that is OK):
//   ─────────────────────────────────────────────────────────────
//   The HIVEMQ_ROOT_CA certificate is NOT a secret.
//   It is the ISRG Root X1 certificate — a public certificate
//   from Let's Encrypt that is identical on every HiveMQ Cloud
//   cluster in the world.
//
//   It does NOT identify your device or your account.
//   It only tells the ESP32 "trust servers signed by Let's Encrypt".
//
//   Sharing it publicly is completely safe. It cannot be used
//   to connect to your HiveMQ cluster — for that you still need
//   the username and password (which are now stored in NVS,
//   not in this file).
//
//   HOW TO FACTORY RESET A DEVICE:
//   ─────────────────────────────────────────────────────────────
//   Hold the BOOT button (GPIO 0) for 5 seconds while powered on.
//   The device will erase all saved credentials and restart in
//   setup mode (broadcasting "HydroSync_Setup" WiFi network).
//
// =================================================================


// =================================================================
// HiveMQ TLS Root Certificate (ISRG Root X1 — Let's Encrypt)
// This is the SAME certificate for ALL HydroSync devices.
// It is public information and safe to include in firmware.
// Last verified valid: 2024. Expires: 2035.
// =================================================================
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