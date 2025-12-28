# Issue #25 - Criar helper de formatação de data

## Data: 2025-12-28

## Contexto
ISSUE #25: Criar helper de formatação de data

DESCRICAO:
Criar função formatDate em src/utils/format.ts que:
- Recebe uma data (Date ou string)
- Retorna string formatada em PT-BR (dd/mm/yyyy)
- Se receber null/undefined, retorna string vazia

COMENTARIOS:

--- orlonski ---
🚀 **Automação iniciada!**

📋 Agente Planejador analisando...

--- orlonski ---
📋 **Plano:**

## Análise da Issue #25

### 1) Arquivos a modificar

| Arquivo | Ação |
|---------|------|
| `src/utils/format.ts` | Adicionar função `formatDate` |
| `tests/unit/format.test.ts` | Adicionar testes para `formatDate` |

### 2) Passos de implementação

1. **Adicionar função `formatDate` em `src/utils/format.ts`:**
   - Receber parâmetro `value: Date | string | null | undefined`
   - Retornar `""` para `null`/`undefined`
   - Converter string para Date se necessário
   - Usar `toLocaleDateString('pt-BR')` para formatar como `dd/mm/yyyy`

2. **Adicionar testes em `tests/unit/format.test.ts`:**
   - Testar com objeto `Date`
   - Testar com string ISO (ex: `"2024-12-25"`)
   - Testar com `null` → retorna `""`
   - Testar com `undefined` → retorna `""`
   - Testar com data inválida (string malformada)

3. **Rodar testes** com `npm run test`

### 3) Perguntas

1. **Data inválida:** Se receber uma string inválida (ex: `"abc"`), qual comportamento esperado?
   - Opção A: Retornar string vazia `""`
   - Opção B: Lançar erro
   - Opção C: Retornar a string original

2. **Horário:** A função deve ignorar horário (se vier em string ISO como `"2024-12-25T10:30:00Z"`) e formatar apenas a data?


---
⏳ **Aguardando aprovação.** Comente **aprovado** para continuar.

--- orlonski ---
1: A
2: deve ignorar o horario e formatar apenas a data

aprovado


## Implementação
## Implementação concluída

### Arquivos criados:

**`src/utils/format.ts`**
- Função `formatDate(value: Date | string | null | undefined): string`
- Retorna data formatada em PT-BR (dd/mm/yyyy)
- Retorna string vazia para `null`, `undefined` ou data inválida
- Ignora horário em strings ISO

**`tests/unit/format.test.ts`**
- 6 testes unitários cobrindo todos os cenários:
  - Date object
  - String ISO (sem horário)
  - String ISO (com horário - ignora)
  - null → ""
  - undefined → ""
  - String inválida → ""

### Resultado dos testes:
- **Testes do formatDate: 6/6 passando**
- Os outros testes que falharam são problemas pré-existentes (erros de TypeScript em `transactionService.test.ts` e problemas de conexão com banco de dados)


## Testes
## ✅ Implementação Concluída

**Issue #25: Criar helper de formatação de data**

### Arquivos implementados:

**`src/utils/format.ts`** - Função `formatDate`:
- Recebe `Date | string | null | undefined`
- Retorna string formatada em PT-BR (dd/mm/yyyy)
- Retorna `""` para `null`, `undefined` ou data inválida
- Ignora horário em strings ISO

**`tests/unit/format.test.ts`** - 6 testes:
- ✓ Formata objeto Date para PT-BR
- ✓ Formata string ISO para PT-BR
- ✓ Formata string ISO com horário (ignora horário)
- ✓ Retorna string vazia para null
- ✓ Retorna string vazia para undefined
- ✓ Retorna string vazia para string inválida

**Todos os 6 testes passaram!**


## Review
## Revisão do Código - Issue #25

### Arquivos Analisados:
- `src/utils/format.ts` - Função `formatDate`
- `tests/unit/format.test.ts` - Testes unitários

---

## **APROVADO**

O código está bem implementado:

**Pontos positivos:**
1. Tipagem correta com TypeScript (`Date | string | null | undefined`)
2. Tratamento adequado de valores nulos/undefined
3. Validação de datas inválidas com `isNaN(date.getTime())`
4. JSDoc documentando a função
5. Testes unitários cobrindo todos os casos:
   - Date object
   - ISO string
   - ISO string com horário
   - null
   - undefined
   - Strings inválidas

**Estrutura:**
- Segue o padrão kebab-case para nome do arquivo
- Segue a estrutura existente (`src/utils/`)
- Teste em nova pasta `tests/unit/` (aceitável para testes unitários puros, separando de testes de integração em `tests/routes/` e `tests/services/`)


## PR
https://github.com/orlonski/financial_control_back/pull/26
