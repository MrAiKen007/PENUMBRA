// UTXO Types
export enum UTXOLabel {
  SAFE = 'safe',
  KYC = 'kyc',
  MIXED = 'mixed',
  DOXXIC = 'doxxic',
  UNKNOWN = 'unknown',
}

export interface UTXO {
  utxo_id: string;
  txid: string;
  vout: number;
  value: number;
  address: string;
  label: UTXOLabel;
  confirmed: boolean;
  block_height?: number;
}

export interface UTXOWithScore {
  utxo: UTXO;
  privacy_score: number;
  cioh_risk: boolean;
  kyc_linked: boolean;
  suggestions: string[];
}

// Transaction Types
export interface TransactionInput {
  txid: string;
  vout: number;
  address: string;
  value_sats: number;
  script_sig?: string;
  witness?: string[];
}

export interface TransactionOutput {
  address: string;
  value_sats: number;
  script_pub_key?: string;
  is_change: boolean;
}

export interface Transaction {
  txid: string;
  version: number;
  locktime: number;
  size: number;
  vsize: number;
  fee_sats: number;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  confirmed: boolean;
  block_height?: number;
  block_time?: number;
}

// Privacy Types
export interface ScoreBreakdown {
  base_score: number;
  cioh_penalty: number;
  address_reuse_penalty: number;
  kyc_contamination_penalty: number;
  change_exposure_penalty: number;
  round_amount_penalty: number;
}

export interface PrivacyAlert {
  severity: string;
  title: string;
  message: string;
  suggestion: string;
}

export interface PrivacyReport {
  score: number;
  label: string;
  breakdown: ScoreBreakdown;
  alerts: PrivacyAlert[];
  suggestions: string[];
  is_safe_to_send: boolean;
}

// Graph Types
export enum NodeType {
  ADDRESS = 'address',
  TRANSACTION = 'transaction',
  CLUSTER = 'cluster',
  ENTITY = 'entity',
}

export enum NodeRisk {
  SAFE = 'safe',
  CAUTION = 'caution',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  risk: NodeRisk;
  value_sats: number;
  entity_name?: string;
  is_watched: boolean;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  value_sats: number;
  txid: string;
  is_cioh: boolean;
  label: string;
}

export interface ClusterInfo {
  cluster_id: string;
  addresses: string[];
  confidence: number;
  reason: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: ClusterInfo[];
  depth_reached: number;
  warnings: string[];
  stats: Record<string, number>;
}

// Alert Types
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum AlertType {
  CIOH = 'cioh',
  ADDRESS_REUSE = 'address_reuse',
  KYC_CONTAMINATION = 'kyc_contamination',
  PEELING_CHAIN = 'peeling_chain',
  DUST_ATTACK = 'dust_attack',
  LARGE_AMOUNT = 'large_amount',
  FEE_ANOMALY = 'fee_anomaly',
  ENTITY_DETECTED = 'entity_detected',
  CHANGE_EXPOSED = 'change_exposed',
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  suggestion: string;
  timestamp: string;
  txid?: string;
  address?: string;
  acknowledged: boolean;
  metadata: Record<string, unknown>;
}

export interface AlertSummary {
  total_alerts: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  by_type: Record<string, number>;
  unacknowledged: number;
}

// Coin Control Types
export interface CoinControlRequest {
  wallet_address: string;
  selected_utxo_ids: string[];
  destination_address: string;
  amount_sats: number;
  change_address: string;
  fee_rate: string | number;
}

export interface FeeEstimate {
  total_fee_sats: number;
  fee_rate_sat_vb: number;
  estimated_vbytes: number;
  estimated_minutes: number;
}

export interface CoinControlResult {
  psbt_hex: string;
  txid_preview: string;
  inputs: Record<string, unknown>[];
  outputs: Record<string, unknown>[];
  fee_estimate: FeeEstimate;
  privacy_score: number;
  privacy_label: string;
  total_input_sats: number;
  change_sats: number;
}

export interface UTXOSelectionSuggestion {
  suggested_utxo_ids: string[];
  privacy_score: number;
  total_value_sats: number;
  reasoning: string;
}

// WebSocket Types
export interface WebSocketMessage {
  type: 'alert' | 'system' | 'transaction_received';
  data: Alert | string | Transaction;
  timestamp: string;
}

// Wallet Types
export interface WalletInfo {
  name: string;
  path?: string;
}

export interface WalletListResponse {
  wallets: WalletInfo[];
  loaded: string[];
  current: string | null;
}

export interface CreateWalletRequest {
  name: string;
  passphrase?: string;
  descriptors?: boolean;
}

export interface LoadWalletRequest {
  name: string;
}

export interface NewAddressRequest {
  label?: string;
  address_type?: string;
}

export interface NewAddressResponse {
  address: string;
  label?: string;
  type: string;
}

export interface WalletBalance {
  balance: number;
  currency: string;
}
