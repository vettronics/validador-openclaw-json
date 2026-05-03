# Validador de openclaw.json

Página HTML local para validar ficheiros `openclaw.json`.

## Funcionalidades

- Colar directamente o conteúdo do `openclaw.json`.
- Fazer upload do ficheiro.
- Fazer upload opcional do schema exportado pela instalação local.
- Validar estrutura contra o schema.
- Detectar avisos frequentes de segurança e configuração:
  - Gateway exposto fora de `localhost`;
  - autenticação desligada;
  - canais sem `allowlist` evidente;
  - segredos escritos directamente no ficheiro;
  - `heartbeat` demasiado frequente;
  - execução elevada sem `allowFrom`;
  - chaves suspeitas ou possíveis erros tipográficos.

## Uso recomendado

Exportar o schema da versão instalada:

```bash
openclaw config schema > openclaw.schema.json
```

Abrir `index.html` no browser e carregar:

1. `openclaw.json`;
2. opcionalmente, `openclaw.schema.json`;
3. clicar em **Analisar**.

## Validação final

Esta página é uma ferramenta auxiliar. Antes de reiniciar o Gateway ou aplicar alterações em produção, confirmar no host real:

```bash
openclaw doctor
openclaw doctor --fix
openclaw security audit --deep
```

## Privacidade

A validação corre localmente no navegador. Os ficheiros não são enviados para servidores.
