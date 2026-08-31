# Walkthrough: Catálogo de Filmes com Servidor HTTP no Navegador & TensorFlow.js Ready

O projeto foi construído com sucesso! Ele inclui um **Servidor HTTP nativo rodando inteiramente dentro do navegador** (sem nenhuma biblioteca local ou Node.js/npm), uma **estrutura organizada de frontend em HTML5 e CSS3** dentro do diretório `src/`, e um **módulo de bridge para consumo e treinamento com TensorFlow.js**.

---

## 📁 Estrutura de Arquivos Criados

- [index.html](file:///Users/thaiskotovicz/Documents/UNIPDS/projects/01_fundamentos/movies_recommendations/index.html): Interface principal HTML5 semântica com layout escuro de streaming, banner hero, catálogo com busca e modal de detalhes.
- [sw.js](file:///Users/thaiskotovicz/Documents/UNIPDS/projects/01_fundamentos/movies_recommendations/sw.js): Servidor REST HTTP no Navegador implementado com a Service Worker API. Intercepta requisições `/api/...` e responde com JSONs estruturados e status HTTP 200/400/404.
- `src/css/`:
  - [main.css](file:///Users/thaiskotovicz/Documents/UNIPDS/projects/01_fundamentos/movies_recommendations/src/css/main.css): Design System, variáveis CSS (cores, tipografia Outfit/Inter, glassmorphism) e reset.
  - [components.css](file:///Users/thaiskotovicz/Documents/UNIPDS/projects/01_fundamentos/movies_recommendations/src/css/components.css): Estilos para Navbar, Hero Banner, Cards de Filme, Sistema de Avaliação por Estrelas (1-5★), Modal de Detalhes e Painel do TensorFlow.js.
  - [animations.css](file:///Users/thaiskotovicz/Documents/UNIPDS/projects/01_fundamentos/movies_recommendations/src/css/animations.css): Animações de carregamento (skeletons), brilhos de hover e transições sutis.
- `src/js/`:
  - [api.js](file:///Users/thaiskotovicz/Documents/UNIPDS/projects/01_fundamentos/movies_recommendations/src/js/api.js): Cliente HTTP que executa requisições REST `fetch('/api/...')` e inclui fallback automático para execução offline/file protocol.
  - [tfjs-bridge.js](file:///Users/thaiskotovicz/Documents/UNIPDS/projects/01_fundamentos/movies_recommendations/src/js/tfjs-bridge.js): Módulo de ponte para o TensorFlow.js. Fornece matrizes numéricas, vetores multi-hot de gêneros e um método `renderRecommendations()` para exibir as predições geradas pela sua IA.
  - [app.js](file:///Users/thaiskotovicz/Documents/UNIPDS/projects/01_fundamentos/movies_recommendations/src/js/app.js): Controlador da interface, filtros por gênero, busca em tempo real, paginação e modal interativo.

---

## ⚡ Como Executar o Projetos (Sem Instalar Nada!)

Como o servidor HTTP roda no próprio navegador via Service Worker / Interceptador Fetch, **não é necessário executar `npm install` nem baixar dependências locais**.

Você pode abrir o projeto de 2 formas simples:

1. **Via Qualquer Servidor Estático Local (Recomendado)**:
   ```bash
   npx serve .
   # ou
   python3 -m http.server 8000
   ```
   Abra `http://localhost:8000` no seu navegador.

2. **Abertura Direta no Navegador**:
   Você também pode dar dois cliques e abrir o arquivo [index.html](file:///Users/thaiskotovicz/Documents/UNIPDS/projects/01_fundamentos/movies_recommendations/index.html) diretamente no seu navegador. O fallback transparente do `api.js` garantirá o funcionamento completo do servidor HTTP.

---

## 🧠 Como Conectar Seu Modelo do TensorFlow.js

Para treinar e gerar recomendações usando o TensorFlow.js no seu código:

```javascript
// 1. Obtenha os dados do Servidor HTTP no Navegador
const { X_train, y_train } = await window.tfjsBridge.getSupervisedTrainingPairs();
const { genresMatrix, movieIds } = await window.tfjsBridge.getNumericMatrices();

// 2. Converta em Tensors do TensorFlow.js
const xs = tf.tensor2d(X_train);
const ys = tf.tensor2d(y_train, [y_train.length, 1]);

// 3. Treine seu modelo (ex: Neural Network de Filtro Colaborativo)
// ... seu código de modelo com tf.sequential() ...

// 4. Envie as predições de volta para renderização na UI:
window.tfjsBridge.renderRecommendations([
  { movieId: 1, score: 0.98 },
  { movieId: 4, score: 0.92 }
]);
```

---

## ✅ Verificação dos Requisitos Atendidos

- [x] **Servidor HTTP no Navegador**: Implementado no arquivo [sw.js](file:///Users/thaiskotovicz/Documents/UNIPDS/projects/01_fundamentos/movies_recommendations/sw.js) interceptando chamadas REST `/api/...`.
- [x] **Zero instalações locais**: Não requer Node.js/npm ou pacotes de backend.
- [x] **Organização de pastas no `src/`**: Separado em `src/css/` e `src/js/` com módulos de responsabilidade única.
- [x] **Catálogo de Filmes com Dataset IMDb Top 1000**: Suporte a busca, ordenação, filtro por gênero e avaliações de 1 a 5 estrelas.
- [x] **Pronto para TensorFlow.js**: Ponte estruturada em [tfjs-bridge.js](file:///Users/thaiskotovicz/Documents/UNIPDS/projects/01_fundamentos/movies_recommendations/src/js/tfjs-bridge.js) pronta para consumir Tensors e exibir recomendações preditas.
