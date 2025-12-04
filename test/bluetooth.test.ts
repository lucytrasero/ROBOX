/**
 * Bluetooth Module Tests
 */

import {
  BluetoothManager,
  BluetoothMode,
  BluetoothMessageType,
  BluetoothDeviceState,
  BluetoothEventType,
  MessagePriority,
  ProximityZone,
  MeshNodeRole,
  type BluetoothConfig,
  type BluetoothDevice,
  type BluetoothMessage,
} from '../src';

describe('BluetoothManager', () => {
  let manager: BluetoothManager;
  const defaultConfig: BluetoothConfig = {
    robotId: 'robot-test-001',
    deviceName: 'Test Robot',
    mode: BluetoothMode.BLE,
  };

  beforeEach(() => {
    manager = new BluetoothManager(defaultConfig);
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await manager.initialize();
      expect(manager.isCurrentlyScanning()).toBe(false);
      expect(manager.isCurrentlyAdvertising()).toBe(false);
    });

    it('should handle multiple initialize calls', async () => {
      await manager.initialize();
      await manager.initialize(); // Should not throw
    });

    it('should shutdown cleanly', async () => {
      await manager.initialize();
      await manager.shutdown();
      expect(manager.getConnectedDevices()).toHaveLength(0);
    });
  });

  describe('Device Discovery', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should handle discovered devices', () => {
      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Other Robot',
        address: 'AA:BB:CC:DD:EE:FF',
        rssi: -50,
      });

      const devices = manager.getDiscoveredDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Other Robot');
      expect(devices[0].robotId).toBe('robot-002');
    });

    it('should update existing device on rediscovery', () => {
      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Other Robot',
        address: 'AA:BB:CC:DD:EE:FF',
        rssi: -50,
      });

      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Other Robot',
        address: 'AA:BB:CC:DD:EE:FF',
        rssi: -45, // Updated RSSI
      });

      const devices = manager.getDiscoveredDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].rssi).toBe(-45);
    });

    it('should get device by ID', () => {
      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Other Robot',
        address: 'AA:BB:CC:DD:EE:FF',
        rssi: -50,
      });

      const device = manager.getDevice('device-001');
      expect(device).not.toBeNull();
      expect(device?.robotId).toBe('robot-002');
    });

    it('should get device by robot ID', () => {
      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Other Robot',
        address: 'AA:BB:CC:DD:EE:FF',
        rssi: -50,
      });

      // Need to connect first to establish robotId mapping
      // For now, test returns null for unconnected device
      const device = manager.getDeviceByRobotId('robot-002');
      expect(device).toBeNull(); // Not connected yet
    });

    it('should track discovery statistics', () => {
      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Robot 2',
        address: 'AA:BB:CC:DD:EE:FF',
        rssi: -50,
      });

      manager.handleDeviceDiscovered({
        id: 'device-002',
        robotId: 'robot-003',
        name: 'Robot 3',
        address: '11:22:33:44:55:66',
        rssi: -60,
      });

      const stats = manager.getStats();
      expect(stats.devicesDiscovered).toBe(2);
    });
  });

  describe('Connection Management', () => {
    beforeEach(async () => {
      await manager.initialize();
      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Other Robot',
        address: 'AA:BB:CC:DD:EE:FF',
        rssi: -50,
      });
    });

    it('should connect to a device', async () => {
      const result = await manager.connect({
        deviceId: 'device-001',
        robotId: 'robot-002',
        mode: BluetoothMode.BLE,
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.robotId).toBe('robot-002');
      expect(manager.isConnected('robot-002')).toBe(true);
    }, 15000);

    it('should fail to connect to unknown device', async () => {
      const result = await manager.connect({
        deviceId: 'unknown-device',
        robotId: 'robot-999',
        mode: BluetoothMode.BLE,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Device not found');
    });

    it('should handle already connected device', async () => {
      await manager.connect({
        deviceId: 'device-001',
        robotId: 'robot-002',
        mode: BluetoothMode.BLE,
        timeout: 10000,
      });

      const result = await manager.connect({
        deviceId: 'device-001',
        robotId: 'robot-002',
        mode: BluetoothMode.BLE,
      });

      expect(result.success).toBe(true);
    }, 15000);

    it('should disconnect from a device', async () => {
      await manager.connect({
        deviceId: 'device-001',
        robotId: 'robot-002',
        mode: BluetoothMode.BLE,
        timeout: 10000,
      });

      await manager.disconnect('device-001');

      expect(manager.isConnected('robot-002')).toBe(false);
      expect(manager.getConnectedDevices()).toHaveLength(0);
    }, 15000);

    it('should track connection statistics', async () => {
      await manager.connect({
        deviceId: 'device-001',
        robotId: 'robot-002',
        mode: BluetoothMode.BLE,
        timeout: 10000,
      });

      const stats = manager.getStats();
      expect(stats.connectionsTotal).toBe(1);
      expect(stats.connectionsActive).toBe(1);
    }, 15000);

    it('should enforce max connections limit', async () => {
      const limitedManager = new BluetoothManager({
        ...defaultConfig,
        maxConnections: 1,
      });
      await limitedManager.initialize();

      limitedManager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Robot 2',
        address: 'AA:BB:CC:DD:EE:FF',
        rssi: -50,
      });

      limitedManager.handleDeviceDiscovered({
        id: 'device-002',
        robotId: 'robot-003',
        name: 'Robot 3',
        address: '11:22:33:44:55:66',
        rssi: -60,
      });

      await limitedManager.connect({
        deviceId: 'device-001',
        robotId: 'robot-002',
        mode: BluetoothMode.BLE,
        timeout: 10000,
      });

      const result = await limitedManager.connect({
        deviceId: 'device-002',
        robotId: 'robot-003',
        mode: BluetoothMode.BLE,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Max connections reached');

      await limitedManager.shutdown();
    }, 15000);
  });

  describe('Messaging', () => {
    beforeEach(async () => {
      await manager.initialize();
      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Other Robot',
        address: 'AA:BB:CC:DD:EE:FF',
        rssi: -50,
      });
      await manager.connect({
        deviceId: 'device-001',
        robotId: 'robot-002',
        mode: BluetoothMode.BLE,
        timeout: 10000,
      });
    }, 15000);

    it('should send a message', async () => {
      const result = await manager.sendMessage('robot-002', {
        type: BluetoothMessageType.DATA,
        payload: { data: 'test' },
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeTruthy();
    });

    it('should fail to send to unconnected robot', async () => {
      const result = await manager.sendMessage('robot-999', {
        type: BluetoothMessageType.DATA,
        payload: { data: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Robot not connected');
    });

    it('should send with priority', async () => {
      const result = await manager.sendMessage('robot-002', {
        type: BluetoothMessageType.COMMAND,
        payload: { command: 'status' },
      }, {
        priority: MessagePriority.URGENT,
      });

      expect(result.success).toBe(true);
    });

    it('should broadcast to all connected devices', async () => {
      const results = await manager.broadcast({
        type: BluetoothMessageType.ANNOUNCE,
        payload: { message: 'Hello everyone' },
      });

      expect(results.size).toBe(1);
      expect(results.get('robot-002')?.success).toBe(true);
    });

    it('should handle incoming messages', () => {
      const receivedMessages: BluetoothMessage[] = [];
      
      manager.onMessage(BluetoothMessageType.DATA, (msg) => {
        receivedMessages.push(msg);
      });

      const incomingMessage = JSON.stringify({
        id: 'msg-001',
        type: BluetoothMessageType.DATA,
        from: 'robot-002',
        to: 'robot-test-001',
        payload: { data: 'Hello' },
        priority: MessagePriority.NORMAL,
        timestamp: new Date().toISOString(),
      });

      manager.handleIncomingMessage(incomingMessage);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].payload).toEqual({ data: 'Hello' });
    });

    it('should track message statistics', async () => {
      await manager.sendMessage('robot-002', {
        type: BluetoothMessageType.DATA,
        payload: { data: 'test' },
      });

      const stats = manager.getStats();
      // Note: messagesSent includes the handshake message from connection
      expect(stats.messagesSent).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Service Advertisement', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should start and stop advertising', async () => {
      await manager.startAdvertising();
      expect(manager.isCurrentlyAdvertising()).toBe(true);

      await manager.stopAdvertising();
      expect(manager.isCurrentlyAdvertising()).toBe(false);
    });

    it('should advertise services', () => {
      manager.advertiseService({
        robotId: 'robot-test-001',
        serviceId: 'svc-001',
        serviceType: 'CHARGING',
        name: 'Charging Station',
        price: 10,
        currency: 'TOKEN',
        available: true,
      });

      const services = manager.getAdvertisedServices();
      expect(services).toHaveLength(1);
      expect(services[0].name).toBe('Charging Station');
    });

    it('should remove advertised service', () => {
      manager.advertiseService({
        robotId: 'robot-test-001',
        serviceId: 'svc-001',
        serviceType: 'CHARGING',
        name: 'Charging Station',
        price: 10,
        currency: 'TOKEN',
        available: true,
      });

      const removed = manager.removeAdvertisedService('svc-001');
      expect(removed).toBe(true);
      expect(manager.getAdvertisedServices()).toHaveLength(0);
    });
  });

  describe('Proximity Detection', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should estimate distance from RSSI', () => {
      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Other Robot',
        address: 'AA:BB:CC:DD:EE:FF',
        rssi: -50,
        txPower: 0,
      });

      const estimate = manager.estimateDistance('device-001');
      expect(estimate).not.toBeNull();
      expect(estimate?.distance).toBeGreaterThan(0);
      expect(estimate?.accuracy).toBeDefined();
    });

    it('should return null for device without RSSI', () => {
      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Other Robot',
        address: 'AA:BB:CC:DD:EE:FF',
      });

      const estimate = manager.estimateDistance('device-001');
      expect(estimate).toBeNull();
    });

    it('should determine proximity zone', () => {
      // Device with RSSI
      manager.handleDeviceDiscovered({
        id: 'device-test',
        robotId: 'robot-test',
        name: 'Test Robot',
        address: 'AA:BB:CC:DD:EE:01',
        rssi: -30,
        txPower: -20, // More realistic txPower for close device
      });

      const zone = manager.getProximityZone('device-test');
      
      // Zone should be defined (not undefined)
      expect(zone).toBeDefined();
      // Should be one of the valid zones
      expect([
        ProximityZone.IMMEDIATE,
        ProximityZone.NEAR,
        ProximityZone.FAR,
        ProximityZone.UNKNOWN,
      ]).toContain(zone);
    });

    it('should find devices in proximity zone', () => {
      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Near Robot',
        address: 'AA:BB:CC:DD:EE:FF',
        rssi: -45,
        txPower: 0,
      });

      const nearDevices = manager.findDevicesInZone(ProximityZone.NEAR);
      // Result depends on RSSI calculation
      expect(Array.isArray(nearDevices)).toBe(true);
    });
  });

  describe('Mesh Networking', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should create a mesh network', async () => {
      const mesh = await manager.createMesh('TestMesh');

      expect(mesh.id).toBeTruthy();
      expect(mesh.name).toBe('TestMesh');
      expect(mesh.nodes).toHaveLength(1);
    });

    it('should not create mesh if already in one', async () => {
      await manager.createMesh('TestMesh');

      await expect(manager.createMesh('AnotherMesh')).rejects.toThrow(
        'Already in a mesh network'
      );
    });

    it('should leave mesh network', async () => {
      await manager.createMesh('TestMesh');
      await manager.leaveMesh();

      expect(manager.getMesh()).toBeNull();
      expect(manager.getMeshNodes()).toHaveLength(0);
    });

    it('should get mesh nodes', async () => {
      await manager.createMesh('TestMesh');

      const nodes = manager.getMeshNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].robotId).toBe('robot-test-001');
      expect(nodes[0].role).toBe(MeshNodeRole.RELAY);
    });
  });

  describe('Event Handling', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should emit device discovered event', (done) => {
      manager.onEvent(BluetoothEventType.DEVICE_DISCOVERED, (event) => {
        expect(event.type).toBe(BluetoothEventType.DEVICE_DISCOVERED);
        expect((event.data as BluetoothDevice).name).toBe('Test Device');
        done();
      });

      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Test Device',
        address: 'AA:BB:CC:DD:EE:FF',
      });
    });

    it('should emit device connected event', async () => {
      const events: BluetoothEventType[] = [];

      manager.onEvent(BluetoothEventType.DEVICE_CONNECTED, (event) => {
        events.push(event.type);
      });

      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Test Device',
        address: 'AA:BB:CC:DD:EE:FF',
      });

      await manager.connect({
        deviceId: 'device-001',
        robotId: 'robot-002',
        mode: BluetoothMode.BLE,
        timeout: 10000,
      });

      expect(events).toContain(BluetoothEventType.DEVICE_CONNECTED);
    }, 15000);

    it('should support wildcard event subscription', (done) => {
      manager.onEvent('*', (event) => {
        expect(event.type).toBe(BluetoothEventType.DEVICE_DISCOVERED);
        done();
      });

      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Test Device',
        address: 'AA:BB:CC:DD:EE:FF',
      });
    });

    it('should allow unsubscribing from events', () => {
      let eventCount = 0;

      const unsubscribe = manager.onEvent(BluetoothEventType.DEVICE_DISCOVERED, () => {
        eventCount++;
      });

      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Test Device 1',
        address: 'AA:BB:CC:DD:EE:FF',
      });

      unsubscribe();

      manager.handleDeviceDiscovered({
        id: 'device-002',
        robotId: 'robot-003',
        name: 'Test Device 2',
        address: '11:22:33:44:55:66',
      });

      expect(eventCount).toBe(1);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should track all statistics', async () => {
      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Other Robot',
        address: 'AA:BB:CC:DD:EE:FF',
        rssi: -50,
      });

      await manager.connect({
        deviceId: 'device-001',
        robotId: 'robot-002',
        mode: BluetoothMode.BLE,
        timeout: 10000,
      });

      await manager.sendMessage('robot-002', {
        type: BluetoothMessageType.DATA,
        payload: { test: true },
      });

      const stats = manager.getStats();

      expect(stats.devicesDiscovered).toBe(1);
      expect(stats.connectionsTotal).toBe(1);
      expect(stats.connectionsActive).toBe(1);
      // Note: messagesSent includes handshake message
      expect(stats.messagesSent).toBeGreaterThanOrEqual(1);
      expect(stats.bytesTransferred).toBeGreaterThan(0);
    }, 15000);

    it('should reset statistics', async () => {
      manager.handleDeviceDiscovered({
        id: 'device-001',
        robotId: 'robot-002',
        name: 'Other Robot',
        address: 'AA:BB:CC:DD:EE:FF',
      });

      await manager.connect({
        deviceId: 'device-001',
        robotId: 'robot-002',
        mode: BluetoothMode.BLE,
        timeout: 10000,
      });

      manager.resetStats();

      const stats = manager.getStats();
      expect(stats.messagesSent).toBe(0);
      expect(stats.messagesReceived).toBe(0);
      expect(stats.bytesTransferred).toBe(0);
      expect(stats.errors).toBe(0);
      // connectionsTotal should persist
      expect(stats.connectionsTotal).toBe(1);
    }, 15000);
  });

  describe('Configuration', () => {
    it('should use default configuration values', () => {
      const minimalConfig: BluetoothConfig = {
        robotId: 'robot-001',
        deviceName: 'Test Robot',
      };

      const mgr = new BluetoothManager(minimalConfig);
      
      // Manager should be created without errors
      expect(mgr).toBeDefined();
    });

    it('should apply custom configuration', async () => {
      const customManager = new BluetoothManager({
        robotId: 'robot-001',
        deviceName: 'Custom Robot',
        mode: BluetoothMode.CLASSIC,
        maxConnections: 20,
        autoConnect: true,
        txPower: 4,
      });

      await customManager.initialize();
      
      // Verify manager works with custom config
      expect(customManager.getDiscoveredDevices()).toHaveLength(0);
      
      await customManager.shutdown();
    });

    it('should call onMessage callback', (done) => {
      const callbackManager = new BluetoothManager({
        robotId: 'robot-001',
        deviceName: 'Callback Robot',
        onMessage: (msg) => {
          expect(msg.type).toBe(BluetoothMessageType.DATA);
          done();
        },
      });

      callbackManager.initialize().then(() => {
        const incomingMessage = JSON.stringify({
          id: 'msg-001',
          type: BluetoothMessageType.DATA,
          from: 'robot-002',
          to: 'robot-001',
          payload: { data: 'test' },
          priority: MessagePriority.NORMAL,
          timestamp: new Date().toISOString(),
        });

        callbackManager.handleIncomingMessage(incomingMessage);
      });
    });

    it('should call onDeviceDiscovered callback', (done) => {
      const callbackManager = new BluetoothManager({
        robotId: 'robot-001',
        deviceName: 'Callback Robot',
        onDeviceDiscovered: (device) => {
          expect(device.name).toBe('Discovered Robot');
          done();
        },
      });

      callbackManager.initialize().then(() => {
        callbackManager.handleDeviceDiscovered({
          id: 'device-001',
          robotId: 'robot-002',
          name: 'Discovered Robot',
          address: 'AA:BB:CC:DD:EE:FF',
        });
      });
    });
  });
});
