# Publicação Online (Render + PostgreSQL Gratuito)

O projeto já está configurado com `render.yaml`, `package.json` na raiz e adaptador de banco em `backend/db.js` compatível com **SQLite local** (`klara_ecossistema.db`) e **PostgreSQL** (`DATABASE_URL`).

## Passos para publicar no Render

1. Envie esta pasta para um repositório Git (GitHub / GitLab).
2. Acesse [https://dashboard.render.com](https://dashboard.render.com) e faça login.
3. Clique em **New +** → **Blueprint** (ou **Web Service** + **PostgreSQL**).
4. Conecte seu repositório: o Render detectará automaticamente o arquivo `render.yaml`, criará o serviço Node.js gratuito e o banco PostgreSQL gratuito (`DATABASE_URL`).
5. Após o deploy concluir, acesse os três módulos pela URL pública gerada pelo Render:
   - `https://<seu-app>.onrender.com/rh`
   - `https://<seu-app>.onrender.com/apontamento`
   - `https://<seu-app>.onrender.com/colaborador`

## Credenciais iniciais (Seed automático)

- **Super Admins:**
  - `dandarafalcao773@gmail.com` / `AdminAdmin`
  - `sacalao660@gmail.com` / `AdminAdmin`
- **Colaboradores:** login e senha inicial iguais ao CPF (apenas números).
