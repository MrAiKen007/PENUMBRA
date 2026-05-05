# Contributing to PENUMBRA

Obrigado pelo interesse em contribuir! Este guia explica como participar no desenvolvimento.

## Como Contribuir

### Reportar Bugs

1. Verifique se o bug já foi reportado em [Issues](https://github.com/MrAiKen007/PENUMBRA/issues)
2. Se não existir, crie um novo issue com:
   - Título descritivo
   - Passos para reproduzir
   - Comportamento esperado vs. atual
   - Screenshots/GIFs se aplicável
   - Versão do Python e SO

### Sugerir Features

1. Abra um issue com label `enhancement`
2. Descreva o problema que a feature resolve
3. Explique a solução proposta
4. Considere alternativas

### Pull Requests

1. **Fork** o repositório
2. Crie uma **branch** (`git checkout -b feature/nova-feature`)
3. Faça **commits** claros e descritivos
4. **Push** para a branch (`git push origin feature/nova-feature`)
5. Abra um **Pull Request**

#### Padrões de Código

- Python: PEP 8
- TypeScript/TSX: ESLint config do projeto
- Commits em português ou inglês (consistência no PR)

#### Testes

```bash
# Backend
pytest

# Frontend
cd frontend
npm test
```

#### Documentação

- Atualize o README se necessário
- Adicione docstrings para funções novas
- Atualize o GUIDE.md para features visuais

## Estrutura do Projeto

```
PENUMBRA/
├── app/                 # Backend FastAPI
│   ├── api/            # Rotas
│   ├── core/           # Bitcoin RPC
│   ├── db/             # Database models
│   ├── models/         # Pydantic models
│   ├── services/       # Lógica de negócio
│   └── websocket/      # WebSocket handlers
├── frontend/           # React + TypeScript
│   └── src/
│       ├── components/
│       ├── pages/
│       └── store/
└── docs/              # Documentação
```

## Ambiente de Desenvolvimento

### Requisitos

- Python 3.10+
- Node.js 18+
- Bitcoin Core (regtest/signet recomendado)

### Setup

```bash
# Backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (outro terminal)
cd frontend
npm install
npm run dev
```

## Convenções

### Branches

- `main` - Produção estável
- `develop` - Desenvolvimento
- `feature/nome` - Novas features
- `fix/nome` - Correções de bugs

### Commits

Formato: `tipo: descrição`

Tipos:
- `feat:` nova feature
- `fix:` correção de bug
- `docs:` documentação
- `style:` formatação
- `refactor:` refatoração
- `test:` testes

Exemplo: `feat: adicionar análise forense ao graph builder`

## Code Review

Todos os PRs requerem:
1. Review de pelo menos 1 mantenedor
2. CI passando (quando implementado)
3. Sem conflitos com `main`

## Comunidade

- Email: jorgepaim2005@gmail.com

## Perguntas?

Abra um issue com label `question` ou entre em contato.

---

Obrigado por contribuir! 🙏
