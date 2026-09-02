# Terminal One — atualização completa no Mac

Esta versão preserva o banco PostgreSQL existente e inclui todas as imagens do catálogo. O arquivo `.env` não vai dentro do ZIP por segurança.

## Antes de instalar

Confirme que estes dois backups continuam no Desktop:

- `TerminalOne-atual-com-imagens.zip`
- `TerminalOne-banco-atual.sql`

## Terminal 1 — instalar e iniciar o site

Feche o servidor antigo. Abra uma janela nova do Terminal e execute uma linha por vez:

```bash
cp ~/Downloads/terminal-one/.env ~/Desktop/TerminalOne-env-backup
mv ~/Downloads/terminal-one ~/Downloads/terminal-one-antes-final
cd ~/Downloads
unzip TerminalOne-FINAL-completo.zip
cp ~/Desktop/TerminalOne-env-backup ~/Downloads/terminal-one/.env
cd ~/Downloads/terminal-one
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Quando aparecer `Uvicorn running on http://127.0.0.1:8000`, deixe esse Terminal aberto.

## Navegador

Abra:

```text
http://127.0.0.1:8000
```

Faça uma atualização completa com `Command + Shift + R`.

## Terminal 2 — somente para verificações

Abra outra janela do Terminal e execute:

```bash
cd ~/Downloads/terminal-one
source venv/bin/activate
alembic current
python -m pytest -q
```

O resultado esperado dos testes é `5 passed`.

## Se precisar voltar à versão anterior

Pare o servidor com `Control + C`. Depois execute:

```bash
mv ~/Downloads/terminal-one ~/Downloads/terminal-one-final-com-problema
mv ~/Downloads/terminal-one-antes-final ~/Downloads/terminal-one
cd ~/Downloads/terminal-one
source venv/bin/activate
uvicorn app.main:app --reload
```

Esse retorno troca apenas os arquivos. O backup SQL do Desktop continua sendo a cópia de segurança do banco.
