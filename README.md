# Validador de openclaw.json

Aplicação web estática para editar e validar ficheiros `openclaw.json`.

## Página recomendada

Usar a versão IDE:

```text
ide.html
```

A página `index.html` fica como versão simples/legada.

## Funcionalidades da versão IDE

- Editor estilo IDE com Monaco Editor.
- Syntax highlighting JSON.
- Separadores para:
  - `openclaw.json`;
  - `openclaw.schema.json`;
  - `settings-db.json`.
- Upload de `openclaw.json`.
- Upload de `openclaw.schema.json` exportado da instalação.
- Extracção automática de settings a partir do schema carregado.
- Autocomplete com `Ctrl+Space` baseado na DB ou no schema carregado.
- Validação estrutural contra o schema, quando fornecido.
- Avisos de segurança e operação:
  - Gateway exposto na rede;
  - autenticação desligada;
  - canais permissivos;
  - segredos escritos em texto claro;
  - `heartbeat` demasiado frequente;
  - `exec.security=full` com `ask=off`.
- Download do `openclaw.json` editado.
- Download do relatório de análise.

## Fonte canónica dos settings

A documentação pública é útil, mas a fonte canónica para todos os settings aceites pela tua instalação é o schema local:

```bash
openclaw config schema > openclaw.schema.json
```

Ao carregar esse ficheiro em `ide.html`, a aplicação extrai automaticamente os settings disponíveis e usa-os para sugestões e validação.

## Publicação com GitHub Pages

Como a aplicação é estática, pode ser publicada directamente com GitHub Pages.

A versão IDE usa Monaco Editor via CDN:

```text
https://cdn.jsdelivr.net/npm/monaco-editor
```

Se for aberta sem Internet, o editor cai para uma `textarea` simples.

## Estrutura

```text
ide.html
index.html
css/ide.css
js/ide.js
data/settings-db.json
```

## Validação final

Esta aplicação é uma ferramenta auxiliar. Antes de reiniciar o Gateway ou aplicar alterações em produção, confirmar no host real:

```bash
openclaw doctor
openclaw doctor --fix
openclaw security audit --deep
```

## Privacidade

A validação corre localmente no navegador. Os ficheiros não são enviados para servidores, excepto o carregamento do Monaco Editor via CDN quando se usa `ide.html`.
