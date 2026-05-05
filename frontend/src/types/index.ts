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

export interface ConnectedAddressInfo {
  address: string;
  relationship_type: string;
  confidence: number;
  transactions: Array<{
    txid: string;
    value_sats: number;
    timestamp?: string;
    is_cioh: boolean;
  }>;
  total_value_sats: number;
  direction: string;
  heuristics: string[];
  is_known_entity: boolean;
  entity_name?: string;
  first_seen?: string;
  last_seen?: string;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  risk: NodeRisk;
  value_sats: number;
  entity_name?: string;
  is_watched: boolean;
  cluster_id?: string;
  cluster_confidence?: number;
  metadata: Record<string, unknown>;
  relationships?: Array<{
    peer_address: string;
    type: string;
    confidence: number;
    shared_transactions: string[];
    total_value_sats: number;
    direction: string;
    heuristics: string[];
  }>;
  transaction_count?: number;
  total_volume_sats?: number;
  connected_addresses?: ConnectedAddressInfo[];
}

export interface GraphEdge {
  source: string;
  target: string;
  value_sats: number;
  txid: string;
  is_cioh: boolean;
  label: string;
  confidence?: number;
  relationship_type?: string;
  details?: Record<string, unknown>;
}

export interface ClusterInfo {
  cluster_id: string;
  addresses: string[];
  confidence: number;
  reason: string;
  entity_type?: string;
  total_value_sats?: number;
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

// Forensic Analysis Types
export enum TransactionType {
  SIMPLE = 'simple',
  COMPLEX = 'complex',
  COINJOIN = 'coinjoin',
  CONSOLIDATION = 'consolidation',
  DISTRIBUTION = 'distribution',
  PEELING = 'peeling',
  UNKNOWN = 'unknown',
}

export enum PrivacyScoreLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  UNKNOWN = 'unknown',
}

export enum ChangeHeuristic {
  NEW_ADDRESS = 'new_address',
  SCRIPT_TYPE_MATCH = 'script_match',
  NON_ROUND_VALUE = 'non_round',
  SMALLER_OUTPUT = 'smaller_output',
  TWO_OUTPUTS = 'two_outputs',
  INPUT_REUSE = 'input_reuse',
  OPTIMAL_CHANGE = 'optimal_change',
}

export interface ChangeOutput {
  address: string;
  value_sats: number;
  confidence: number;
  heuristics: ChangeHeuristic[];
  explanation: string;
}

export interface PaymentOutput {
  address: string;
  value_sats: number;
  is_external: boolean;
  known_entity?: string;
}

export interface InputAnalysis {
  txid: string;
  vout: number;
  address: string;
  value_sats: number;
  script_type: string;
  cluster_id?: string;
}

export interface OutputAnalysis {
  address: string;
  value_sats: number;
  vout: number;
  script_type: string;
  is_change: boolean;
  change_confidence: number;
  is_new_address: boolean;
  cluster_id?: string;
}

export interface CIOHAnalysis {
  applicable: boolean;
  input_addresses: string[];
  cluster_id: string;
  confidence: number;
  warning: string;
}

export interface TransactionAnalysis {
  txid: string;
  tx_type: TransactionType;
  privacy_score: PrivacyScoreLevel;
  inputs: InputAnalysis[];
  total_input_value: number;
  input_addresses: string[];
  outputs: OutputAnalysis[];
  total_output_value: number;
  output_addresses: string[];
  change_output?: ChangeOutput;
  payment_outputs: PaymentOutput[];
  cioh: CIOHAnalysis;
  fee_sats: number;
  fee_rate: number;
  block_height?: number;
  timestamp?: string;
  confirmed: boolean;
  has_address_reuse: boolean;
  is_peeling_candidate: boolean;
  warnings: string[];
}

export interface Cluster {
  cluster_id: string;
  addresses: string[];
  created_by: string[];
  confidence: number;
  reason: string;
  first_seen_block?: number;
  last_seen_block?: number;
  total_value_sats: number;
}

export interface EntityCluster {
  entity_name: string;
  entity_type: string;
  addresses: string[];
  risk_level: string;
  source: string;
}

export interface ForensicStats {
  total_transactions: number;
  total_volume_sats: number;
  unique_counterparties: number;
}

export interface ForensicReport {
  target_address: string;
  transactions_analyzed: TransactionAnalysis[];
  clusters: Cluster[];
  entity_clusters: EntityCluster[];
  flow_paths: unknown[];
  total_transactions: number;
  total_volume_sats: number;
  unique_counterparties: number;
  privacy_score: PrivacyScoreLevel;
  risk_addresses: string[];
  warnings: string[];
}

export interface ForensicGraphResponse {
  graph: GraphData;
  forensic: ForensicReport | null;
}
