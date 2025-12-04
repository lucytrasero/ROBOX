/**
 * Bluetooth communication types for robot-to-robot interaction
 */

/**
 * Bluetooth device state
 */
export enum BluetoothDeviceState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  PAIRED = 'PAIRED',
  BONDED = 'BONDED',
}

/**
 * Bluetooth connection mode
 */
export enum BluetoothMode {
  CLASSIC = 'CLASSIC',     // Bluetooth Classic (BR/EDR)
  BLE = 'BLE',             // Bluetooth Low Energy
  MESH = 'MESH',           // Bluetooth Mesh
}

/**
 * Message priority levels
 */
export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3,
}

/**
 * Message types for robot communication
 */
export enum BluetoothMessageType {
  // Discovery
  PING = 'PING',
  PONG = 'PONG',
  ANNOUNCE = 'ANNOUNCE',
  DISCOVERY = 'DISCOVERY',
  
  // Handshake
  HANDSHAKE_REQUEST = 'HANDSHAKE_REQUEST',
  HANDSHAKE_RESPONSE = 'HANDSHAKE_RESPONSE',
  HANDSHAKE_COMPLETE = 'HANDSHAKE_COMPLETE',
  
  // Data exchange
  DATA = 'DATA',
  DATA_ACK = 'DATA_ACK',
  STREAM_START = 'STREAM_START',
  STREAM_DATA = 'STREAM_DATA',
  STREAM_END = 'STREAM_END',
  
  // Commands
  COMMAND = 'COMMAND',
  COMMAND_RESPONSE = 'COMMAND_RESPONSE',
  
  // Transactions
  TRANSACTION_REQUEST = 'TRANSACTION_REQUEST',
  TRANSACTION_CONFIRM = 'TRANSACTION_CONFIRM',
  TRANSACTION_REJECT = 'TRANSACTION_REJECT',
  
  // Service
  SERVICE_QUERY = 'SERVICE_QUERY',
  SERVICE_OFFER = 'SERVICE_OFFER',
  SERVICE_ACCEPT = 'SERVICE_ACCEPT',
  
  // Mesh
  MESH_JOIN = 'MESH_JOIN',
  MESH_LEAVE = 'MESH_LEAVE',
  MESH_RELAY = 'MESH_RELAY',
  MESH_BROADCAST = 'MESH_BROADCAST',
  
  // System
  HEARTBEAT = 'HEARTBEAT',
  DISCONNECT = 'DISCONNECT',
  ERROR = 'ERROR',
}

/**
 * Bluetooth device information
 */
export interface BluetoothDevice {
  id: string;
  robotId: string;
  name: string;
  address: string;          // MAC address
  rssi?: number;            // Signal strength
  txPower?: number;         // Transmission power
  state: BluetoothDeviceState;
  mode: BluetoothMode;
  services?: string[];      // Advertised service UUIDs
  manufacturerData?: Buffer;
  lastSeen: Date;
  connectedAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Bluetooth message structure
 */
export interface BluetoothMessage<T = unknown> {
  id: string;
  type: BluetoothMessageType;
  from: string;             // Sender robot ID
  to: string | null;        // Recipient robot ID (null for broadcast)
  payload: T;
  priority: MessagePriority;
  timestamp: Date;
  ttl?: number;             // Time to live in seconds
  hopCount?: number;        // For mesh routing
  encrypted?: boolean;
  signature?: string;
}

/**
 * Service advertisement
 */
export interface BluetoothServiceAd {
  robotId: string;
  serviceId: string;
  serviceType: string;
  name: string;
  price?: number;
  currency?: string;
  available: boolean;
  rssi?: number;
  distance?: number;        // Estimated distance in meters
}

/**
 * Connection request
 */
export interface ConnectionRequest {
  deviceId: string;
  robotId: string;
  mode: BluetoothMode;
  timeout?: number;
  authRequired?: boolean;
  encryptionRequired?: boolean;
}

/**
 * Connection result
 */
export interface ConnectionResult {
  success: boolean;
  deviceId: string;
  robotId?: string;
  error?: string;
  latency?: number;
}

/**
 * Scan options
 */
export interface ScanOptions {
  duration?: number;        // Scan duration in ms
  mode?: BluetoothMode;
  serviceUUIDs?: string[];  // Filter by service UUIDs
  nameFilter?: string;      // Filter by device name
  rssiThreshold?: number;   // Min RSSI to include
  allowDuplicates?: boolean;
}

/**
 * Scan result
 */
export interface ScanResult {
  devices: BluetoothDevice[];
  duration: number;
  scannedAt: Date;
}

/**
 * Message delivery options
 */
export interface SendOptions {
  priority?: MessagePriority;
  reliable?: boolean;       // Require acknowledgment
  encrypted?: boolean;
  timeout?: number;
  retries?: number;
}

/**
 * Message delivery result
 */
export interface SendResult {
  success: boolean;
  messageId: string;
  deliveredAt?: Date;
  error?: string;
  latency?: number;
}

/**
 * Bluetooth mesh node
 */
export interface MeshNode {
  robotId: string;
  address: string;
  role: MeshNodeRole;
  neighbors: string[];
  hopDistance: number;      // Hops from this node
  lastHeartbeat: Date;
  features?: MeshFeature[];
}

/**
 * Mesh node roles
 */
export enum MeshNodeRole {
  NODE = 'NODE',            // Regular node
  RELAY = 'RELAY',          // Relay node
  PROXY = 'PROXY',          // Proxy node (gateway)
  FRIEND = 'FRIEND',        // Friend node (for low power)
  LOW_POWER = 'LOW_POWER',  // Low power node
}

/**
 * Mesh features
 */
export enum MeshFeature {
  RELAY = 'RELAY',
  PROXY = 'PROXY',
  FRIEND = 'FRIEND',
  LOW_POWER = 'LOW_POWER',
}

/**
 * Mesh network info
 */
export interface MeshNetwork {
  id: string;
  name: string;
  nodes: MeshNode[];
  createdAt: Date;
  key?: string;             // Network key (encrypted)
}

/**
 * Bluetooth manager configuration
 */
export interface BluetoothConfig {
  robotId: string;
  deviceName: string;
  mode?: BluetoothMode;
  serviceUUIDs?: string[];
  txPower?: number;
  advertisingInterval?: number;
  scanInterval?: number;
  scanWindow?: number;
  autoConnect?: boolean;
  maxConnections?: number;
  encryptionKey?: string;
  onMessage?: (message: BluetoothMessage) => void | Promise<void>;
  onDeviceDiscovered?: (device: BluetoothDevice) => void;
  onConnectionChanged?: (device: BluetoothDevice) => void;
  onError?: (error: Error) => void;
}

/**
 * Bluetooth statistics
 */
export interface BluetoothStats {
  messagesSent: number;
  messagesReceived: number;
  bytesTransferred: number;
  connectionsTotal: number;
  connectionsActive: number;
  devicesDiscovered: number;
  avgLatency: number;
  errors: number;
}

/**
 * Transaction request payload
 */
export interface TransactionPayload {
  transactionId?: string;
  from: string;
  to: string;
  amount: number;
  type: string;
  meta?: Record<string, unknown>;
}

/**
 * Command payload
 */
export interface CommandPayload {
  command: string;
  args?: Record<string, unknown>;
  responseRequired?: boolean;
}

/**
 * Handshake payload
 */
export interface HandshakePayload {
  robotId: string;
  name?: string;
  publicKey?: string;
  capabilities?: string[];
  version?: string;
}

/**
 * Data payload
 */
export interface DataPayload {
  contentType: string;
  data: unknown;
  encoding?: 'raw' | 'base64' | 'json';
  compressed?: boolean;
}

/**
 * Error payload
 */
export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Bluetooth event types
 */
export enum BluetoothEventType {
  DEVICE_DISCOVERED = 'bluetooth.device.discovered',
  DEVICE_CONNECTED = 'bluetooth.device.connected',
  DEVICE_DISCONNECTED = 'bluetooth.device.disconnected',
  MESSAGE_RECEIVED = 'bluetooth.message.received',
  MESSAGE_SENT = 'bluetooth.message.sent',
  MESH_JOINED = 'bluetooth.mesh.joined',
  MESH_LEFT = 'bluetooth.mesh.left',
  SCAN_STARTED = 'bluetooth.scan.started',
  SCAN_COMPLETED = 'bluetooth.scan.completed',
  ERROR = 'bluetooth.error',
}

/**
 * Bluetooth event
 */
export interface BluetoothEvent<T = unknown> {
  type: BluetoothEventType;
  data: T;
  timestamp: Date;
}

/**
 * Bluetooth event handler
 */
export type BluetoothEventHandler<T = unknown> = (event: BluetoothEvent<T>) => void | Promise<void>;

/**
 * Distance estimation based on RSSI
 */
export interface DistanceEstimate {
  robotId: string;
  rssi: number;
  distance: number;
  accuracy: 'high' | 'medium' | 'low';
  timestamp: Date;
}

/**
 * Proximity zone
 */
export enum ProximityZone {
  IMMEDIATE = 'IMMEDIATE',  // < 0.5m
  NEAR = 'NEAR',            // 0.5m - 3m
  FAR = 'FAR',              // 3m - 10m
  UNKNOWN = 'UNKNOWN',      // > 10m or unreliable
}

/**
 * Protocol version
 */
export const PROTOCOL_VERSION = '1.0.0';

/**
 * Standard service UUIDs
 */
export const ServiceUUIDs = {
  ROBOX_MAIN: '00001800-0000-1000-8000-00805f9b34fb',
  ROBOX_TRANSACTION: '00001801-0000-1000-8000-00805f9b34fb',
  ROBOX_DISCOVERY: '00001802-0000-1000-8000-00805f9b34fb',
  ROBOX_MESH: '00001803-0000-1000-8000-00805f9b34fb',
  ROBOX_DATA: '00001804-0000-1000-8000-00805f9b34fb',
};

/**
 * Characteristic UUIDs
 */
export const CharacteristicUUIDs = {
  TX: '00002a00-0000-1000-8000-00805f9b34fb',
  RX: '00002a01-0000-1000-8000-00805f9b34fb',
  ROBOT_ID: '00002a02-0000-1000-8000-00805f9b34fb',
  STATUS: '00002a03-0000-1000-8000-00805f9b34fb',
};
