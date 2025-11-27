# ROBOX-CLEARING API Documentation

**Base URL:** `https://roboxlayer.xyz/api/v1`

**Version:** 1.0.0

---

## Overview

ROBOX-CLEARING is a robot-to-robot payment clearing system that enables autonomous machines to transfer credits, track balances, and manage transactions programmatically.

All API requests require authentication via API key.

---

## Authentication

Include your API key in every request using the `X-API-Key` header:

```bash
curl https://roboxlayer.xyz/api/v1/balance \
  -H "X-API-Key: rbx_your_api_key_here"
```

Alternatively, pass it as a query parameter:

```
https://roboxlayer.xyz/api/v1/balance?apiKey=rbx_your_api_key_here
```

> **Note:** API keys are generated when you create a robot in the Dashboard.

---

## Response Format

All responses are JSON with the following structure:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message"
}
```

---

## Endpoints

### Get Robot Info

Returns information about the authenticated robot.

```
GET /me
```

**Response:**
```json
{
  "id": "bot_a1b2c3d4e5f6g7h8",
  "name": "CleanerBot",
  "credits": 5000,
  "status": "active"
}
```

---

### Get Balance

Returns the current credit balance.

```
GET /balance
```

**Response:**
```json
{
  "credits": 5000,
  "status": "active"
}
```

---

### Transfer Credits

Transfer credits to another robot using their API key.

```
POST /transfer
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `recipientApiKey` | string | Yes | API key of the recipient robot |
| `amount` | integer | Yes | Amount to transfer (min: 1) |
| `memo` | string | No | Optional transaction memo |

**Example:**
```bash
curl -X POST https://roboxlayer.xyz/api/v1/transfer \
  -H "X-API-Key: rbx_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientApiKey": "rbx_recipient_api_key",
    "amount": 100,
    "memo": "Payment for cleaning service"
  }'
```

**Response:**
```json
{
  "success": true,
  "transactionId": "tx_1a2b3c4d5e6f7g8h9i0j1k2l",
  "from": "bot_sender123",
  "to": "bot_recipient456",
  "amount": 100,
  "memo": "Payment for cleaning service",
  "senderBalance": 4900,
  "timestamp": "2025-11-27T14:30:00.000Z"
}
```

**Errors:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | Invalid amount | Amount must be a positive integer |
| 400 | Insufficient credits | Not enough balance |
| 400 | Cannot transfer to self | Sender and recipient are the same |
| 404 | Recipient not found | Invalid recipient API key |

---

### Deduct Credits

Deduct credits from your own balance (for service consumption, fees, etc.).

```
POST /deduct
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | integer | Yes | Amount to deduct (min: 1) |
| `reason` | string | No | Reason for deduction |

**Example:**
```bash
curl -X POST https://roboxlayer.xyz/api/v1/deduct \
  -H "X-API-Key: rbx_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50,
    "reason": "Energy consumption"
  }'
```

**Response:**
```json
{
  "success": true,
  "transactionId": "tx_abc123def456",
  "amount": 50,
  "reason": "Energy consumption",
  "balance": 4950,
  "timestamp": "2025-11-27T14:35:00.000Z"
}
```

---

### Get Transactions

Returns transaction history for the authenticated robot.

```
GET /transactions
```

**Response:**
```json
{
  "transactions": [
    {
      "id": "tx_1a2b3c4d5e6f",
      "from": "bot_sender123",
      "to": "bot_recipient456",
      "amount": 100,
      "type": "transfer",
      "memo": "Payment for service",
      "createdAt": "2025-11-27T14:30:00.000Z"
    },
    {
      "id": "tx_7g8h9i0j1k2l",
      "from": "bot_sender123",
      "to": null,
      "amount": 50,
      "type": "deduct",
      "memo": "Energy consumption",
      "createdAt": "2025-11-27T14:35:00.000Z"
    }
  ]
}
```

**Transaction Types:**
| Type | Description |
|------|-------------|
| `transfer` | Credit transfer between robots |
| `deduct` | Self-deduction (consumption) |

---

## Error Codes

| HTTP Status | Description |
|-------------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Missing or invalid API key |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

---

## Rate Limits

| Limit | Value |
|-------|-------|
| Requests per minute | 60 |
| Requests per hour | 1000 |

Exceeding rate limits returns `429 Too Many Requests`.

---

## Code Examples

### Node.js

```javascript
const API_KEY = 'rbx_your_api_key';
const BASE_URL = 'https://roboxlayer.xyz/api/v1';

async function getBalance() {
  const response = await fetch(`${BASE_URL}/balance`, {
    headers: { 'X-API-Key': API_KEY }
  });
  return response.json();
}

async function transfer(recipientApiKey, amount, memo) {
  const response = await fetch(`${BASE_URL}/transfer`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ recipientApiKey, amount, memo })
  });
  return response.json();
}

// Usage
const balance = await getBalance();
console.log(`Current balance: ${balance.credits}`);

const tx = await transfer('rbx_recipient_key', 100, 'Payment');
console.log(`Transaction ID: ${tx.transactionId}`);
```

### Python

```python
import requests

API_KEY = 'rbx_your_api_key'
BASE_URL = 'https://roboxlayer.xyz/api/v1'

headers = {'X-API-Key': API_KEY}

def get_balance():
    response = requests.get(f'{BASE_URL}/balance', headers=headers)
    return response.json()

def transfer(recipient_api_key, amount, memo=''):
    response = requests.post(
        f'{BASE_URL}/transfer',
        headers={**headers, 'Content-Type': 'application/json'},
        json={
            'recipientApiKey': recipient_api_key,
            'amount': amount,
            'memo': memo
        }
    )
    return response.json()

# Usage
balance = get_balance()
print(f"Current balance: {balance['credits']}")

tx = transfer('rbx_recipient_key', 100, 'Payment')
print(f"Transaction ID: {tx['transactionId']}")
```

### cURL

```bash
# Get balance
curl https://roboxlayer.xyz/api/v1/balance \
  -H "X-API-Key: rbx_your_api_key"

# Transfer credits
curl -X POST https://roboxlayer.xyz/api/v1/transfer \
  -H "X-API-Key: rbx_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"recipientApiKey": "rbx_recipient", "amount": 100}'

# Deduct credits
curl -X POST https://roboxlayer.xyz/api/v1/deduct \
  -H "X-API-Key: rbx_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"amount": 50, "reason": "Service fee"}'

# Get transactions
curl https://roboxlayer.xyz/api/v1/transactions \
  -H "X-API-Key: rbx_your_api_key"
```

---

## Webhooks (Coming Soon)

Subscribe to real-time transaction notifications.

---

## Support

- **Dashboard:** https://roboxlayer.xyz/#dashboard
- **GitHub:** https://github.com/lucytrasero/ROBOX/

---

## Changelog

### v1.0.0 (2025-11-27)
- Initial release
- Robot-to-robot transfers
- Balance management
- Transaction history