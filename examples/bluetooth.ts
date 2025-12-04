/**
 * Bluetooth Communication Example
 * 
 * Demonstrates robot-to-robot communication over Bluetooth:
 * - Device discovery and connection
 * - Direct messaging between robots
 * - Service advertisement and discovery
 * - Transaction negotiation
 * - Mesh networking
 */

import {
  RoboxLayer,
  InMemoryStorage,
  BluetoothManager,
  BluetoothMode,
  BluetoothMessageType,
  BluetoothEventType,
  MessagePriority,
  ProximityZone,
  type BluetoothMessage,
  type BluetoothDevice,
  type TransactionPayload,
} from '../src';

// ============================================
// Setup
// ============================================

const storage = new InMemoryStorage();
const robox = new RoboxLayer({ storage });

// Create robot accounts
async function setup() {
  const robot1 = await robox.createRobotAccount({
    name: 'Robot Alpha',
    initialBalance: 1000,
  });

  const robot2 = await robox.createRobotAccount({
    name: 'Robot Beta',
    initialBalance: 500,
  });

  return { robot1, robot2 };
}

// ============================================
// Basic Bluetooth Setup
// ============================================

async function basicBluetoothExample() {
  console.log('\n=== Basic Bluetooth Setup ===\n');

  const { robot1, robot2 } = await setup();

  // Create Bluetooth managers for each robot
  const bt1 = new BluetoothManager({
    robotId: robot1.id,
    deviceName: 'Robot-Alpha',
    mode: BluetoothMode.BLE,
    autoConnect: false,
    maxConnections: 10,
  });

  const bt2 = new BluetoothManager({
    robotId: robot2.id,
    deviceName: 'Robot-Beta',
    mode: BluetoothMode.BLE,
    onMessage: (msg) => {
      console.log(`Robot Beta received: ${msg.type} from ${msg.from}`);
    },
  });

  // Initialize
  await bt1.initialize();
  await bt2.initialize();

  console.log('✓ Both robots initialized with Bluetooth');

  // Cleanup
  await bt1.shutdown();
  await bt2.shutdown();
}

// ============================================
// Device Discovery
// ============================================

async function deviceDiscoveryExample() {
  console.log('\n=== Device Discovery ===\n');

  const { robot1, robot2 } = await setup();

  const bt1 = new BluetoothManager({
    robotId: robot1.id,
    deviceName: 'Robot-Alpha',
    mode: BluetoothMode.BLE,
    onDeviceDiscovered: (device) => {
      console.log(`Discovered: ${device.name} (RSSI: ${device.rssi})`);
    },
  });

  await bt1.initialize();

  // Start scanning
  console.log('Starting scan...');
  
  // Simulate discovered devices
  bt1.handleDeviceDiscovered({
    id: 'device-001',
    robotId: robot2.id,
    name: 'Robot-Beta',
    address: 'AA:BB:CC:DD:EE:FF',
    rssi: -45,
    txPower: 0,
    services: ['00001800-0000-1000-8000-00805f9b34fb'],
  });

  bt1.handleDeviceDiscovered({
    id: 'device-002',
    robotId: 'robot-gamma',
    name: 'Robot-Gamma',
    address: '11:22:33:44:55:66',
    rssi: -72,
    txPower: 0,
  });

  // Get all discovered devices
  const devices = bt1.getDiscoveredDevices();
  console.log(`\nTotal discovered: ${devices.length} devices`);

  // Check proximity
  for (const device of devices) {
    const zone = bt1.getProximityZone(device.id);
    const distance = bt1.estimateDistance(device.id);
    console.log(`  ${device.name}: Zone=${zone}, Distance≈${distance?.distance}m`);
  }

  // Find devices in NEAR zone
  const nearDevices = bt1.findDevicesInZone(ProximityZone.NEAR);
  console.log(`\nDevices in NEAR zone: ${nearDevices.length}`);

  await bt1.shutdown();
}

// ============================================
// Connection & Messaging
// ============================================

async function messagingExample() {
  console.log('\n=== Connection & Messaging ===\n');

  const { robot1, robot2 } = await setup();

  const receivedMessages: BluetoothMessage[] = [];

  const bt1 = new BluetoothManager({
    robotId: robot1.id,
    deviceName: 'Robot-Alpha',
    mode: BluetoothMode.BLE,
  });

  const bt2 = new BluetoothManager({
    robotId: robot2.id,
    deviceName: 'Robot-Beta',
    mode: BluetoothMode.BLE,
    onMessage: (msg) => {
      receivedMessages.push(msg);
      console.log(`Robot Beta received ${msg.type}`);
    },
  });

  await bt1.initialize();
  await bt2.initialize();

  // Simulate device discovery
  bt1.handleDeviceDiscovered({
    id: 'device-beta',
    robotId: robot2.id,
    name: 'Robot-Beta',
    address: 'AA:BB:CC:DD:EE:FF',
    rssi: -40,
  });

  // Connect
  console.log('Connecting...');
  const connectResult = await bt1.connect({
    deviceId: 'device-beta',
    robotId: robot2.id,
    mode: BluetoothMode.BLE,
    timeout: 5000,
  });

  if (connectResult.success) {
    console.log(`✓ Connected to Robot Beta (latency: ${connectResult.latency}ms)`);

    // Send a message
    const sendResult = await bt1.sendMessage(robot2.id, {
      type: BluetoothMessageType.DATA,
      payload: {
        contentType: 'text/plain',
        data: 'Hello from Robot Alpha!',
        encoding: 'raw',
      },
    });

    console.log(`Message sent: ${sendResult.success ? '✓' : '✗'}`);

    // Send with priority
    await bt1.sendMessage(robot2.id, {
      type: BluetoothMessageType.COMMAND,
      payload: {
        command: 'status',
        responseRequired: true,
      },
    }, {
      priority: MessagePriority.HIGH,
      reliable: true,
      timeout: 5000,
    });

    // Check connection status
    console.log(`\nConnected to ${robot2.id}: ${bt1.isConnected(robot2.id)}`);

    // Disconnect
    await bt1.disconnect('device-beta');
    console.log('Disconnected');
  } else {
    console.log(`Connection failed: ${connectResult.error}`);
  }

  await bt1.shutdown();
  await bt2.shutdown();
}

// ============================================
// Service Advertisement
// ============================================

async function serviceAdvertisementExample() {
  console.log('\n=== Service Advertisement ===\n');

  const { robot1, robot2 } = await setup();

  const bt1 = new BluetoothManager({
    robotId: robot1.id,
    deviceName: 'Robot-Alpha',
    mode: BluetoothMode.BLE,
  });

  await bt1.initialize();
  await bt1.startAdvertising();

  // Advertise charging service
  bt1.advertiseService({
    robotId: robot1.id,
    serviceId: 'svc-charging-001',
    serviceType: 'CHARGING',
    name: 'Fast Charging Station',
    price: 10,
    currency: 'TOKEN',
    available: true,
  });

  // Advertise repair service
  bt1.advertiseService({
    robotId: robot1.id,
    serviceId: 'svc-repair-001',
    serviceType: 'REPAIR',
    name: 'Basic Repair Service',
    price: 50,
    currency: 'TOKEN',
    available: true,
  });

  const services = bt1.getAdvertisedServices();
  console.log(`Advertising ${services.length} services:`);
  for (const svc of services) {
    console.log(`  - ${svc.name} (${svc.serviceType}): ${svc.price} ${svc.currency}`);
  }

  // Stop advertising one service
  bt1.removeAdvertisedService('svc-repair-001');
  console.log(`\nAfter removal: ${bt1.getAdvertisedServices().length} services`);

  await bt1.stopAdvertising();
  await bt1.shutdown();
}

// ============================================
// Transaction Over Bluetooth
// ============================================

async function transactionExample() {
  console.log('\n=== Transaction Over Bluetooth ===\n');

  const { robot1, robot2 } = await setup();

  const bt1 = new BluetoothManager({
    robotId: robot1.id,
    deviceName: 'Robot-Alpha',
    mode: BluetoothMode.BLE,
  });

  const bt2 = new BluetoothManager({
    robotId: robot2.id,
    deviceName: 'Robot-Beta',
    mode: BluetoothMode.BLE,
  });

  await bt1.initialize();
  await bt2.initialize();

  // Setup connection
  bt1.handleDeviceDiscovered({
    id: 'device-beta',
    robotId: robot2.id,
    name: 'Robot-Beta',
    address: 'AA:BB:CC:DD:EE:FF',
    rssi: -40,
  });

  await bt1.connect({
    deviceId: 'device-beta',
    robotId: robot2.id,
    mode: BluetoothMode.BLE,
  });

  // Robot 2 listens for transaction requests
  bt2.onMessage<TransactionPayload>(
    BluetoothMessageType.TRANSACTION_REQUEST,
    async (msg) => {
      console.log(`Transaction request: ${msg.payload.amount} ${msg.payload.type}`);
      
      // Auto-accept transactions under 100
      if (msg.payload.amount <= 100) {
        console.log('  → Accepting transaction');
        // In real scenario, would verify and confirm
      } else {
        console.log('  → Rejecting transaction (amount too high)');
      }
    }
  );

  // Robot 1 requests a transaction
  console.log('Requesting transaction...');
  
  const txResult = await bt1.requestTransaction(robot2.id, {
    from: robot1.id,
    to: robot2.id,
    amount: 50,
    type: 'SERVICE_PAYMENT',
    meta: { service: 'charging' },
  });

  console.log(`Transaction result: ${txResult.accepted ? 'Accepted' : 'Rejected'}`);
  if (txResult.transactionId) {
    console.log(`Transaction ID: ${txResult.transactionId}`);
  }

  await bt1.shutdown();
  await bt2.shutdown();
}

// ============================================
// Mesh Networking
// ============================================

async function meshNetworkExample() {
  console.log('\n=== Mesh Networking ===\n');

  const { robot1, robot2 } = await setup();

  const bt1 = new BluetoothManager({
    robotId: robot1.id,
    deviceName: 'Robot-Alpha',
    mode: BluetoothMode.MESH,
  });

  const bt2 = new BluetoothManager({
    robotId: robot2.id,
    deviceName: 'Robot-Beta',
    mode: BluetoothMode.MESH,
  });

  const bt3 = new BluetoothManager({
    robotId: 'robot-gamma',
    deviceName: 'Robot-Gamma',
    mode: BluetoothMode.MESH,
  });

  await bt1.initialize();
  await bt2.initialize();
  await bt3.initialize();

  // Robot 1 creates the mesh
  console.log('Creating mesh network...');
  const mesh = await bt1.createMesh('RobotSwarm-Alpha');
  console.log(`✓ Mesh created: ${mesh.name} (${mesh.id})`);

  // Setup connections for mesh join
  bt1.handleDeviceDiscovered({
    id: 'device-beta',
    robotId: robot2.id,
    name: 'Robot-Beta',
    address: 'AA:BB:CC:DD:EE:FF',
    rssi: -40,
  });

  await bt1.connect({
    deviceId: 'device-beta',
    robotId: robot2.id,
    mode: BluetoothMode.MESH,
  });

  // Broadcast through mesh
  console.log('\nBroadcasting to mesh...');
  await bt1.meshBroadcast({
    type: BluetoothMessageType.ANNOUNCE,
    payload: {
      message: 'Hello mesh network!',
      timestamp: new Date().toISOString(),
    },
  });

  // Get mesh info
  const currentMesh = bt1.getMesh();
  const nodes = bt1.getMeshNodes();
  console.log(`\nMesh nodes: ${nodes.length}`);
  for (const node of nodes) {
    console.log(`  - ${node.robotId} (${node.role})`);
  }

  // Leave mesh
  console.log('\nLeaving mesh...');
  await bt1.leaveMesh();
  console.log('✓ Left mesh network');

  await bt1.shutdown();
  await bt2.shutdown();
  await bt3.shutdown();
}

// ============================================
// Event Handling
// ============================================

async function eventHandlingExample() {
  console.log('\n=== Event Handling ===\n');

  const { robot1 } = await setup();

  const bt1 = new BluetoothManager({
    robotId: robot1.id,
    deviceName: 'Robot-Alpha',
    mode: BluetoothMode.BLE,
  });

  // Subscribe to all events
  const unsubscribeAll = bt1.onEvent('*', (event) => {
    console.log(`[*] Event: ${event.type}`);
  });

  // Subscribe to specific events
  bt1.onEvent(BluetoothEventType.DEVICE_DISCOVERED, (event) => {
    const device = event.data as BluetoothDevice;
    console.log(`[DISCOVERED] ${device.name} at ${device.address}`);
  });

  bt1.onEvent(BluetoothEventType.DEVICE_CONNECTED, (event) => {
    const device = event.data as BluetoothDevice;
    console.log(`[CONNECTED] ${device.name}`);
  });

  bt1.onEvent(BluetoothEventType.MESSAGE_RECEIVED, (event) => {
    const msg = event.data as BluetoothMessage;
    console.log(`[MESSAGE] ${msg.type} from ${msg.from}`);
  });

  bt1.onEvent(BluetoothEventType.ERROR, (event) => {
    console.log(`[ERROR] ${event.data}`);
  });

  await bt1.initialize();

  // Trigger some events
  bt1.handleDeviceDiscovered({
    id: 'device-test',
    robotId: 'test-robot',
    name: 'Test Robot',
    address: '00:11:22:33:44:55',
    rssi: -50,
  });

  // Unsubscribe
  unsubscribeAll();

  await bt1.shutdown();
}

// ============================================
// Statistics
// ============================================

async function statisticsExample() {
  console.log('\n=== Statistics ===\n');

  const { robot1, robot2 } = await setup();

  const bt1 = new BluetoothManager({
    robotId: robot1.id,
    deviceName: 'Robot-Alpha',
    mode: BluetoothMode.BLE,
  });

  await bt1.initialize();

  // Simulate some activity
  bt1.handleDeviceDiscovered({
    id: 'device-1',
    robotId: robot2.id,
    name: 'Robot-Beta',
    address: 'AA:BB:CC:DD:EE:FF',
    rssi: -40,
  });

  bt1.handleDeviceDiscovered({
    id: 'device-2',
    robotId: 'robot-gamma',
    name: 'Robot-Gamma',
    address: '11:22:33:44:55:66',
    rssi: -60,
  });

  await bt1.connect({
    deviceId: 'device-1',
    robotId: robot2.id,
    mode: BluetoothMode.BLE,
  });

  // Get stats
  const stats = bt1.getStats();
  console.log('Bluetooth Statistics:');
  console.log(`  Devices discovered: ${stats.devicesDiscovered}`);
  console.log(`  Connections (total): ${stats.connectionsTotal}`);
  console.log(`  Connections (active): ${stats.connectionsActive}`);
  console.log(`  Messages sent: ${stats.messagesSent}`);
  console.log(`  Messages received: ${stats.messagesReceived}`);
  console.log(`  Bytes transferred: ${stats.bytesTransferred}`);
  console.log(`  Average latency: ${stats.avgLatency}ms`);
  console.log(`  Errors: ${stats.errors}`);

  // Reset stats
  bt1.resetStats();
  console.log('\n✓ Stats reset');

  await bt1.shutdown();
}

// ============================================
// Run All Examples
// ============================================

async function runAllExamples() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   Robox Bluetooth Communication Examples  ║');
  console.log('╚═══════════════════════════════════════════╝');

  try {
    await basicBluetoothExample();
    await deviceDiscoveryExample();
    await messagingExample();
    await serviceAdvertisementExample();
    await transactionExample();
    await meshNetworkExample();
    await eventHandlingExample();
    await statisticsExample();

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Example failed:', error);
    process.exit(1);
  }
}

runAllExamples();
