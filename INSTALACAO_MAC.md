# Terminal One — instalação no Mac

Este pacote já contém o projeto completo. Não copie arquivos isolados.

## Antes de começar

Faça uma cópia da sua pasta atual:

```bash
cp -R ~/terminal-one ~/Desktop/terminal-one-backup
```

## Terminal 1 — instalar e iniciar

1. Descompacte `TerminalOne-complete-upgrade.zip` em Downloads.
2. No Terminal, execute cada linha separadamente:

```bash
cd ~/Downloads/terminal-one
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

3. Se você já possui o banco `terminal_one`, aplique a atualização:

```bash
alembic upgrade head
```

4. Inicie o site:

```bash
uvicorn app.main:app --reload
```

Deixe este terminal aberto enquanto usa o site.

## Navegador

Abra:

```text
http://127.0.0.1:8000
```

Use `Command + Shift + R` para recarregar sem cache.

## Terminal 2 — testes

Abra uma segunda janela do Terminal e execute:

```bash
cd ~/Downloads/terminal-one
source venv/bin/activate
pytest -q
```

O resultado esperado é `3 passed`.

## Colocar no lugar da versão antiga

Somente depois de testar a versão em Downloads:

```bash
mv ~/terminal-one ~/Desktop/terminal-one-versao-anterior
cp -R ~/Downloads/terminal-one ~/terminal-one
cd ~/terminal-one
source venv/bin/activate
uvicorn app.main:app --reload
```

## Observações

- Os pagamentos são simulados; nenhum dado real de cartão é armazenado.
- Sem configuração SMTP, os e-mails preparados ficam em `app/static/outbox`.
- A documentação da API fica em `http://127.0.0.1:8000/docs`.
- Para interromper o servidor, pressione `Control + C` no Terminal 1.
