/**
 * HTTP API Server Example
 * 
 * This example shows how to create a full HTTP API server
 * using robox-clearing library with Express.js
 * 
 * API Base URL: https://roboxlayer.xyz/api/v1
 */

import express from 'express';
import cors from 'cors';
import { 
  RoboxLayer, 
  InMemoryStorage, 
  createRoboxRouter,
  generateApiKey,
} from 'robox-clearing';

const app = express();

// Initialize Robox with storage
const storage = new InMemoryStorage();
const robox = new RoboxLayer({
  storage,
  enableAuditLog: true,
  defaultLimits: {
    maxTransferAmount: 1000000,
    dailyTransferLimit: 10000000,
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Mount Robox API router
app.use('/api/v1', createRoboxRouter({ robox }));

// ==================== ADMIN ROUTES ====================
// These routes are for managing robots (Dashboard)

// Create a new robot
app.post('/admin/robots', async (req, res) => {
  try {
    const { name, ownerId, initialBalance = 1000 } = req.body;

    const robot = await robox.createRobotAccount({
      name,
      ownerId,
      initialBalance,
    });

    res.json({
      success: true,
      robot: {
        id: robot.id,
        name: robot.name,
        apiKey: robot.apiKey,
        balance: robot.balance,
        status: robot.status,
        createdAt: robot.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get robots by owner
app.get('/admin/robots', async (req, res) => {
  try {
    const { ownerId } = req.query;

    if (!ownerId) {
      return res.status(400).json({ error: 'ownerId required' });
    }

    const robots = await robox.getAccountsByOwner(ownerId as string);

    res.json({
      robots: robots.map(r => ({
        id: r.id,
        name: r.name,
        apiKey: r.apiKey,
        balance: r.balance,
        status: r.status,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add credits to robot
app.post('/admin/robots/:id/credits', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    const result = await robox.credit(id, amount, { reason });

    res.json({
      success: true,
      balance: result.balanceAfter,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Regenerate API key
app.post('/admin/robots/:id/regenerate-key', async (req, res) => {
  try {
    const { id } = req.params;

    const newApiKey = await robox.regenerateApiKey(id);

    res.json({
      success: true,
      apiKey: newApiKey,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete robot
app.delete('/admin/robots/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await robox.deleteRobotAccount(id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get system statistics
app.get('/admin/stats', async (req, res) => {
  try {
    const stats = await robox.getStatistics();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           ROBOX-CLEARING API SERVER                       ║
╠═══════════════════════════════════════════════════════════╣
║  Status:    ONLINE                                        ║
║  Port:      ${PORT}                                          ║
║  API:       https://roboxlayer.xyz/api/v1                 ║
╠═══════════════════════════════════════════════════════════╣
║  Endpoints:                                               ║
║    GET  /api/v1/me           - Get robot info             ║
║    GET  /api/v1/balance      - Get balance                ║
║    POST /api/v1/transfer     - Transfer credits           ║
║    POST /api/v1/deduct       - Deduct credits             ║
║    POST /api/v1/credit       - Add credits                ║
║    GET  /api/v1/transactions - List transactions          ║
║    POST /api/v1/escrow       - Create escrow              ║
║    POST /api/v1/batch        - Batch transfer             ║
║    GET  /api/v1/stats        - Get statistics             ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// ==================== USAGE EXAMPLES ====================
/*

# 1. Create a robot (admin)
curl -X POST https://roboxlayer.xyz/admin/robots \
  -H "Content-Type: application/json" \
  -d '{"name": "CleanerBot", "ownerId": "user_123", "initialBalance": 5000}'

# Response:
{
  "success": true,
  "robot": {
    "id": "bot_abc123",
    "name": "CleanerBot",
    "apiKey": "rbx_1234567890abcdef...",
    "balance": 5000,
    "status": "ACTIVE"
  }
}

# 2. Check balance (robot)
curl https://roboxlayer.xyz/api/v1/balance \
  -H "X-API-Key: rbx_1234567890abcdef..."

# 3. Transfer credits (robot)
curl -X POST https://roboxlayer.xyz/api/v1/transfer \
  -H "X-API-Key: rbx_1234567890abcdef..." \
  -H "Content-Type: application/json" \
  -d '{"to": "bot_recipient123", "amount": 100, "memo": "Payment for cleaning"}'

# 4. Transfer by API key (robot)
curl -X POST https://roboxlayer.xyz/api/v1/transfer/by-api-key \
  -H "X-API-Key: rbx_1234567890abcdef..." \
  -H "Content-Type: application/json" \
  -d '{"recipientApiKey": "rbx_recipient...", "amount": 50}'

# 5. Create escrow (robot)
curl -X POST https://roboxlayer.xyz/api/v1/escrow \
  -H "X-API-Key: rbx_1234567890abcdef..." \
  -H "Content-Type: application/json" \
  -d '{"to": "bot_provider", "amount": 500, "condition": "task_complete"}'

# 6. Batch transfer (robot)
curl -X POST https://roboxlayer.xyz/api/v1/batch \
  -H "X-API-Key: rbx_1234567890abcdef..." \
  -H "Content-Type: application/json" \
  -d '{
    "transfers": [
      {"to": "bot_1", "amount": 10},
      {"to": "bot_2", "amount": 20},
      {"to": "bot_3", "amount": 30}
    ]
  }'

*/
