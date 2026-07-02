# PowerBuilder → Mermaid

Ferramenta browser-only para analisar arquivos exportados pelo **EditSource** do PowerBuilder 2022 e gerar diagramas de classe no formato **Mermaid**.

Não requer instalação, servidor ou conexão VPN — basta abrir o `index.html` no Chrome.

---

## Como usar

1. Abra `index.html` diretamente no Chrome
2. Arraste os arquivos de source (`.sru`, `.srw`, `.srm`, `.srp`) ou clique na zona para selecioná-los
   - Carregue múltiplos arquivos quando houver herança entre objetos de arquivos diferentes
3. Ajuste as opções conforme necessário
4. Clique em **Analisar e Gerar Diagrama**
5. Use as abas para visualizar o resultado:
   - **Mermaid (.mmd)** — texto do diagrama, com botões Copiar e Baixar
   - **Preview** — diagrama renderizado (requer internet para carregar o Mermaid.js via CDN)
   - **Objetos** — tabela com todos os objetos encontrados e contagens

## Opções do diagrama

| Opção | Padrão | Descrição |
|---|---|---|
| Funções e Subroutines | ✓ | Exibe funções como membros da classe |
| Eventos | ✓ | Exibe eventos como membros da classe |
| Variáveis de instância | — | Exibe variáveis declaradas em `type variables` |
| Controles (containment) | ✓ | Arestas `*--` entre window e seus controles |
| Chamadas cross-objeto | ✓ | Arestas `..>` para chamadas entre objetos |
| Herança de tipos built-in PB | — | Exibe arestas `--|>` para tipos base do PB |

## O que é identificado

O parser trabalha pela **notação padrão do PB**, não por convenções de nomenclatura:

- **Herança** — `global type X from Y`
- **Controles** — `type cb_ok from CommandButton within w_main`
- **Event stubs** — `event ue_custom;` e `event type long ue_retorno(string as_p)`
- **Funções/Subroutines** — `public/protected/private function/subroutine ...`
- **Implementações de evento** — `on objeto.evento` ... `end on`
- **Chamadas cross-objeto** — dotcall (`obj.metodo(`), `TriggerEvent("evento")`, `Call obj::evento`

## Exemplo de saída

```
classDiagram

    class n_cst_base {
        +void of_init()
        ~event~ void ue_inicializado()
    }
    class n_cst_filho {
        +integer of_calcular(decimal ad_valor)
        #string is_nome
        ~event~ void ue_concluido()
    }
    class w_principal {
        +void wf_abrir()
    }

    n_cst_filho --|> n_cst_base : extends
    w_principal ..> n_cst_filho : wf_abrir→of_calcular
```

Cole o texto gerado em [mermaid.live](https://mermaid.live) para visualizar ou exportar como PNG/SVG.

## Arquivos suportados

| Extensão | Tipo |
|---|---|
| `.sru` | User Object |
| `.srw` | Window |
| `.srm` | Menu |
| `.srp` | Pipeline |
| `.srd` | DataWindow (estrutura apenas) |

## Limitações conhecidas

- Chamadas cross-objeto são detectadas por padrão de texto no corpo das funções. Se o objeto-alvo não estiver entre os arquivos carregados, a chamada vai para "não resolvidas" (visível no console do navegador).
- Arquivos maiores que 500 KB exibem um aviso — o processamento pode travar o browser por alguns segundos pois é síncrono.
- O preview do diagrama requer acesso ao CDN `cdn.jsdelivr.net`. O texto `.mmd` funciona sem internet.
