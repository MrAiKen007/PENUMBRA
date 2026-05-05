<p align="center">
  <img src="./frontend/public/Penumbra.svg" width="320" alt="PENUMBRA Logo">
</p>


<h1 align="center">PENUMBRA</h1>

<p align="center">
  <strong>Carteira Bitcoin com Privacy-by-Design</strong><br>
  Análise de rastreabilidade, Coin Control inteligente e alertas em tempo real.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Bitcoin-Only-FF5533?style=flat-square&logo=bitcoin&logoColor=white" alt="Bitcoin Only">
  <img src="https://img.shields.io/badge/Privacy-First-0A0A0A?style=flat-square" alt="Privacy First">
  <img src="https://img.shields.io/badge/Open%20Source-MIT-16a34a?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/Python-3.10+-2563eb?style=flat-square&logo=python&logoColor=white" alt="Python 3.10+">
  <img src="https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 18+">
</p>

<p align="center">
  <a href="#-funcionalidades">Funcionalidades</a> •
  <a href="#-instalação">Instalação</a> •
  <a href="#-documentação">Docs</a> •
  <a href="#-contribuir">Contribuir</a> •
  <a href="#-licença">Licença</a>
</p>

---

## Visão

A maioria das carteiras Bitcoin assume que privacidade é automática, **não é**. O PENUMBRA torna a privacidade **acessível a não-especialistas**, revelando riscos de rastreabilidade e sugerindo acções concretas sem exigir conhecimento técnico profundo.

> *"Privacidade explicada, não assumida."*

---

## Funcionalidades

### Privacy Engine
Scoring de privacidade **0-100** para cada UTXO com heurísticas avançadas:

| Heurística | Impacto | Descrição |
|------------|---------|-----------|
| **CIOH** | -25 pts | Common Input Ownership — múltiplos inputs na mesma transação |
| **Address Reuse** | -30 pts | Reutilização do mesmo endereço |
| **KYC Contamination** | -20 pts | UTXO proveniente de exchange KYC |
| **Change Exposure** | -15 pts | Output de troco identificável |
| **Round Amounts** | -10 pts | Valores redondos (fingerprinting) |

### Coin Control
Seleção inteligente de UTXOs com:
- **Estimativa de fees** em tempo real (low/medium/high)
- **Cálculo de impacto** de privacidade antes de enviar
- **Construção de PSBTs** para hardware wallets
- **Sugestão automática** de UTXOs óptimos para minimizar risco

### Graph Builder
Visualização interativa de rastreabilidade (D3.js):
- Nós: endereços, transações, entidades
- Arestas CIOH destacadas em laranja
- Clusters de propriedade comum
- Entidades conhecidas (exchanges, mixers, faucets)
- Clique para explorar endereços conectados

### Alert Engine
Monitorização em tempo real via WebSocket:
- Novas transações em endereços vigiados
- Dust attacks detectados
- KYC contamination alerts
- Fees anormalmente altas/baixas
- Notificações de privacidade degradada

---

## Instalação

### Pré-requisitos
- Python 3.10+
- Node.js 18+
- Bitcoin Core (mainnet, testnet ou signet)

### Backend
```bash
# Clone o repositório
git clone https://github.com/MrAiKen007/PENUMBRA.git
cd PENUMBRA

# Cria ambiente virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou: venv\Scripts\activate  # Windows

# Instala dependências
pip install -r requirements.txt

# Configura variáveis de ambiente
cp .env.example .env
# Edita .env com as tuas configurações RPC
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Configuração .env
```env
# Bitcoin Core RPC
BITCOIN_RPC_USER=seu_usuario
BITCOIN_RPC_PASSWORD=sua_senha
BITCOIN_RPC_PORT=8332       # Mainnet
# BITCOIN_RPC_PORT=38332    # Signet

# App
CORS_ORIGINS=http://localhost:5173
```

---

## Documentação

### API Endpoints

#### Wallet
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/wallet/list` | GET | Lista carteiras disponíveis |
| `/api/wallet/load` | POST | Carrega carteira específica |
| `/api/wallet/balance` | GET | Saldo da carteira atual |

#### UTXOs & Privacy
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/utxos` | GET | Lista UTXOs com metadados |
| `/api/privacy/score` | POST | Calcula privacy score |
| `/api/psbt/build` | POST | Constrói PSBT para assinatura |
| `/api/psbt/suggest` | GET | Sugere UTXOs óptimos |

#### Análise & Graph
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/graph/{address}` | GET | Grafo de rastreio completo |
| `/api/graph/forensic/{addr}` | GET | Análise forense detalhada |
| `/api/alerts` | GET | Lista alertas ativos |
| `/ws/alerts` | WS | WebSocket alertas em tempo real |

---

## Contribuir

Contribuições são bem-vindas! Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para guidelines.

### Desenvolvimento rápido
```bash
# Backend
uvicorn app.main:app --reload --port 8000

# Frontend (outro terminal)
cd frontend
npm run dev
```

### Reportar issues
- Bugs: [GitHub Issues](https://github.com/MrAiKen007/PENUMBRA/issues)
- Features: Discussions
- Security: Contacto privado (ver SECURITY.md)

---

## Segurança

- **Self-hosted**: Os teus dados nunca saem do teu servidor
- **No KYC**: Não requer identificação
- **Open Source**: Código auditável por qualquer pessoa
- **PSBT support**: Assinatura offline com hardware wallets

---

## Roadmap

- [x] Privacy Engine com heurísticas CIOH
- [x] Coin Control com sugestões automáticas
- [x] Graph Builder visual (D3.js)
- [x] Alert Engine WebSocket
- [x] Frontend React + TypeScript
- [ ] CoinJoin integration (WabiSabi)
- [ ] PayJoin (BIP78) support
- [ ] Lightning Network analysis
- [ ] Mobile app (React Native)

---

## Licença

MIT License — consulta [LICENSE](LICENSE) para detalhes.

---

<p align="center">
  <sub>Built with 🔒 by <a href="https://github.com/MrAiKen007">MrAiKen007</a></sub>
</p>
