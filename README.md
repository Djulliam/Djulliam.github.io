# Controle de Estoque Web

Versao web estatica do controle de estoque. Ela funciona no GitHub Pages e usa Supabase para banco de dados, login e autorizacao. Nao ha servidor Python em producao.

## O que esta incluido

- Login com e-mail e senha.
- Perfis `administrador`, `operador`, `visualizador` e `aguardando liberacao`.
- Produtos, entradas, saidas, condimentos, contagens e resumo mensal.
- Politicas RLS no banco: esconder um botao nao e a camada de seguranca; o Supabase tambem bloqueia a operacao sem permissao.
- Exportador CSV para trazer a base `estoque.db` do aplicativo desktop.

## Configuracao do Supabase

1. Crie um projeto em [Supabase](https://supabase.com/dashboard). Para esta aplicacao pequena, o plano Free e suficiente. Escolha a regiao mais proxima dos usuarios.
2. Abra **SQL Editor** > **New query**, cole todo o conteudo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Em **Authentication** > **URL Configuration**, preencha:
   - **Site URL**: `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`
   - **Redirect URLs**: o mesmo endereco e, para testes, `http://localhost:5500/`.
4. Em **Authentication** > **Providers** > **Email**, mantenha a confirmacao de e-mail ativada. Os usuarios podem criar a conta, mas ficam no perfil `Aguardando liberacao` e nao recebem acesso aos dados.
5. Crie a primeira conta na tela do sistema (ou em **Authentication** > **Users**) e confirme o e-mail. Depois, no SQL Editor, execute, substituindo pelo e-mail usado:

   ```sql
   update public.profiles
   set role = 'admin'
   where email = 'seu-email@exemplo.com';
   ```

   A partir desse ponto, esse administrador pode promover contas pendentes pela tela **Usuarios**.
6. Em **Project Settings** > **API**, copie a **Project URL** e a chave **Publishable** (ou `anon` nos projetos antigos) para [`config.js`](config.js).

   A chave publishable e feita para aparecer no navegador. Nunca use uma chave `sb_secret_`, `service_role` ou qualquer chave secreta no GitHub Pages.

## Migrar os dados do aplicativo atual

Com Python instalado, dentro da pasta `estoque-web`, execute:

```powershell
python supabase/export_sqlite.py --db ..\estoque.db --output supabase\export
```

No Supabase, abra **Table Editor** e importe os CSVs nesta ordem:

1. `products.csv`
2. `condiments.csv`
3. `movements.csv`
4. `condiment_counts.csv`
5. `monthly_reports.csv`

O script converte os tipos legados `entrada`/`saida` para `entry`/`exit`. Os arquivos exportados estao ignorados pelo Git para evitar publicar dados internos.

> Antes da importacao definitiva, faca uma copia do arquivo `estoque.db`. A migracao apenas le esse arquivo; ela nao altera o programa desktop.

## Testar localmente

Edite `config.js`, depois abra esta pasta com uma extensao de servidor local (por exemplo, **Live Server** do VS Code) ou use:

```powershell
python -m http.server 5500
```

Abra `http://localhost:5500`. Abrir o `index.html` diretamente no navegador nao e recomendado, pois o fluxo de autenticacao usa URLs HTTP.

## Publicar no GitHub Pages

Crie um novo repositorio vazio no GitHub e envie **o conteudo desta pasta `estoque-web`** para ele. Em seguida:

1. No repositorio, abra **Settings** > **Pages**.
2. Em **Build and deployment**, escolha **GitHub Actions**.
3. Confirme que `config.js` possui a URL e a chave publishable corretas, faca `git add`, `commit` e `push` na branch `main`.
4. O workflow em `.github/workflows/deploy-pages.yml` publica o site automaticamente. Ao terminar, o GitHub mostra a URL em **Settings** > **Pages**.
5. Volte ao Supabase e confirme que essa URL esta em **Site URL** e em **Redirect URLs**.

## Perfis de acesso

| Perfil | Permissoes |
| --- | --- |
| Administrador | Administra usuarios e todos os dados. |
| Operador | Cria, altera e exclui dados de estoque; nao administra usuarios. |
| Visualizador | Consulta os dados sem altera-los. |
| Aguardando liberacao | Nao ve dados ate ser promovido por um administrador. |

As regras estao em `supabase/schema.sql`. Nao desative RLS nas tabelas: ela e a protecao que impede chamadas diretas a API de ultrapassarem as permissoes da tela.
