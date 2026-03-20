# Financial Control Backend

API REST completa para gerenciamento de finanças pessoais.

## Stack

| Componente | Tecnologia |
|------------|------------|
| Runtime | Node.js |
| Linguagem | TypeScript |
| Framework | Express.js |
| ORM | Prisma |
| Banco de Dados | PostgreSQL |
| Testes | Jest + Supertest |
| Autenticação | JWT + bcrypt |
| Email | Nodemailer |
| Validação | Zod |

## Estrutura do Projeto

```
src/
├── server.ts              # Ponto de entrada
├── errors/                # Classes de erro customizadas
├── middleware/            # Middleware Express (auth JWT)
├── routes/                # Rotas da API
│   ├── auth.ts           # Autenticação
│   ├── accounts.ts        # Contas bancárias
│   ├── categories.ts      # Categorias
│   ├── creditCards.ts     # Cartões de crédito
│   ├── transactions.ts    # Transações
│   ├── transfers.ts       # Transferências
│   ├── recurring.ts       # Transações recorrentes
│   ├── budgets.ts         # Orçamentos mensais
│   ├── goals.ts           # Metas financeiras
│   ├── reminders.ts       # Lembretes de pagamento
│   ├── reports.ts         # Relatórios
│   ├── summary.ts         # Resumo financeiro
│   └── stats.ts           # Estatísticas
├── services/              # Lógica de negócio
└── utils/                # Funções auxiliares
prisma/
├── schema.prisma         # Schema do banco
└── migrations/           # Migrações
tests/                    # Testes
```

## Modelos de Dados

### User
- id, email, password, name
- Relacionamentos: Accounts, Categories, CreditCards, Transactions, Budgets, Goals, Reminders

### Account
- id, name, type (CHECKING|SAVINGS|CASH|INVESTMENT), initialBalance, color

### Category
- id, name, type (INCOME|EXPENSE), color, icon

### CreditCard
- id, name, closingDay, dueDay, limit
- Vinculado a uma conta para pagamento da fatura

### Transaction
- id, type, amount, date, description, paid
- Suporte a parcelamentos e recorrências
- Vinculado a conta, categoria e/ou cartão de crédito

### Transfer
- Transferências entre contas

### Recurrence
- Transações recorrentes (diário, semanal, mensal, anual)
- Parcelamentos

### Budget
- Orçamentos mensais por categoria

### Goal
- Metas financeiras com targetAmount e currentAmount
- Contributions para rastrear depósitos

### Reminder
- Lembretes de pagamento com data de vencimento
- Suporte a recorrência

## Funcionalidades

### 1. Autenticação
- Registro e login com JWT
- Recuperação de senha via email
- Middleware de autenticação

### 2. Gestão de Contas
- CRUD completo de contas bancárias
- Tipos: Corrente, Poupança, Dinheiro, Investimento
- Cálculo de saldo por conta

### 3. Cartões de Crédito
- Cadastro de cartões com dia de fechamento e vencimento
- Cálculo de uso do limite
- Rastreamento de faturas

### 4. Transações
- Transações simples de entrada/saída
- Parcelamentos (Número fixo de parcelas)
- Transações recorrentes (diário, semanal, mensal, anual)
- Purchases no cartão com data de vencimento da fatura

### 5. Transferências
- Transferências entre contas
- Atualização automática de saldos

### 6. Orçamentos
- Limite mensal por categoria
- Cálculo de gasto vs orçamento
- Cópia de orçamentos do mês anterior

### 7. Metas Financeiras
- Criação de metas com valor alvo e prazo
- Acompanhamento de progresso
- Contribuições para a meta
- Status: Ativa, Completa, Cancelada

### 8. Lembretes
- Avisos de pagamento com dias de antecedência
- Lembretes de fatura do cartão
- Status: Pendente, Pago, Dispensado, Atrasado

### 9. Relatórios
- Extrato mensal com saldo diário
- Despesas por categoria
- Fluxo de caixa (entradas vs saídas)

### 10. Resumo Financeiro
- Total de receitas, despesas e saldo
- Breakdown por período

### 11. Estatísticas
- Métricas gerais do sistema

## Endpoints Principais

### Autenticação
- `POST /api/auth/register` - Registro
- `POST /api/auth/login` - Login
- `POST /api/auth/forgot-password` - Recuperação de senha
- `POST /api/auth/reset-password` - Redefinir senha

### Contas
- `GET /api/accounts` - Listar contas
- `POST /api/accounts` - Criar conta
- `GET /api/accounts/:id/balance` - Saldo da conta

### Cartões de Crédito
- `GET /api/credit-cards` - Listar cartões
- `POST /api/credit-cards` - Criar cartão

### Transações
- `GET /api/transactions` - Listar transações
- `POST /api/transactions` - Criar transação
- `POST /api/transactions/installments` - Criar parcelamento
- `POST /api/transactions/recurring` - Criar recorrente
- `PATCH /api/transactions/:id/paid` - Marcar como pago

### Transferências
- `POST /api/transfers` - Transferir entre contas

### Recorrências
- `GET /api/recurring` - Listar recorrências
- `POST /api/recurring` - Criar recorrência
- `PATCH /api/recurring/:id/pause` - Pausar

### Orçamentos
- `GET /api/budgets` - Listar orçamentos
- `POST /api/budgets` - Criar orçamento

### Metas
- `GET /api/goals` - Listar metas
- `POST /api/goals` - Criar meta
- `POST /api/goals/:id/contributions` - Adicionar contribuição

### Lembretes
- `GET /api/reminders` - Listar lembretes
- `GET /api/reminders/pending` - Pendentes
- `PATCH /api/reminders/:id/paid` - Marcar como pago

### Relatórios
- `GET /api/reports/monthly-statement` - Extrato mensal
- `GET /api/reports/by-category` - Por categoria
- `GET /api/reports/cashflow` - Fluxo de caixa

## Comandos

```bash
npm install       # Instalar dependências
npm run dev       # Rodar em desenvolvimento
npm run build     # Build de produção
npm start         # Iniciar produção
npm run test      # Rodar testes
npm run lint      # Verificar código
npm run typecheck # Verificar tipos
```

## Variáveis de Ambiente

```env
DATABASE_URL="postgresql://..."
PORT=3000
JWT_SECRET="secret"
JWT_EXPIRES_IN="7d"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="email@gmail.com"
SMTP_PASS="app-password"
FRONTEND_URL="http://localhost:5173"
```

## Recursos Brasil
- Formato de moeda: R$ 1.234,56
- Formato de data: dd/mm/yyyy
- Timezone: America/Sao_Paulo (UTC-3)
