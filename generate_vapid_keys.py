#!/usr/bin/env python3
"""
Generate VAPID keys for push notifications
Run this ONCE to get your keys
"""

import subprocess
import base64
import os

print("=" * 60)
print("GENERATING VAPID KEYS FOR PUSH NOTIFICATIONS")
print("=" * 60)

# Check if keys already exist
if not os.path.exists("private_key.pem"):
    print("\nGenerating new keys...")
    subprocess.run(["vapid", "--gen"], check=True)
else:
    print("\nKeys already exist!")

# Now get the application server key
print("\nGetting application server key...")
result = subprocess.run(["vapid", "--applicationServerKey"], capture_output=True, text=True)
output = result.stdout

# Extract the public key from output
# Output looks like: "Application Server Key = BKd0k2f..."
for line in output.split('\n'):
    if 'Application Server Key' in line:
        public_key = line.split('=')[1].strip()
        break
else:
    print("ERROR: Could not find Application Server Key in output")
    print(output)
    exit(1)

print("\n" + "=" * 60)
print("FOR LOCAL TESTING (PowerShell):")
print("-" * 60)
print('$env:VAPID_PRIVATE_KEY = "private_key.pem"')
print(f'$env:VAPID_PUBLIC_KEY = "{public_key}"')
print('$env:VAPID_EMAIL = "mailto:test@localhost"')

print("\n" + "=" * 60)
print("FOR SERVER (Appliku/Production):")
print("-" * 60)

# Read the private key file content for server use
with open("private_key.pem", "r") as f:
    private_key_pem = f.read().replace('\n', '\\n')

print(f'VAPID_PRIVATE_KEY={private_key_pem}')
print(f'VAPID_PUBLIC_KEY={public_key}')
print('VAPID_EMAIL=mailto:admin@yourdomain.com')

print("\n" + "=" * 60)
print("DONE! Copy the section you need above.")
print("=" * 60)