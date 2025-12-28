# Financial Control Backend

## Stack
- Runtime: Node.js
- Linguagem: TypeScript
- ORM: Prisma
- Testes: Jest

## Estrutura
```
src/           → Código fonte
prisma/        → Schema e migrations
tests/         → Testes
```

## Comandos
```bash
npm install       # Instalar deps
npm run dev       # Rodar dev
npm run test      # Testes
npm run build     # Build
```

## Padrões
- Arquivos: kebab-case (user-service.ts)
- Classes: PascalCase (UserService)
- Funções: camelCase (getUser)
- Sempre usar TypeScript tipado
- Criar testes para novas features
- Seguir estrutura existente
