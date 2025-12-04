/**
 * BluetoothManager - Robot-to-robot Bluetooth communication layer
 * 
 * Provides BLE and Classic Bluetooth communication for:
 * - Device discovery and pairing
 * - Direct robot-to-robot messaging
 * - Service advertisement
 * - Transaction negotiation over Bluetooth
 * - Mesh networking support
 */

import { EventEmitter } from 'events';
import { generateId } from '../utils';
import type { Logger } from '../types';
import {
  BluetoothConfig,
  BluetoothDevice,
  BluetoothDeviceState,
  BluetoothMessage,
  BluetoothMessageType,
  BluetoothMode,
  BluetoothServiceAd,
  BluetoothStats,
  BluetoothEvent,
  BluetoothEventType,
  BluetoothEventHandler,
  ConnectionRequest,
  ConnectionResult,
  ScanOptions,
  ScanResult,
  SendOptions,
  SendResult,
  MeshNetwork,
  MeshNode,
  MeshNodeRole,
  MessagePriority,
  ProximityZone,
  DistanceEstimate,
  TransactionPayload,
  CommandPayload,
  HandshakePayload,
  DataPayload,
  ErrorPayload,
  ServiceUUIDs,
  CharacteristicUUIDs,
  PROTOCOL_VERSION,
} from './types';

/**
 * Pending message waiting for acknowledgment
 */
interface PendingMessage {
  message: BluetoothMessage;
  resolve: (result: SendResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  retries: number;
  maxRetries: number;
}

/**
 * Message queue item
 */
interface QueuedMessage {
  message: BluetoothMessage;
  options: SendOptions;
  targetDevice: string;
}

/**
 * BluetoothManager - handles all Bluetooth operations for robot communication
 */
export class BluetoothManager extends EventEmitter {
  private config: Required<Omit<BluetoothConfig, 'onMessage' | 'onDeviceDiscovered' | 'onConnectionChanged' | 'onError'>>;
  private logger?: Logger;
  
  // Device management
  private devices: Map<string, BluetoothDevice> = new Map();
  private connectedDevices: Map<string, BluetoothDevice> = new Map();
  private robotIdToDevice: Map<string, string> = new Map(); // robotId -> deviceId
  
  // Message handling
  private pendingMessages: Map<string, PendingMessage> = new Map();
  private messageQueue: QueuedMessage[] = [];
  private messageHandlers: Map<BluetoothMessageType, Set<(msg: BluetoothMessage) => void>> = new Map();
  
  // Service advertisements
  private advertisedServices: Map<string, BluetoothServiceAd> = new Map();
  private discoveredServices: Map<string, BluetoothServiceAd[]> = new Map(); // robotId -> services
  
  // Mesh networking
  private meshNetwork: MeshNetwork | null = null;
  private meshNodes: Map<string, MeshNode> = new Map();
  
  // Statistics
  private stats: BluetoothStats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesTransferred: 0,
    connectionsTotal: 0,
    connectionsActive: 0,
    devicesDiscovered: 0,
    avgLatency: 0,
    errors: 0,
  };
  
  // State
  private isScanning = false;
  private isAdvertising = false;
  private initialized = false;
  
  // Callbacks
  private onMessageCallback?: (message: BluetoothMessage) => void | Promise<void>;
  private onDeviceDiscoveredCallback?: (device: BluetoothDevice) => void;
  private onConnectionChangedCallback?: (device: BluetoothDevice) => void;
  private onErrorCallback?: (error: Error) => void;

  constructor(config: BluetoothConfig, logger?: Logger) {
    super();
    
    this.config = {
      robotId: config.robotId,
      deviceName: config.deviceName,
      mode: config.mode ?? BluetoothMode.BLE,
      serviceUUIDs: config.serviceUUIDs ?? [ServiceUUIDs.ROBOX_MAIN],
      txPower: config.txPower ?? 0,
      advertisingInterval: config.advertisingInterval ?? 100,
      scanInterval: config.scanInterval ?? 100,
      scanWindow: config.scanWindow ?? 100,
      autoConnect: config.autoConnect ?? false,
      maxConnections: config.maxConnections ?? 5,
      encryptionKey: config.encryptionKey ?? '',
    };
    
    this.logger = logger;
    this.onMessageCallback = config.onMessage;
    this.onDeviceDiscoveredCallback = config.onDeviceDiscovered;
    this.onConnectionChangedCallback = config.onConnectionChanged;
    this.onErrorCallback = config.onError;
  }

  // ============================================
  // Initialization
  // ============================================

  /**
   * Initialize Bluetooth manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger?.info('Initializing BluetoothManager', {
      robotId: this.config.robotId,
      mode: this.config.mode,
    });

    // In real implementation, would initialize BLE/Classic adapter here
    // Using noble/bleno or bluetooth-serial-port
    
    this.initialized = true;
    this.emitEvent(BluetoothEventType.SCAN_STARTED, { mode: this.config.mode });
  }

  /**
   * Shutdown Bluetooth manager
   */
  async shutdown(): Promise<void> {
    this.logger?.info('Shutting down BluetoothManager');

    // Stop scanning and advertising
    await this.stopScan();
    await this.stopAdvertising();

    // Disconnect all devices
    for (const device of this.connectedDevices.values()) {
      await this.disconnect(device.id);
    }

    // Clear pending messages
    for (const pending of this.pendingMessages.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('BluetoothManager shutdown'));
    }
    this.pendingMessages.clear();

    // Leave mesh if in one
    if (this.meshNetwork) {
      await this.leaveMesh();
    }

    this.initialized = false;
  }

  // ============================================
  // Device Discovery
  // ============================================

  /**
   * Start scanning for nearby devices
   */
  async startScan(options: ScanOptions = {}): Promise<void> {
    if (this.isScanning) return;
    
    this.isScanning = true;
    
    this.logger?.info('Starting Bluetooth scan', {
      mode: options.mode ?? this.config.mode,
      duration: options.duration,
    });

    this.emitEvent(BluetoothEventType.SCAN_STARTED, options);

    // In real implementation, would use noble.startScanning() or similar
    // Simulating scan with timer
    if (options.duration) {
      setTimeout(() => this.stopScan(), options.duration);
    }
  }

  /**
   * Stop scanning
   */
  async stopScan(): Promise<void> {
    if (!this.isScanning) return;
    
    this.isScanning = false;
    this.logger?.info('Stopped Bluetooth scan');
    
    this.emitEvent(BluetoothEventType.SCAN_COMPLETED, {
      devices: Array.from(this.devices.values()),
      duration: 0,
      scannedAt: new Date(),
    });
  }

  /**
   * Perform a scan and return results
   */
  async scan(options: ScanOptions = {}): Promise<ScanResult> {
    const duration = options.duration ?? 5000;
    const startTime = Date.now();
    
    await this.startScan(options);
    
    return new Promise((resolve) => {
      setTimeout(() => {
        this.stopScan();
        
        let devices = Array.from(this.devices.values());
        
        // Apply filters
        if (options.rssiThreshold !== undefined) {
          devices = devices.filter(d => (d.rssi ?? -100) >= options.rssiThreshold!);
        }
        if (options.nameFilter) {
          const pattern = new RegExp(options.nameFilter, 'i');
          devices = devices.filter(d => pattern.test(d.name));
        }
        if (options.serviceUUIDs?.length) {
          devices = devices.filter(d => 
            d.services?.some(s => options.serviceUUIDs!.includes(s))
          );
        }
        
        resolve({
          devices,
          duration: Date.now() - startTime,
          scannedAt: new Date(),
        });
      }, duration);
    });
  }

  /**
   * Handle discovered device (called by adapter)
   */
  handleDeviceDiscovered(device: Partial<BluetoothDevice>): void {
    const deviceId = device.id ?? device.address ?? generateId();
    
    const existingDevice = this.devices.get(deviceId);
    
    const btDevice: BluetoothDevice = {
      id: deviceId,
      robotId: device.robotId ?? '',
      name: device.name ?? 'Unknown',
      address: device.address ?? '',
      rssi: device.rssi,
      txPower: device.txPower,
      state: existingDevice?.state ?? BluetoothDeviceState.DISCONNECTED,
      mode: device.mode ?? this.config.mode,
      services: device.services,
      manufacturerData: device.manufacturerData,
      lastSeen: new Date(),
      connectedAt: existingDevice?.connectedAt,
      metadata: { ...existingDevice?.metadata, ...device.metadata },
    };

    const isNew = !existingDevice;
    this.devices.set(deviceId, btDevice);
    
    if (isNew) {
      this.stats.devicesDiscovered++;
      this.logger?.debug('Device discovered', { deviceId, name: btDevice.name });
      
      this.emitEvent(BluetoothEventType.DEVICE_DISCOVERED, btDevice);
      this.onDeviceDiscoveredCallback?.(btDevice);
      
      // Auto-connect if enabled
      if (this.config.autoConnect && btDevice.robotId) {
        this.connect({ deviceId, robotId: btDevice.robotId, mode: btDevice.mode });
      }
    }
  }

  /**
   * Get discovered device
   */
  getDevice(deviceId: string): BluetoothDevice | null {
    return this.devices.get(deviceId) ?? null;
  }

  /**
   * Get device by robot ID
   */
  getDeviceByRobotId(robotId: string): BluetoothDevice | null {
    const deviceId = this.robotIdToDevice.get(robotId);
    return deviceId ? this.devices.get(deviceId) ?? null : null;
  }

  /**
   * Get all discovered devices
   */
  getDiscoveredDevices(): BluetoothDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get connected devices
   */
  getConnectedDevices(): BluetoothDevice[] {
    return Array.from(this.connectedDevices.values());
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Connect to a device
   */
  async connect(request: ConnectionRequest): Promise<ConnectionResult> {
    const { deviceId, robotId, mode, timeout = 10000 } = request;

    this.logger?.info('Connecting to device', { deviceId, robotId });

    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, deviceId, error: 'Device not found' };
    }

    if (device.state === BluetoothDeviceState.CONNECTED) {
      return { success: true, deviceId, robotId: device.robotId };
    }

    if (this.connectedDevices.size >= this.config.maxConnections) {
      return { success: false, deviceId, error: 'Max connections reached' };
    }

    // Update state
    device.state = BluetoothDeviceState.CONNECTING;
    this.devices.set(deviceId, device);

    try {
      // In real implementation, would call noble.connect() or similar
      // Simulating connection with timeout
      const startTime = Date.now();
      
      await this.simulateConnection(device, timeout);

      // Update device state
      device.state = BluetoothDeviceState.CONNECTED;
      device.robotId = robotId;
      device.connectedAt = new Date();
      this.devices.set(deviceId, device);
      this.connectedDevices.set(deviceId, device);
      this.robotIdToDevice.set(robotId, deviceId);

      this.stats.connectionsTotal++;
      this.stats.connectionsActive = this.connectedDevices.size;

      this.emitEvent(BluetoothEventType.DEVICE_CONNECTED, device);
      this.onConnectionChangedCallback?.(device);

      // Perform handshake
      await this.performHandshake(device);

      const latency = Date.now() - startTime;
      this.logger?.info('Connected to device', { deviceId, robotId, latency });

      return { success: true, deviceId, robotId, latency };
    } catch (error) {
      device.state = BluetoothDeviceState.DISCONNECTED;
      this.devices.set(deviceId, device);
      
      this.stats.errors++;
      const errorMsg = (error as Error).message;
      this.logger?.error('Connection failed', { deviceId, error: errorMsg });

      return { success: false, deviceId, error: errorMsg };
    }
  }

  /**
   * Disconnect from a device
   */
  async disconnect(deviceId: string): Promise<void> {
    const device = this.connectedDevices.get(deviceId);
    if (!device) return;

    this.logger?.info('Disconnecting from device', { deviceId });

    // Send disconnect message
    try {
      await this.sendMessage(device.robotId, {
        type: BluetoothMessageType.DISCONNECT,
        payload: { reason: 'user_requested' },
      }, { priority: MessagePriority.HIGH });
    } catch {
      // Ignore send errors during disconnect
    }

    // Update state
    device.state = BluetoothDeviceState.DISCONNECTED;
    device.connectedAt = undefined;
    this.devices.set(deviceId, device);
    this.connectedDevices.delete(deviceId);
    this.robotIdToDevice.delete(device.robotId);

    this.stats.connectionsActive = this.connectedDevices.size;

    this.emitEvent(BluetoothEventType.DEVICE_DISCONNECTED, device);
    this.onConnectionChangedCallback?.(device);
  }

  /**
   * Perform handshake with connected device
   */
  private async performHandshake(device: BluetoothDevice): Promise<void> {
    const handshake: HandshakePayload = {
      robotId: this.config.robotId,
      name: this.config.deviceName,
      capabilities: ['transaction', 'discovery', 'mesh'],
      version: PROTOCOL_VERSION,
    };

    // Fire and forget handshake - don't wait for acknowledgment
    await this.sendMessage(device.robotId, {
      type: BluetoothMessageType.HANDSHAKE_REQUEST,
      payload: handshake,
    }, { priority: MessagePriority.HIGH, reliable: false });
  }

  // ============================================
  // Messaging
  // ============================================

  /**
   * Send a message to a robot
   */
  async sendMessage<T = unknown>(
    toRobotId: string,
    message: { type: BluetoothMessageType; payload: T },
    options: SendOptions = {}
  ): Promise<SendResult> {
    const deviceId = this.robotIdToDevice.get(toRobotId);
    if (!deviceId) {
      return { success: false, messageId: '', error: 'Robot not connected' };
    }

    const device = this.connectedDevices.get(deviceId);
    if (!device || device.state !== BluetoothDeviceState.CONNECTED) {
      return { success: false, messageId: '', error: 'Device not connected' };
    }

    const fullMessage: BluetoothMessage<T> = {
      id: generateId(),
      type: message.type,
      from: this.config.robotId,
      to: toRobotId,
      payload: message.payload,
      priority: options.priority ?? MessagePriority.NORMAL,
      timestamp: new Date(),
      ttl: options.timeout ? Math.floor(options.timeout / 1000) : undefined,
      encrypted: options.encrypted ?? false,
    };

    return this.deliverMessage(fullMessage, device, options);
  }

  /**
   * Broadcast a message to all connected devices
   */
  async broadcast<T = unknown>(
    message: { type: BluetoothMessageType; payload: T },
    options: SendOptions = {}
  ): Promise<Map<string, SendResult>> {
    const results = new Map<string, SendResult>();

    for (const device of this.connectedDevices.values()) {
      const result = await this.sendMessage(device.robotId, message, options);
      results.set(device.robotId, result);
    }

    return results;
  }

  /**
   * Internal message delivery
   */
  private async deliverMessage(
    message: BluetoothMessage,
    device: BluetoothDevice,
    options: SendOptions
  ): Promise<SendResult> {
    const startTime = Date.now();

    try {
      // In real implementation, would write to BLE characteristic or serial port
      const messageBytes = this.serializeMessage(message);
      
      if (options.reliable) {
        // Wait for acknowledgment
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.pendingMessages.delete(message.id);
            reject(new Error('Message timeout'));
          }, options.timeout ?? 5000);

          const pending: PendingMessage = {
            message,
            resolve,
            reject,
            timeout,
            retries: 0,
            maxRetries: options.retries ?? 3,
          };

          this.pendingMessages.set(message.id, pending);
        });
      }

      // Fire and forget
      this.stats.messagesSent++;
      this.stats.bytesTransferred += messageBytes.length;
      
      const latency = Date.now() - startTime;
      this.updateAvgLatency(latency);

      this.emitEvent(BluetoothEventType.MESSAGE_SENT, { message, latency });

      return {
        success: true,
        messageId: message.id,
        deliveredAt: new Date(),
        latency,
      };
    } catch (error) {
      this.stats.errors++;
      const errorMsg = (error as Error).message;
      
      this.logger?.error('Message delivery failed', {
        messageId: message.id,
        error: errorMsg,
      });

      return { success: false, messageId: message.id, error: errorMsg };
    }
  }

  /**
   * Handle incoming message (called by adapter)
   */
  handleIncomingMessage(data: Buffer | string): void {
    try {
      const message = this.deserializeMessage(data);
      
      this.stats.messagesReceived++;
      this.stats.bytesTransferred += typeof data === 'string' ? data.length : data.length;

      this.logger?.debug('Message received', {
        type: message.type,
        from: message.from,
      });

      // Handle acknowledgments
      if (message.type === BluetoothMessageType.DATA_ACK) {
        const originalId = (message.payload as { messageId: string }).messageId;
        const pending = this.pendingMessages.get(originalId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingMessages.delete(originalId);
          pending.resolve({
            success: true,
            messageId: originalId,
            deliveredAt: new Date(),
          });
        }
        return;
      }

      // Handle handshake
      if (message.type === BluetoothMessageType.HANDSHAKE_REQUEST) {
        this.handleHandshakeRequest(message as BluetoothMessage<HandshakePayload>);
        return;
      }

      if (message.type === BluetoothMessageType.HANDSHAKE_RESPONSE) {
        this.handleHandshakeResponse(message as BluetoothMessage<HandshakePayload>);
        return;
      }

      // Emit events
      this.emitEvent(BluetoothEventType.MESSAGE_RECEIVED, message);
      
      // Call registered handlers
      const handlers = this.messageHandlers.get(message.type);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(message);
          } catch (error) {
            this.logger?.error('Message handler error', { error });
          }
        }
      }

      // Call global callback
      this.onMessageCallback?.(message);

    } catch (error) {
      this.stats.errors++;
      this.logger?.error('Failed to process incoming message', { error });
      this.emitEvent(BluetoothEventType.ERROR, error);
    }
  }

  /**
   * Register a handler for specific message type
   */
  onMessage<T = unknown>(
    type: BluetoothMessageType,
    handler: (message: BluetoothMessage<T>) => void
  ): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    
    const handlers = this.messageHandlers.get(type)!;
    handlers.add(handler as (msg: BluetoothMessage) => void);

    return () => handlers.delete(handler as (msg: BluetoothMessage) => void);
  }

  /**
   * Handle handshake request
   */
  private handleHandshakeRequest(message: BluetoothMessage<HandshakePayload>): void {
    const { robotId, capabilities } = message.payload;
    
    this.logger?.info('Handshake request received', { from: robotId });

    // Update device info
    const deviceId = this.robotIdToDevice.get(message.from);
    if (deviceId) {
      const device = this.devices.get(deviceId);
      if (device) {
        device.metadata = { ...device.metadata, capabilities };
        this.devices.set(deviceId, device);
      }
    }

    // Send response
    const response: HandshakePayload = {
      robotId: this.config.robotId,
      name: this.config.deviceName,
      capabilities: ['transaction', 'discovery', 'mesh'],
      version: PROTOCOL_VERSION,
    };

    this.sendMessage(message.from, {
      type: BluetoothMessageType.HANDSHAKE_RESPONSE,
      payload: response,
    });
  }

  /**
   * Handle handshake response
   */
  private handleHandshakeResponse(message: BluetoothMessage<HandshakePayload>): void {
    const { robotId, capabilities } = message.payload;
    
    this.logger?.info('Handshake completed', { with: robotId });

    // Update device info
    const deviceId = this.robotIdToDevice.get(message.from);
    if (deviceId) {
      const device = this.devices.get(deviceId);
      if (device) {
        device.metadata = { ...device.metadata, capabilities };
        device.state = BluetoothDeviceState.PAIRED;
        this.devices.set(deviceId, device);
      }
    }

    // Send completion
    this.sendMessage(message.from, {
      type: BluetoothMessageType.HANDSHAKE_COMPLETE,
      payload: { success: true },
    });
  }

  // ============================================
  // Service Advertisement
  // ============================================

  /**
   * Start advertising services
   */
  async startAdvertising(): Promise<void> {
    if (this.isAdvertising) return;
    
    this.isAdvertising = true;
    
    this.logger?.info('Started Bluetooth advertising', {
      name: this.config.deviceName,
      services: this.config.serviceUUIDs,
    });

    // In real implementation, would use bleno.startAdvertising()
  }

  /**
   * Stop advertising
   */
  async stopAdvertising(): Promise<void> {
    if (!this.isAdvertising) return;
    
    this.isAdvertising = false;
    this.logger?.info('Stopped Bluetooth advertising');
  }

  /**
   * Advertise a service
   */
  advertiseService(service: BluetoothServiceAd): void {
    this.advertisedServices.set(service.serviceId, service);
    
    this.logger?.info('Service advertised', {
      serviceId: service.serviceId,
      type: service.serviceType,
    });

    // Broadcast to connected devices
    this.broadcast({
      type: BluetoothMessageType.SERVICE_OFFER,
      payload: service,
    });
  }

  /**
   * Remove advertised service
   */
  removeAdvertisedService(serviceId: string): boolean {
    return this.advertisedServices.delete(serviceId);
  }

  /**
   * Get advertised services
   */
  getAdvertisedServices(): BluetoothServiceAd[] {
    return Array.from(this.advertisedServices.values());
  }

  /**
   * Query services from a robot
   */
  async queryServices(robotId: string): Promise<BluetoothServiceAd[]> {
    const result = await this.sendMessage(robotId, {
      type: BluetoothMessageType.SERVICE_QUERY,
      payload: {},
    }, { reliable: true, timeout: 5000 });

    if (!result.success) {
      throw new Error(`Failed to query services: ${result.error}`);
    }

    return this.discoveredServices.get(robotId) ?? [];
  }

  // ============================================
  // Transaction Support
  // ============================================

  /**
   * Request a transaction over Bluetooth
   */
  async requestTransaction(
    toRobotId: string,
    transaction: TransactionPayload
  ): Promise<{ accepted: boolean; transactionId?: string; error?: string }> {
    const payload: TransactionPayload = {
      ...transaction,
      transactionId: transaction.transactionId ?? generateId(),
      from: this.config.robotId,
    };

    const result = await this.sendMessage(toRobotId, {
      type: BluetoothMessageType.TRANSACTION_REQUEST,
      payload,
    }, { reliable: true, timeout: 30000, priority: MessagePriority.HIGH });

    if (!result.success) {
      return { accepted: false, error: result.error };
    }

    // Wait for confirmation
    return new Promise((resolve) => {
      const unsubscribe = this.onMessage<{ transactionId: string; accepted: boolean }>(
        BluetoothMessageType.TRANSACTION_CONFIRM,
        (msg) => {
          if (msg.payload.transactionId === payload.transactionId) {
            unsubscribe();
            resolve({
              accepted: true,
              transactionId: payload.transactionId,
            });
          }
        }
      );

      const unsubscribeReject = this.onMessage<{ transactionId: string; reason: string }>(
        BluetoothMessageType.TRANSACTION_REJECT,
        (msg) => {
          if (msg.payload.transactionId === payload.transactionId) {
            unsubscribeReject();
            unsubscribe();
            resolve({
              accepted: false,
              transactionId: payload.transactionId,
              error: msg.payload.reason,
            });
          }
        }
      );

      // Timeout
      setTimeout(() => {
        unsubscribe();
        unsubscribeReject();
        resolve({ accepted: false, error: 'Transaction timeout' });
      }, 30000);
    });
  }

  /**
   * Confirm a transaction
   */
  async confirmTransaction(toRobotId: string, transactionId: string): Promise<void> {
    await this.sendMessage(toRobotId, {
      type: BluetoothMessageType.TRANSACTION_CONFIRM,
      payload: { transactionId, accepted: true },
    }, { reliable: true, priority: MessagePriority.HIGH });
  }

  /**
   * Reject a transaction
   */
  async rejectTransaction(
    toRobotId: string,
    transactionId: string,
    reason: string
  ): Promise<void> {
    await this.sendMessage(toRobotId, {
      type: BluetoothMessageType.TRANSACTION_REJECT,
      payload: { transactionId, reason },
    }, { reliable: true, priority: MessagePriority.HIGH });
  }

  // ============================================
  // Command Execution
  // ============================================

  /**
   * Send a command to a robot
   */
  async sendCommand(
    toRobotId: string,
    command: CommandPayload
  ): Promise<{ success: boolean; response?: unknown; error?: string }> {
    const result = await this.sendMessage(toRobotId, {
      type: BluetoothMessageType.COMMAND,
      payload: command,
    }, { reliable: command.responseRequired, timeout: 10000 });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    if (!command.responseRequired) {
      return { success: true };
    }

    // Wait for response
    return new Promise((resolve) => {
      const unsubscribe = this.onMessage(
        BluetoothMessageType.COMMAND_RESPONSE,
        (msg) => {
          if (msg.from === toRobotId) {
            unsubscribe();
            resolve({ success: true, response: msg.payload });
          }
        }
      );

      setTimeout(() => {
        unsubscribe();
        resolve({ success: false, error: 'Command timeout' });
      }, 10000);
    });
  }

  // ============================================
  // Mesh Networking
  // ============================================

  /**
   * Create a mesh network
   */
  async createMesh(name: string): Promise<MeshNetwork> {
    if (this.meshNetwork) {
      throw new Error('Already in a mesh network');
    }

    this.meshNetwork = {
      id: generateId(),
      name,
      nodes: [],
      createdAt: new Date(),
    };

    // Add self as first node
    const selfNode: MeshNode = {
      robotId: this.config.robotId,
      address: '',
      role: MeshNodeRole.RELAY,
      neighbors: [],
      hopDistance: 0,
      lastHeartbeat: new Date(),
    };

    this.meshNetwork.nodes.push(selfNode);
    this.meshNodes.set(this.config.robotId, selfNode);

    this.logger?.info('Mesh network created', { meshId: this.meshNetwork.id, name });

    return this.meshNetwork;
  }

  /**
   * Join an existing mesh network
   */
  async joinMesh(meshId: string, throughRobotId: string): Promise<MeshNetwork> {
    if (this.meshNetwork) {
      throw new Error('Already in a mesh network');
    }

    // Send join request
    const result = await this.sendMessage(throughRobotId, {
      type: BluetoothMessageType.MESH_JOIN,
      payload: { meshId, robotId: this.config.robotId },
    }, { reliable: true, timeout: 10000 });

    if (!result.success) {
      throw new Error(`Failed to join mesh: ${result.error}`);
    }

    // Wait for mesh info
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Mesh join timeout'));
      }, 10000);

      this.onMessage<MeshNetwork>(BluetoothMessageType.MESH_RELAY, (msg) => {
        if ((msg.payload as MeshNetwork).id === meshId) {
          clearTimeout(timeout);
          this.meshNetwork = msg.payload as MeshNetwork;
          
          this.emitEvent(BluetoothEventType.MESH_JOINED, this.meshNetwork);
          this.logger?.info('Joined mesh network', { meshId });
          
          resolve(this.meshNetwork);
        }
      });
    });
  }

  /**
   * Leave the current mesh network
   */
  async leaveMesh(): Promise<void> {
    if (!this.meshNetwork) return;

    const meshId = this.meshNetwork.id;

    // Notify neighbors
    for (const node of this.meshNodes.values()) {
      if (node.robotId !== this.config.robotId) {
        await this.sendMessage(node.robotId, {
          type: BluetoothMessageType.MESH_LEAVE,
          payload: { meshId, robotId: this.config.robotId },
        });
      }
    }

    this.meshNetwork = null;
    this.meshNodes.clear();

    this.emitEvent(BluetoothEventType.MESH_LEFT, { meshId });
    this.logger?.info('Left mesh network', { meshId });
  }

  /**
   * Broadcast a message through the mesh
   */
  async meshBroadcast<T = unknown>(
    message: { type: BluetoothMessageType; payload: T }
  ): Promise<void> {
    if (!this.meshNetwork) {
      throw new Error('Not in a mesh network');
    }

    const meshMessage: BluetoothMessage<T> = {
      id: generateId(),
      type: message.type,
      from: this.config.robotId,
      to: null, // Broadcast
      payload: message.payload,
      priority: MessagePriority.NORMAL,
      timestamp: new Date(),
      hopCount: 0,
    };

    // Send to all direct connections
    for (const device of this.connectedDevices.values()) {
      await this.sendMessage(device.robotId, {
        type: BluetoothMessageType.MESH_BROADCAST,
        payload: meshMessage,
      });
    }
  }

  /**
   * Get current mesh network
   */
  getMesh(): MeshNetwork | null {
    return this.meshNetwork;
  }

  /**
   * Get mesh nodes
   */
  getMeshNodes(): MeshNode[] {
    return Array.from(this.meshNodes.values());
  }

  // ============================================
  // Proximity Detection
  // ============================================

  /**
   * Estimate distance to a device based on RSSI
   */
  estimateDistance(deviceId: string): DistanceEstimate | null {
    const device = this.devices.get(deviceId);
    if (!device || device.rssi === undefined) return null;

    // Simple path loss model: distance = 10 ^ ((txPower - rssi) / (10 * n))
    // where n is the path loss exponent (typically 2-4)
    const txPower = device.txPower ?? this.config.txPower;
    const n = 2.5; // Environmental factor
    const distance = Math.pow(10, (txPower - device.rssi) / (10 * n));

    let accuracy: 'high' | 'medium' | 'low';
    if (device.rssi > -50) accuracy = 'high';
    else if (device.rssi > -70) accuracy = 'medium';
    else accuracy = 'low';

    return {
      robotId: device.robotId,
      rssi: device.rssi,
      distance: Math.round(distance * 100) / 100,
      accuracy,
      timestamp: new Date(),
    };
  }

  /**
   * Get proximity zone for a device
   */
  getProximityZone(deviceId: string): ProximityZone {
    const estimate = this.estimateDistance(deviceId);
    if (!estimate) return ProximityZone.UNKNOWN;

    if (estimate.distance < 0.5) return ProximityZone.IMMEDIATE;
    if (estimate.distance < 3) return ProximityZone.NEAR;
    if (estimate.distance < 10) return ProximityZone.FAR;
    return ProximityZone.UNKNOWN;
  }

  /**
   * Find devices in a proximity zone
   */
  findDevicesInZone(zone: ProximityZone): BluetoothDevice[] {
    const devices: BluetoothDevice[] = [];
    
    for (const device of this.devices.values()) {
      if (this.getProximityZone(device.id) === zone) {
        devices.push(device);
      }
    }

    return devices;
  }

  // ============================================
  // Statistics & Monitoring
  // ============================================

  /**
   * Get Bluetooth statistics
   */
  getStats(): BluetoothStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      bytesTransferred: 0,
      connectionsTotal: this.stats.connectionsTotal,
      connectionsActive: this.connectedDevices.size,
      devicesDiscovered: this.devices.size,
      avgLatency: 0,
      errors: 0,
    };
  }

  /**
   * Check if connected to a robot
   */
  isConnected(robotId: string): boolean {
    const deviceId = this.robotIdToDevice.get(robotId);
    if (!deviceId) return false;
    return this.connectedDevices.has(deviceId);
  }

  /**
   * Check if scanning
   */
  isCurrentlyScanning(): boolean {
    return this.isScanning;
  }

  /**
   * Check if advertising
   */
  isCurrentlyAdvertising(): boolean {
    return this.isAdvertising;
  }

  // ============================================
  // Helpers
  // ============================================

  /**
   * Serialize message for transmission
   */
  private serializeMessage(message: BluetoothMessage): Buffer {
    const json = JSON.stringify(message);
    return Buffer.from(json, 'utf-8');
  }

  /**
   * Deserialize received message
   */
  private deserializeMessage(data: Buffer | string): BluetoothMessage {
    const json = typeof data === 'string' ? data : data.toString('utf-8');
    return JSON.parse(json);
  }

  /**
   * Update average latency
   */
  private updateAvgLatency(latency: number): void {
    const total = this.stats.messagesSent;
    this.stats.avgLatency = ((this.stats.avgLatency * (total - 1)) + latency) / total;
  }

  /**
   * Emit typed event
   */
  private emitEvent<T>(type: BluetoothEventType, data: T): void {
    const event: BluetoothEvent<T> = {
      type,
      data,
      timestamp: new Date(),
    };
    
    this.emit(type, event);
    this.emit('*', event);
  }

  /**
   * Subscribe to events
   */
  onEvent<T = unknown>(type: BluetoothEventType | '*', handler: BluetoothEventHandler<T>): () => void {
    this.on(type, handler);
    return () => this.off(type, handler);
  }

  /**
   * Simulate connection (for development/testing)
   */
  private async simulateConnection(device: BluetoothDevice, timeout: number): Promise<void> {
    // In real implementation, this would be replaced with actual BLE connection logic
    return new Promise((resolve, reject) => {
      const connectTime = Math.random() * 100 + 50; // 50-150ms for fast testing
      
      if (connectTime > timeout) {
        reject(new Error('Connection timeout'));
        return;
      }

      setTimeout(resolve, Math.min(connectTime, 100));
    });
  }

  // ============================================
  // Adapter Integration Points
  // ============================================

  /**
   * Set native adapter (noble/bleno)
   * Called by platform-specific code
   */
  setAdapter(adapter: unknown): void {
    // Would store and use the native Bluetooth adapter
    this.logger?.info('Bluetooth adapter set');
  }

  /**
   * Get characteristic UUIDs
   */
  getCharacteristicUUIDs(): typeof CharacteristicUUIDs {
    return CharacteristicUUIDs;
  }

  /**
   * Get service UUIDs
   */
  getServiceUUIDs(): typeof ServiceUUIDs {
    return ServiceUUIDs;
  }
}
