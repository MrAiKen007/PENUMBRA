# Changelog

Todas as mudanças notáveis neste projeto serão documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [0.1.0] - 2026-05-05

### Adicionado

#### Core Features
- **Privacy Engine** com scoring 0-100 para UTXOs
  - Heurística CIOH (Common Input Ownership)
  - Detecção de Address Reuse
  - Identificação de KYC Contamination
  - Change Exposure scoring
  - Round Amounts detection
  
- **Coin Control** avançado
  - Seleção manual de UTXOs
  - Estimativa de fees (low/medium/high)
  - Cálculo de impacto de privacidade
  - Sugestão automática de UTXOs ótimos
  - Construção de PSBT para hardware wallets
  
- **Graph Builder** visual
  - Grafo D3.js interativo
  - Nós: endereços, transações, entidades
  - Arestas CIOH destacadas
  - Clusters de propriedade comum
  - Clique para explorar endereços conectados
  - Análise forense integrada
  
- **Alert Engine** em tempo real
  - WebSocket para notificações instantâneas
  - Monitorização de novas transações
  - Detecção de dust attacks
  - Alertas de KYC contamination
  - Notificações de fees anormais

#### Backend
- API REST com FastAPI
- Integração Bitcoin Core RPC
- Database SQLite com SQLAlchemy async
- WebSocket manager
- ZMQ listener para blocks/transactions
- Mempool.space API fallback

#### Frontend
- Interface React + TypeScript
- Dashboard com métricas de privacidade
- UTXO list com seleção
- Visualização de grafo D3.js
- Painel de alertas em tempo real
- Design system consistente (#FF5533 brand)

#### Documentação
- README.md profissional
- GUIDE.md com placeholders para vídeos
- DESIGN.md com especificações visuais
- PRODUCT.md com definição de produto

### Segurança
- Self-hosted (dados locais)
- No KYC required
- PSBT support para assinatura offline
- Sem telemetria ou tracking

### Conhecido
- Otimizado para Signet (testnet)
- Privacy Score heurístico (não criptográfico)
- Graph analysis limitada por disponibilidade de dados

---

## Roadmap

### [0.2.0] - Planejado
- CoinJoin integration (WabiSabi)
- PayJoin (BIP78) support
- Lightning Network analysis
- Mobile app (React Native)

### [1.0.0] - Futuro
- Mainnet ready
- Security audit por terceiros
- Hardware wallet direct integration
- Reproducible builds

---

## Notas

Para versões anteriores ao 0.1.0, consulte os commits do Git.
