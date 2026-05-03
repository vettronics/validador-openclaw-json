# Validador de openclaw.json

Página HTML local para validar ficheiros `openclaw.json`.

## Funcionalidades

- Colar directamente o conteúdo do `openclaw.json`.
- Fazer upload do ficheiro.
- Fazer upload opcional do schema exportado pela instalação local.
- Validar estrutura contra o schema.
- Usar uma base de dados curada de settings frequentes em `data/settings-db.json`.
- Carregar uma base de dados própria de settings em JSON.
- Detectar avisos frequentes de segurança e configuração:
  - Gateway exposto fora de `localhost`;
  - autenticação desligada;
  - canais sem `allowlist` evidente;
  - segredos escritos directamente no ficheiro;
  - `heartbeat` demasiado frequente;
  - execução elevada sem `allowFrom`;
  - chaves suspeitas ou possíveis erros tipográficos.

## Limitação importante

A base de dados incluída **não substitui** o schema da instalação local.

A fonte canónica para todos os settings aceites pela tua versão continua a ser:

```bash
openclaw config schema > openclaw.schema.json
```

A DB incluída em `data/settings-db.json` serve para:

- documentar settings frequentes;
- aplicar recomendações de segurança e operação;
- permitir evolução incremental por versão;
- permitir presets como `common-2026.4.x`.

## Uso recomendado

Exportar o schema da versão instalada:

```bash
openclaw config schema > openclaw.schema.json
```

Abrir `index.html` no browser e carregar:

1. `openclaw.json`;
2. opcionalmente, `openclaw.schema.json`;
3. escolher o preset da base de dados;
4. clicar em **Analisar**.

## Publicação com GitHub Pages

Como a página é estática, pode ser publicada directamente com GitHub Pages.

Depois de activar Pages no repositório, a página consegue carregar automaticamente:

```text
data/settings-db.json
```

Se for aberta directamente como ficheiro local (`file://`), alguns browsers podem bloquear esse carregamento por `fetch`. Nesse caso, a página usa a DB embutida ou permite fazer upload manual do `settings-db.json`.

## Estrutura da base de dados

Exemplo simplificado:

```json
{
  "presets": {
    "common-2026.4.x": {
      "label": "OpenClaw 2026.4.x — settings frequentes",
      "settings": [
        {
          "path": "gateway.bind",
          "type": "string",
          "category": "gateway",
          "description": "Endereço de escuta do Gateway.",
          "recommended": "127.0.0.1 quando não existe reverse proxy seguro."
        }
      ]
    }
  }
}
```

## Validação final

Esta página é uma ferramenta auxiliar. Antes de reiniciar o Gateway ou aplicar alterações em produção, confirmar no host real:

```bash
openclaw doctor
openclaw doctor --fix
openclaw security audit --deep
```

## Privacidade

A validação corre localmente no navegador. Os ficheiros não são enviados para servidores.
