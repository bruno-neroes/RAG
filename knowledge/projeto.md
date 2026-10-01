# AI First-Responder — base de conhecimento do assistente

## Sobre este assistente
- O que é: um assistente de perguntas e respostas sobre o projeto "AI First-Responder" (um agente de voz para cabinas públicas de desfibrilhadores) e sobre a candidatura de Bruno Sousa ao papel de Generative AI Product Engineer na Medicare.
- Quem o fez: foi construído por Bruno Sousa, com a ajuda do Claude (Anthropic), como demonstração de um sistema RAG com guardrails. O material da apresentação foi também preparado pelo Bruno com ajuda do Claude; o projeto AI First-Responder em si foi feito por uma equipa humana na MAKEIT, liderada tecnicamente pelo Bruno.
- O que não é: não é um serviço da Medicare e não tem qualquer ligação oficial à Medicare. Não dá conselhos médicos. Não tem acesso a dados pessoais nem a sistemas externos.
- Transparência: é um assistente de IA e diz-o sempre que lhe perguntam. Quando uma informação não está documentada, diz que não sabe.
- Limites: alguns dados do projeto estão sob acordo de confidencialidade (NDA): os números de produção (chamadas, cabinas, percentagens) e o fornecedor do modelo "frontier" usado na escalada. O assistente não os revela porque não os tem.

## O projeto em 30 segundos
Um agente de voz multilingue que substitui a captura humana de dados nas cabinas públicas de DAE (desfibrilhador automático externo). Quando alguém carrega no botão da cabina, abre-se uma chamada atendida por um agente de IA que recolhe quatro dados — nome e telefone de quem liga, localização da vítima e se é mesmo uma emergência — e dispara, depois de verificação, um SMS para socorristas formados num raio de dois quilómetros e um relatório para o cliente e para a equipa. Funciona em português, inglês e francês. Foi desenvolvido na MAKEIT entre 2025 e 2026, passou por dois pilotos aceites pelo cliente e está em produção.

## O problema de negócio
- Antes: um bombeiro no back-office atendia todas as chamadas das cabinas e recolhia os dados à mão.
- Custos e riscos: custo por chamada, possibilidade de a chamada ficar por atender, dados incompletos ou errados porque quem liga está em pânico, erro humano, e o tempo de um profissional qualificado preso ao telefone.
- Porque é que os segundos contam: segundo a American Heart Association, por cada minuto sem desfibrilhação a probabilidade de sobrevivência cai 7 a 10%; com reanimação feita por quem está ao lado, a queda é de 3 a 4% por minuto.
- Requisitos desde o piloto: três línguas (PT, EN, FR), nenhuma versão em produção sem passar a suite de testes completa, e um humano sempre a um passo — porque é um contexto de vida ou morte, o sistema não é totalmente autónomo.
- Porquê IA generativa: quem liga fala livremente, em pânico, em três línguas; um menu telefónico ou um formulário não serve. Um LLM com âmbito estreito faz a diferença.

## Arquitetura: durante a chamada (tempo real)
1. Cabina de DAE: o botão liberta o DAE e abre a chamada.
2. Camada de voz (Vapi): o Deepgram (modelo Nova-3) transcreve a fala, um LLM decide o que dizer e a síntese de voz responde.
3. Router de língua (Vapi Squad): um primeiro agente deteta a língua e passa a chamada ao agente de português, inglês ou francês. Se não reconhece a língua, passa a um humano.
4. Agente de extração: um modelo pequeno da OpenAI, com temperatura perto de zero, com um único objetivo — os quatro dados.
5. Escalada e humano: se o agente falha, escala para um modelo "frontier" mais forte (fornecedor confidencial); se mesmo assim falha, o bombeiro entra na chamada por WebRTC ("emergency join"). O agente não desliga: fica a ouvir e regista o caso.

## Arquitetura: depois da chamada (segundos)
6. Fim de chamada: uma função entrega os quatro dados em formato estruturado (schema) e envia um webhook para o n8n.
7. Verificador: no n8n, um agente Claude (Anthropic) compara o transcript com os dados extraídos, confirma ou corrige, e gera o relatório e o texto do SMS.
8. SMS aos socorristas: só sai se a verificação bater certo; vai para socorristas formados num raio de cerca de dois quilómetros, com o contacto de quem ligou e a localização.
9. Relatório: enviado ao cliente e à equipa de desenvolvimento em cada chamada. Se a verificação falha, a chamada é sinalizada para um humano.
- Base de dados no Azure: guarda os casos de exceção — as chamadas em que o humano entrou — que alimentam a knowledge base do agente no Vapi. Não há fine-tuning: o agente consulta esses casos por retrieval.

## Decisões de desenho e porquês
- Vapi como camada de voz: teve melhores métricas de extração dos dados do que o Retell AI e o ElevenLabs; junta transcrição, LLM e síntese com baixa latência; Squads, funções e webhooks já prontos.
- Cascata transcrição → LLM → síntese (em vez de speech-to-speech): há texto em cada passo, o que torna o sistema auditável, verificável e avaliável, e permite trocar cada peça sem mexer nas outras. O preço é latência.
- Um agente por língua (Squad): prompts curtos e específicos são mais previsíveis; routing explícito; língua desconhecida vai para humano.
- Modelo pequeno com temperatura perto de zero: a tarefa é estreita (quatro dados), por isso rápido, barato e previsível.
- Escalar só quando falha: o modelo forte custa mais e é mais lento; só se paga essa robustez quando é preciso.
- Verificar fora da chamada: não acrescenta latência a quem liga, e um modelo diferente não partilha os mesmos pontos cegos.
- O humano entra e o agente fica: sem transferência fria; o caso fica registado e vira aprendizagem.
- Knowledge base em vez de fine-tuning: atualiza-se sem re-treinar, é auditável e reversível; para exceções pontuais, fine-tuning seria caro, lento e opaco.
- Determinístico primeiro, juiz LLM só onde é preciso: regras são baratas, reprodutíveis e explicáveis; o juiz custa e tem vieses.
- Gate binário 500 em 500: num contexto de vida ou morte, rigor total. Zero falhas em 500 testes dá, com 95% de confiança, uma taxa real de falha abaixo de 0,6% (regra dos três).
- Latência: entre duas pessoas, a pausa entre turnos de conversa anda pelos 200 milissegundos; um agente que demora mais de um segundo já soa estranho. A latência condiciona quase todas as decisões de arquitetura num agente de voz.

## Experimentação: cenários e harness de stress
- Cerca de cinco meses de trabalho em prompts; depois, uma forma sistemática de medir.
- Matriz de cobertura: três línguas × seis condições (chamada limpa, sotaque, ruído, pânico, silêncio, quem sai do guião), com personas e uma base de áudios para simular cada situação.
- 500 cenários, cada um com a resposta certa conhecida: os quatro dados, a decisão de emergência e o routing esperados.
- Harness de stress: um programa escrito pelo Bruno que fazia chamadas automáticas ao agente, em loop, com as personas — cerca de 50 chamadas por minuto, a cerca de 0,17 € por chamada.

## Avaliação: as Watchtowers, o gate e o benchmark
- Watchtowers: cada chamada de teste seguia por webhook para um grafo em LangGraph. Três "torres" são determinísticas — campos e formato, routing e decisão, latência e custo — e a quarta é um juiz LLM, usado só para o que não se verifica com uma regra exata, comparando com a resposta certa do cenário. Cada execução fica registada como trace no LangSmith.
- Afinação guiada pelas métricas: velocidade de fala, confiança e temperatura do agente.
- Gate de release: 500 em 500 cenários a passar, mais a aceitação do cliente. Uma única falha bloqueia a release, e essa falha passa a ser um cenário novo na suite.
- Benchmark de modelos: saía um modelo novo praticamente todas as semanas. Um agente de benchmark corre o modelo novo na mesma suite de 500 e só o integra se ganhar ao modelo em uso.
- Regra: determinístico primeiro, juiz LLM só onde é mesmo preciso.

## Falhas encontradas e correções
1. Guardrails contornados: quem saía do guião conseguia levar o agente para fora do âmbito, nos testes e também em produção. Causa: as regras só viviam no prompt. Correção: sinais de escalada explícitos e verificação fora da chamada — nenhum alerta sai sem o verificador confirmar. Lição: num sistema com LLMs, regras que só vivem no prompt são sugestões, não garantias; as garantias vêm de camadas fora do modelo.
2. Chamador mudo, em silêncio ou incoerente (por pânico, por exemplo): não há sinal para extrair. Correção: timeout, o humano entra, o agente fica a ouvir e o caso passa a cenário de teste.
3. Latência e o agente a falar por cima da pessoa: numa cascata de transcrição, LLM e síntese cada passo soma. Correção: afinação da velocidade, da confiança e da temperatura com as métricas das Watchtowers; modelo frontier só na escalada.
4. Consentimento e gravação: num botão de emergência não há momento para pedir consentimento. Correção: base legal de interesse vital (RGPD, art. 6(1)(d) e 9(2)(c)) e minimização da recolha a quatro dados.
- Método: encontrar a falha (nas torres ou nos relatórios de cada chamada) → perceber a causa raiz → corrigir → transformar o caso num cenário novo → só fazer release com 500 em 500.

## Iterações: pilotos e produção
- Piloto 1: o prompt, as Watchtowers, o verificador no n8n e a validação pelo cliente.
- Piloto 2: o agente de benchmark de modelos, a afinação de hiperparâmetros, a knowledge base de exceções e a revisão antes de qualquer output sair.
- Produção: gate 500 em 500 mais aceitação do cliente; sistema em produção em três línguas.

## Impacto
- Em produção em três línguas (português, inglês, francês).
- Custo medido em testes de carga: cerca de 0,17 € por chamada do agente.
- Nenhuma release saiu sem 500 em 500 cenários a passar.
- O cliente aceitou os dois pilotos e passou a produção.
- Antes, um bombeiro atendia todas as chamadas; agora, o agente faz a captura e o humano fica para as exceções — sempre a um passo.
- Os números de produção (chamadas, cabinas, percentagem resolvida sem humano) estão sob NDA e não são divulgados.

## O papel do Bruno
Bruno Sousa desenhou a arquitetura e o sistema de avaliação (as Watchtowers), escreveu o harness de stress e coordenou uma equipa de quatro engenheiros na MAKEIT, onde foi Senior AI-Health Developer entre agosto de 2025 e junho de 2026.

## O que o Bruno faria diferente hoje
1. Evals antes dos prompts: um golden set desde o primeiro dia.
2. Gate ponderado por severidade, com intervalos de confiança, em vez de um gate binário.
3. Shadow mode e canary antes de trocar de fornecedor de modelo.
4. Capturar menos e inferir mais: a localização da cabina já é conhecida.
5. SLOs de latência por componente, medidos em P95 por turno.
6. Um corpus de chamadas reais anonimizadas, com transcrição alojada na União Europeia.

## Ferramentas: voz e orquestração
- Vapi: plataforma para construir agentes de voz; junta transcrição, LLM e síntese em tempo real, por telefone ou web. Configura-se um assistente (prompt, modelo, voz, transcritor), declaram-se funções e um URL de servidor que recebe eventos por webhook. No projeto: a camada de voz de todas as chamadas.
- Vapi Squads: vários assistentes numa só chamada, que passam a conversa uns aos outros (handoff) sem perder o contexto. No projeto: router de língua → agente PT, EN ou FR.
- Deepgram Nova-3: speech-to-text em streaming, com baixa latência e multilingue. No projeto: a transcrição de cada chamada.
- LLM pequeno (OpenAI) e modelo frontier: o modelo que conduz a conversa e extrai os dados; o frontier é o modelo mais forte usado na escalada (fornecedor confidencial).
- TTS (síntese de voz): transforma o texto do agente em fala; configurada no Vapi, com a velocidade de fala afinada.
- Function calling: o modelo chama uma função declarada com argumentos em JSON que seguem um schema. No projeto: a função de fim de chamada entrega os quatro dados e dispara o webhook.
- Webhook: um sistema avisa outro com um pedido HTTP quando acontece um evento. No projeto: fim de chamada → n8n; chamadas de teste → Watchtowers.
- n8n: automação de workflows, visual e open-source, que pode ser alojada internamente; os nós de IA do n8n são construídos sobre o LangChain. No projeto: verificação e envio dos alertas e relatórios.
- Claude (Anthropic): o LLM usado como agente verificador no n8n.
- WebRTC: norma aberta para áudio e vídeo em tempo real entre browsers e aplicações, com baixa latência e cifra obrigatória (sinalização, ICE/STUN/TURN, SRTP). No projeto: o bombeiro entrava na chamada em curso a partir do browser.
- Azure: a cloud da Microsoft; no projeto, a base de dados das exceções que alimentavam a knowledge base.
- Knowledge base do Vapi (RAG): o agente consulta documentos durante a conversa e usa os excertos relevantes. No projeto: as exceções, sem fine-tuning.

## Ferramentas: avaliação e observabilidade
- LangChain: framework open-source com peças padrão para aplicações de LLM (modelos, prompts, tools, retrievers, parsers). Usado com o LangGraph e o LangSmith na fase de testes.
- LangGraph: biblioteca para fluxos de agentes como grafos com estado — nós, arestas (também condicionais), ciclos, checkpoints e humano no loop. Define-se um estado tipado, cada nó é uma função que lê e escreve nesse estado, e ligam-se os nós com arestas. No projeto: as Watchtowers, em que cada torre é um nó; as quatro torres correm em paralelo (fan-out), um nó de métricas espera pelas quatro (fan-in) e uma aresta condicional decide release ou cenário novo.
- LangSmith: plataforma de observabilidade e avaliação; cada execução fica como trace (inputs, outputs, latência, tokens, custo), com datasets, avaliadores e comparação de versões. Ativa-se com variáveis de ambiente (LANGSMITH_TRACING e a chave de API). No projeto: cada execução das Watchtowers era um trace.
- Harness de stress: programa que simula quem liga, em loop, contra o agente real; personas × cenários, execução contínua, recolha de métricas.
- Retell AI e ElevenLabs: plataformas alternativas de agentes de voz, comparadas com o Vapi.

## Ferramentas do anúncio e equivalências
- Langfuse: plataforma open-source de observabilidade de LLMs (traces, gestão de prompts, avaliações, datasets, custos), que pode ser alojada internamente. Equivalente open-source do LangSmith; para dados de saúde, alojar na UE é uma vantagem.
- MLflow: plataforma open-source do ciclo de vida de ML (experiências, métricas, registo e deployment de modelos); as versões recentes fazem tracing e avaliação de LLMs.
- Arize e Phoenix: observabilidade e avaliação de LLMs em produção; o Phoenix é a versão open-source, baseada em OpenTelemetry.
- Azure OpenAI: os modelos da OpenAI alojados no Azure, com rede privada, dados na UE, filtros de conteúdo e SLAs empresariais.
- Microsoft Foundry: o antigo Azure AI Foundry (mudou de nome no fim de 2025); plataforma para construir, avaliar e operar aplicações e agentes, com catálogo de modelos (inclui Claude), avaliações e tracing.
- Semantic Kernel e Microsoft Agent Framework: SDK open-source da Microsoft para ligar LLMs a código (plugins, conectores, memória). O sucessor é o Microsoft Agent Framework (versão 1.0 em abril de 2026), que junta o Semantic Kernel e o AutoGen e tem workflows em grafo — o papel que o LangGraph teve nas Watchtowers.
- Bases vetoriais e Azure AI Search: guardam embeddings e procuram por semelhança; o Azure AI Search junta pesquisa vetorial, por palavra-chave e reranking. O Bruno publicou um post ("RAG a £0") com uma stack open-source: embeddings BGE-M3, Qdrant, um reranker BGE e Ollama.
- RAG (retrieval-augmented generation): recuperar os excertos relevantes de uma base de conhecimento e dá-los ao modelo como contexto. Boas práticas: chunking por secção, pesquisa híbrida (vetor + palavras-chave), reranking, respostas com citações, e avaliação separada do retrieval e da resposta.

## Conceitos
- Temperatura: controla a aleatoriedade das respostas; perto de zero, respostas quase determinísticas.
- Endpointing: quanto silêncio o sistema espera para decidir que a pessoa acabou de falar; mexe na latência e no "falar por cima".
- Structured output: o modelo responde num JSON que segue um schema, validado no código.
- LLM-as-a-judge: um LLM avalia outputs com uma rubrica ou contra a resposta certa; deve ser calibrado com etiquetas humanas (por exemplo, kappa de Cohen), usar rubricas sim/não, justificar antes do veredicto, e ser um modelo diferente do avaliado.
- Guardrails e prompt injection: regras e verificações à volta do modelo; prompt injection é alguém tentar dar instruções ao modelo para contornar as regras — é o risco número um do OWASP Top 10 para aplicações com LLMs. Defesa em camadas: entrada (deteção), controlo (âmbito estreito, ferramentas permitidas), saída (schema e verificador) e humano.
- Trace: o registo de uma execução passo a passo, com tempos, tokens e custos.
- P95: o valor abaixo do qual ficam 95% das medições — mostra a cauda, não a média.
- Shadow mode e canary: shadow — o sistema novo corre em paralelo sem afetar ninguém; canary — vai primeiro para uma pequena parte do tráfego.
- Regra dos três: zero falhas em n testes implica uma taxa real de falha abaixo de 3/n com 95% de confiança; com 500 testes, abaixo de 0,6%.
- Teste de McNemar: o teste estatístico adequado para comparar dois modelos avaliados nos mesmos exemplos (resultados emparelhados).

## Regulação: AI Act e RGPD
- AI Act (Regulamento (UE) 2024/1689): o Anexo III, ponto 5(d), classifica como alto risco os sistemas de IA destinados a avaliar e classificar chamadas de emergência ou a despachar ou priorizar serviços de primeira resposta. O AI First-Responder decidia se uma chamada era uma emergência, pelo que muito provavelmente cairia nesta categoria.
- Prazos: com o Digital Omnibus (Regulamento (UE) 2026/1744, em vigor desde 27 de julho de 2026), as obrigações de alto risco do Anexo III aplicam-se a partir de 2 de dezembro de 2027. A obrigação de transparência do artigo 50 (um chatbot ou agente de voz tem de dizer que é IA) aplica-se desde 2 de agosto de 2026 e não foi adiada.
- O que o desenho do projeto já antecipava: supervisão humana (o humano sempre a um passo), registos de cada chamada, e robustez testada (gate de regressão). Para conformidade total faltaria gestão de risco formal, documentação técnica e avaliação de conformidade.
- Seguros: a avaliação de risco e o pricing em seguros de vida e saúde também são alto risco (Anexo III, ponto 5(c)).
- RGPD: dados de saúde são uma categoria especial (art. 9); o tratamento em larga escala exige uma avaliação de impacto (DPIA, art. 35); princípios de minimização, prazos de retenção e dados na UE. No projeto, a base legal foi o interesse vital (art. 6(1)(d) e 9(2)(c)).

## Como isto se aplica à Medicare (ideias do Bruno)
- Contexto público: a Medicare é a marca líder de planos de saúde em Portugal, 100% portuguesa, fundada em 2006 e com sede em Lisboa; não é prestadora nem seguradora — gere planos que dão acesso a uma rede de mais de 17.500 prestadores com valores convencionados; tem mais de 1,4 milhões de clientes, uma área de cliente e app com cartão virtual, e serviços como médico ao domicílio e vídeo-consultas em alguns planos.
- Ideias, por ordem de risco crescente: (1) agent assist no apoio ao cliente — resumo da chamada e resposta sugerida com RAG sobre o guia de cada plano, com o humano a decidir; (2) pesquisa na rede de prestadores — "que dentista perto de mim tem acordo no meu plano?" é metade uma pergunta estruturada (prestadores, especialidade, localização → SQL ou tool calling) e metade documental (o que o plano cobre → RAG com metadados por plano); (3) apoio aos prestadores; (4) captura estruturada de pedidos por voz, por exemplo para o médico ao domicílio, sem conselho clínico e com humano a um passo.
- Método: o mesmo de sempre — golden set, gate de regressão antes de cada release, observabilidade em produção (por exemplo, Langfuse) e humano no loop.

## Perguntas frequentes
- "Este projeto foi feito por IA?": o projeto AI First-Responder foi desenhado e construído por uma equipa humana na MAKEIT, com o Bruno a desenhar a arquitetura, o sistema de avaliação e o harness de stress e a coordenar quatro engenheiros. Este assistente e o material da apresentação foram preparados pelo Bruno com a ajuda do Claude (Anthropic) — o que, num papel de IA generativa, é exatamente a forma de trabalhar que se espera.
- "Quantas chamadas há em produção?" / "Qual é a percentagem resolvida sem humano?": esses números estão sob NDA e não são divulgados.
- "Qual é o modelo frontier?": o fornecedor é confidencial; o mecanismo é público — sinais de falha fazem escalar do modelo pequeno para o forte, e depois para o humano.
- "Porquê um LLM numa linha de emergência?": porque o âmbito é estreito (quatro dados e um alerta, zero conselho clínico), a temperatura é perto de zero, há verificação antes de qualquer alerta, um gate em cada release, e um humano sempre a um passo.
- "Como se sabe que o juiz LLM está certo?": as regras determinísticas apanham a maior parte; o juiz só avalia o que não tem regra e compara com a resposta certa de cada cenário. Uma calibração formal contra uma amostra etiquetada por humanos é uma das melhorias que o Bruno faria desde o início.
- "E se alguém envenenar a knowledge base?": as exceções vinham de chamadas em que o humano tinha entrado, não de texto livre de qualquer pessoa, e o agente só recolhe dados, não dá instruções. Mesmo assim, o Bruno defende revisão humana antes de cada entrada.
- "Como funciona este assistente?": pesquisa híbrida (vetor + palavras-chave) sobre esta base de conhecimento, reranking dos excertos, resposta gerada pelo Claude com citações, classificação prévia da pergunta, limites de pedidos e verificação da resposta. Responde só sobre o projeto e a candidatura.

## Sobre o Bruno Sousa
Engenheiro de IA português. Segundo o CV: CTO na NEROES, Partner e CTO na IPIU, fundador da MedAIVision, Senior AI Consultant na Deloitte, Senior AI-Health Developer na MAKEIT (agosto de 2025 a junho de 2026), Junior ML Engineer na Sword Health e investigador no i3N. Interesses: agentes de voz, avaliação de sistemas com LLMs, RAG e observabilidade em produção. Candidato ao papel de Generative AI Product Engineer na Medicare (Lisboa, híbrido); apresentação técnica a 1 de outubro de 2026.
