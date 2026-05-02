# PENUMBRA

Wallet Bitcoin com foco em privacidade, análise de rastreabilidade, Coin Control e alertas inteligentes.

A Penumbra é uma carteira Bitcoin que não assume que privacidade é automática.

## Funcionalidades

### Privacy Engine
Scoring de privacidade 0-100 para cada UTXO:
- CIOH: -25 pts (múltiplos inputs)
- Address Reuse: -30 pts
- KYC Contamination: -20 pts
- Change Exposure: -15 pts
- Round Amounts: -10 pts

### Coin Control
Seleção manual de UTXOs com:
- Estimativa de fees em tempo real
- Cálculo de impacto de privacidade
- Construção de PSBTs para hardware wallets
- Sugestão automática de UTXOs óptimos

### Graph Builder
Visualização de rastreabilidade com:
- Endereços e transacções como nós
- Clusters CIOH
- Entidades conhecidas (exchanges, mixers)
- Peeling chains

### Alert Engine
Alertas em tempo real via WebSocket:
- Novas transações nos teus endereços
- Dust attacks
- KYC contamination
- Fees anormalmente altas

## Instalação

`ash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
`

Configure .env:
`
BITCOIN_RPC_USER=user
BITCOIN_RPC_PASSWORD=pass
BITCOIN_RPC_PORT=8332
`

## Execução

`ash
uvicorn app.main:app --reload
`

## API Endpoints

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| /api/utxos | GET | Lista UTXOs |
| /api/privacy/score | POST | Calcula privacy score |
| /api/psbt/build | POST | Constrói PSBT |
| /api/psbt/suggest | GET | Sugere UTXOs |
| /api/graph/{addr} | GET | Grafo de rastreio |
| /api/alerts | GET | Lista alertas |
| /api/alerts/summary | GET | Resumo de alertas |
| /ws/alerts | WS | WebSocket alertas |

## Heurísticas de Privacidade

**CIOH (Common Input Ownership)**: Múltiplos inputs na mesma transação provavelmente pertencem à mesma carteira.

**Address Reuse**: Usar o mesmo endereço múltiplas vezes liga todas as transações.

**Peeling Chain**: Padrão onde o troco é sempre o maior output, criando cadeia rastreável.

**Dust Attack**: Envio de pequenas quantidades para forçar junção com outros UTXOs.

## Roadmap

- [x] Privacy Engine
- [x] Coin Control
- [x] Graph Builder
- [x] Alert Engine
- [ ] CoinJoin integration
- [ ] PayJoin support
- [ ] Frontend web
- [ ] Hardware wallet support
