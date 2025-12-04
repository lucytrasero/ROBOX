// Bluetooth module exports
export { BluetoothManager } from './BluetoothManager';

export {
  // Enums
  BluetoothDeviceState,
  BluetoothMode,
  BluetoothMessageType,
  MessagePriority,
  MeshNodeRole,
  MeshFeature,
  BluetoothEventType,
  ProximityZone,
  
  // Constants
  PROTOCOL_VERSION,
  ServiceUUIDs,
  CharacteristicUUIDs,
} from './types';

export type {
  // Device types
  BluetoothDevice,
  BluetoothConfig,
  BluetoothStats,
  
  // Message types
  BluetoothMessage,
  BluetoothServiceAd,
  
  // Connection types
  ConnectionRequest,
  ConnectionResult,
  ScanOptions,
  ScanResult,
  SendOptions,
  SendResult,
  
  // Mesh types
  MeshNetwork,
  MeshNode,
  
  // Payload types
  TransactionPayload,
  CommandPayload,
  HandshakePayload,
  DataPayload,
  ErrorPayload,
  
  // Event types
  BluetoothEvent,
  BluetoothEventHandler,
  
  // Distance types
  DistanceEstimate,
} from './types';
