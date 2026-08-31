/**
 * ====================================================================
 * 🧠 BRIDGE TENSORFLOW.JS - MOTOR DE INTELIGÊNCIA ARTIFICIAL REAL
 * ====================================================================
 * Este módulo gerencia todo o ciclo de vida da Rede Neural no Navegador:
 *  1. Extração e Engenharia de Features Ponderadas (Filmes + Usuários).
 *  2. Agregação Demográfica de Audiência por Filme (Idade Média e Proporção F/M).
 *  3. Construção de Pares Supervisionados com Amostragem Negativa Contrastiva.
 *  4. Treinamento na GPU via WebGL/WASM com tf.Sequential e Binary Cross-Entropy.
 *  5. Inferência e Geração de Recomendações Personalizadas em Tempo Real.
 * ====================================================================
 */

class TensorFlowBridge {
  // ==================================================================
  // ⚖️ SISTEMA DE PESOS (IMPORTÂNCIA RELATIVA DE CADA FEATURE)
  // ==================================================================
  // Os pesos definem a influência de cada atributo no cálculo dos vetores.
  // Gênero tem o maior peso para garantir que as preferências sejam respeitadas,
  // seguido pela qualidade da obra (IMDB) e alinhamento demográfico.
  // Os pesos são medidos de 0.0 a 1.0 e somam 1.0.
  static WEIGHTS = {
    genre: 0.45,      // 🎭 Gêneros do filme e compatibilidade com os gostos do usuário
    imdb: 0.25,       // ⭐ Nota média da crítica no IMDB (qualidade do filme)
    age: 0.15,        // 🎂 Faixa etária do usuário e idade média do público do filme
    gender: 0.10,     // 🚻 Sexo do usuário e histórico demográfico de espectadores
    year: 0.05        // 📅 Ano de lançamento (modernidade vs. clássico)
  };

  // ========== Inicialização ==========
  constructor() {
    this.dataset = null;                          // Dataset de filmes carregado do servidor
    this.vocabulary = null;                       // Vocabulário de gêneros únicos
    this.model = null;                            // Instância compilada da Rede Neural (tf.Sequential)
    this.movieStats = {};                         // Estatísticas agregadas de audiência por filme
    this.onRecommendationUpdateCallbacks = [];    // Callbacks para atualização da UI
  }

  // ========== Engenharia de Features ========== 
  // O processo de transformação de dados brutos em vetores numéricos que a rede pode entender
  // ============================================ 
  /**
   * Varre o histórico de todos os usuários para descobrir:
   *  - Idade média das pessoas que assistiram e avaliaram bem (nota >= 3.5 ou curtiram).
   *  - Proporção de público feminino vs. masculino para cada filme.
   * Isso permite que a Rede Neural aprenda afinidade demográfica real entre perfis.
   * 
   * @param {Array} users - Lista de todos os usuários do sistema
   * @returns {Object} Mapa com { avgAge, femaleRatio } por movieId
   */
  _computeMovieDemographics(users) {
    const ageSums = {};
    const ageCounts = {};
    const femaleCounts = {};
    const totalVotes = {};

    users.forEach(user => {
      (user.watched_movies || []).forEach(m => {
        // Consideramos apenas avaliações positivas para traçar o perfil de fãs do filme
        if (m.user_rating >= 3.5 || m.liked) {
          const id = m.movie_id;
          ageSums[id] = (ageSums[id] || 0) + (user.age || 30);
          ageCounts[id] = (ageCounts[id] || 0) + 1;
          totalVotes[id] = (totalVotes[id] || 0) + 1;
          if (user.gender === 'F') {
            femaleCounts[id] = (femaleCounts[id] || 0) + 1;
          }
        }
      });
    });

    const stats = {};
    (this.dataset || []).forEach(item => {
      const id = item.movieId;
      const count = ageCounts[id] || 0;
      stats[id] = {
        // Se o filme ainda não foi avaliado, usamos a média global (30 anos / 50% F)
        avgAge: count > 0 ? ageSums[id] / count : 30,
        femaleRatio: count > 0 ? (femaleCounts[id] || 0) / totalVotes[id] : 0.5
      };
    });

    this.movieStats = stats;
    return stats;
  }

  // ==================================================================
  // 🎬 CODIFICAÇÃO VETORIAL DO FILME (PONDERADA)
  // ==================================================================
  /**
   * Transforma as propriedades de um filme em um vetor numérico ponderado.
   *  - IMDB Rating: Normalizado (0 a 1) e multiplicado pelo peso IMDB.
   *  - Ano: Normalizado (0 a 1) e multiplicado pelo peso Ano.
   *  - Gêneros: Vetor Multi-Hot multiplicado pelo peso Gênero.
   *  - Idade Média do Público: Normalizada e multiplicada pelo peso Idade.
   *  - Proporção Feminina: Multiplicada pelo peso Sexo.
   * 
   * @param {number} movieId - ID do filme
   * @param {number} movieIdx - Índice no array do dataset
   * @param {Array} genresMatrix - Matriz Multi-Hot de gêneros
   * @param {Array} metaMatrix - Matriz de metadados [normRating, normYear]
   * @returns {Array<number>} Vetor de features do filme
   */
  _encodeMovieFeatures(movieId, movieIdx, genresMatrix, metaMatrix) {
    const [normRating, normYear] = metaMatrix[movieIdx];
    const genreVector = genresMatrix[movieIdx];
    const stats = this.movieStats[movieId] || { avgAge: 30, femaleRatio: 0.5 };

    // 1. Aplica os pesos nas propriedades do filme
    const ratingWeighted = normRating * TensorFlowBridge.WEIGHTS.imdb;
    const yearWeighted = normYear * TensorFlowBridge.WEIGHTS.year;
    const genreWeighted = genreVector.map(v => v * TensorFlowBridge.WEIGHTS.genre);
    
    // 2. Normaliza a idade média do público (faixa de 18 a 70 anos)
    const normAvgAge = ((stats.avgAge - 18) / (70 - 18)) * TensorFlowBridge.WEIGHTS.age;
    const genderRatioWeighted = stats.femaleRatio * TensorFlowBridge.WEIGHTS.gender;

    return [ratingWeighted, yearWeighted, ...genreWeighted, normAvgAge, genderRatioWeighted];
  }

  // ==================================================================
  // 👤 CODIFICAÇÃO VETORIAL DO USUÁRIO (PONDERADA)
  // ==================================================================
  /**
   * Transforma o perfil do usuário em um vetor numérico ponderado.
   *  - Idade: Normalizada (18 a 70 anos) e multiplicada pelo peso Idade.
   *  - Sexo: One-Hot [1, 0] para 'F' ou [0, 1] para 'M', multiplicado pelo peso Sexo.
   *  - Gêneros Favoritos: Vetor Multi-Hot multiplicado pelo peso Gênero.
   * 
   * @param {Object} user - Objeto do usuário
   * @returns {Object} { vector, rawGenreVector, age, gender }
   */
  _encodeUserFeatures(user) {
    // Normalização de idade (0.0 = 18 anos, 1.0 = 70 anos)
    const normalizedAge = ((user.age || 25) - 18) / (70 - 18);
    const ageWeighted = normalizedAge * TensorFlowBridge.WEIGHTS.age;

    // Codificação One-Hot do Sexo: [Feminino, Masculino]
    let genderVector = [0, 0];
    if (user.gender === 'F') genderVector = [1, 0];
    else if (user.gender === 'M') genderVector = [0, 1];
    const genderWeighted = genderVector.map(v => v * TensorFlowBridge.WEIGHTS.gender);

    // Codificação Multi-Hot dos Gêneros Preferidos
    const allGenres = this.vocabulary?.genres || [];
    const prefGenres = user.preferred_genres || [];
    const genrePrefVector = allGenres.map(g => prefGenres.includes(g) ? 1 : 0);
    const genrePrefWeighted = genrePrefVector.map(v => v * TensorFlowBridge.WEIGHTS.genre);

    return {
      vector: [ageWeighted, ...genderWeighted, ...genrePrefWeighted],
      rawGenreVector: genrePrefVector,
      age: user.age || 25,
      gender: user.gender || 'F'
    };
  }

  // ==================================================================
  // 🔗 VETOR DE INTERAÇÃO DIRETA (CRUZAMENTO FILME x USUÁRIO)
  // ==================================================================
  /**
   * Concatena os vetores do filme e do usuário adicionando sinais diretos de afinidade:
   *  1. Sobreposição de Gêneros (Jaccard Overlap): % de gêneros do usuário presentes no filme.
   *  2. Match Binário de Gênero: 1.0 se houver pelo menos 1 gênero em comum.
   *  3. Afinidade Etária: Quão próxima é a idade do usuário da idade média dos fãs do filme.
   *  4. Afinidade de Sexo: Alinhamento com a maioria do público do filme.
   * 
   * @param {Array<number>} movieVec - Vetor codificado do filme
   * @param {Object} userObj - Objeto retornado por _encodeUserFeatures
   * @param {Array<number>} movieGenreVec - Vetor binário de gêneros do filme
   * @param {number} movieId - ID do filme
   * @returns {Array<number>} Vetor de entrada final para a Rede Neural
   */
  _combinePair(movieVec, userObj, movieGenreVec, movieId) {
    const stats = this.movieStats[movieId] || { avgAge: 30, femaleRatio: 0.5 };
    
    // 1. Cálculo da sobreposição exata de gêneros
    let overlapCount = 0;
    let userPrefCount = 0;
    for (let i = 0; i < movieGenreVec.length; i++) {
      if (userObj.rawGenreVector[i] > 0) userPrefCount++;
      if (movieGenreVec[i] > 0 && userObj.rawGenreVector[i] > 0) {
        overlapCount++;
      }
    }
    const genreOverlap = (userPrefCount > 0 ? (overlapCount / userPrefCount) : 0) * TensorFlowBridge.WEIGHTS.genre;
    const hasGenreMatch = (overlapCount > 0 ? 1.0 : 0.0) * TensorFlowBridge.WEIGHTS.genre;

    // 2. Proximidade de idade com a audiência do filme (diferença máxima tolerada de 30 anos)
    const ageDiff = Math.abs(userObj.age - stats.avgAge);
    const ageAffinity = Math.max(0, 1 - ageDiff / 30) * TensorFlowBridge.WEIGHTS.age;

    // 3. Alinhamento de público por sexo (se o usuário for F, usa femaleRatio; se M, usa maleRatio)
    const genderAffinity = (userObj.gender === 'F' ? stats.femaleRatio : (1 - stats.femaleRatio)) * TensorFlowBridge.WEIGHTS.gender;

    // Vetor unificado de entrada
    return [...movieVec, ...userObj.vector, genreOverlap, hasGenreMatch, ageAffinity, genderAffinity];
  }

  // ==================================================================
  // 📥 CARREGAMENTO DO DATASET DO SERVIDOR HTTP NO NAVEGADOR
  // ==================================================================
  /**
   * Faz requisição ao endpoint /api/dataset para obter os filmes vetorizados
   */
  async loadDataset() {
    const res = await window.apiClient.getDatasetForTFJS();
    if (res.status === 200) {
      this.dataset = res.dataset;
      this.vocabulary = res.vocabulary;
      return res;
    }
    throw new Error('Falha ao carregar dataset do servidor HTTP');
  }

  /**
   * Converte o dataset de filmes em matrizes numéricas para processamento
   */
  async getMoviesNumericMatrices() {
    if (!this.dataset) await this.loadDataset();

    const X_genres = [];
    const X_meta = [];
    const movieIds = [];

    this.dataset.forEach(item => {
      movieIds.push(item.movieId);
      X_genres.push(item.genreVector);
      X_meta.push([item.normalizedRating, item.normalizedYear]);
    });

    return { movieIds, genresMatrix: X_genres, metaMatrix: X_meta };
  }

  /**
   * Converte a lista de todos os usuários em vetores e calcula a demografia agregada
   */
  async getUserFeatureMap() {
    const res = await window.apiClient.getUsers();
    if (res.status !== 200) return {};

    const users = res.data;
    // Computa estatísticas demográficas de audiência para todos os filmes
    this._computeMovieDemographics(users);

    const userMap = {};
    users.forEach(user => {
      const raw = {
        id: user.id,
        name: user.name,
        watched_movies: user.watched_movies || [],
        age: user.age,
        gender: user.gender,
        preferred_genres: user.preferred_genres || []
      };
      const userEncoded = this._encodeUserFeatures(raw);
      userMap[user.id] = {
        ...raw,
        userEncoded: userEncoded
      };
    });
    return userMap;
  }

  // ==================================================================
  // 🎯 MONTAGEM DE PARES SUPERVISIONADOS (COM NEGATIVE SAMPLING)
  // ==================================================================
  /**
   * Cria os pares de treino (X_train, y_train):
   *  - Amostras Positivas (y = 0.7 a 1.0): Filmes assistidos e avaliados com nota >= 3.5 ou curtidos.
   *  - Amostras Negativas Reais (y = 0.05 a 0.25): Filmes assistidos com nota baixa (< 3.5) ou descurtidos.
   *  - Amostras Negativas Contrastivas (y = 0.05 a 0.15): Filmes não assistidos de gêneros não preferidos.
   *    (Essencial para que a rede aprenda a diferenciar e não classifique tudo como 0.99!).
   */
  async getSupervisedTrainingPairs() {
    const { movieIds, genresMatrix, metaMatrix } = await this.getMoviesNumericMatrices();
    const userMap = await this.getUserFeatureMap();

    // Pré-codifica todos os filmes do catálogo
    const movieFeatures = {};
    const movieGenreMap = {};
    movieIds.forEach((id, idx) => {
      movieFeatures[id] = this._encodeMovieFeatures(id, idx, genresMatrix, metaMatrix);
      movieGenreMap[id] = genresMatrix[idx];
    });

    const X_train = [];
    const y_train = [];

    Object.values(userMap).forEach(user => {
      const userObj = user.userEncoded;
      const watchedSet = new Set();

      // 1. Exemplos Positivos & Negativos Reais do Histórico de Visualizações
      (user.watched_movies || []).forEach(watched => {
        const id = watched.movie_id;
        if (!movieFeatures[id]) return;
        watchedSet.add(id);

        const movieVec = movieFeatures[id];
        const movieGenreVec = movieGenreMap[id];
        const combined = this._combinePair(movieVec, userObj, movieGenreVec, id);

        X_train.push(combined);

        // Se nota >= 3.5 ou curtido -> Rótulo Positivo (0.7 a 1.0)
        // Se nota baixa ou descurtido -> Rótulo Negativo (0.1 a 0.25)
        let target = (watched.user_rating || 4) / 5.0;
        if (!watched.liked && watched.user_rating < 4) {
          target = Math.min(target, 0.25);
        }
        y_train.push(target);
      });

      // 2. Amostragem Negativa Contrastiva (Filmes não assistidos de gêneros não favoritos)
      // Permite que o modelo aprenda quando NÃO recomendar um filme
      let negCount = 0;
      const maxNegatives = Math.max(8, (user.watched_movies || []).length * 2);

      for (let i = 0; i < movieIds.length && negCount < maxNegatives; i++) {
        const id = movieIds[i];
        if (watchedSet.has(id)) continue;

        const movieGenreVec = movieGenreMap[id];
        // Verifica se há alguma sobreposição com os gêneros favoritos do usuário
        const hasOverlap = movieGenreVec.some((v, gIdx) => v > 0 && userObj.rawGenreVector[gIdx] > 0);
        
        if (!hasOverlap) {
          const movieVec = movieFeatures[id];
          const combined = this._combinePair(movieVec, userObj, movieGenreVec, id);
          X_train.push(combined);
          y_train.push(0.05 + Math.random() * 0.1); // Rótulo baixo (0.05 a 0.15)
          negCount++;
        }
      }
    });

    return {
      X_train,
      y_train,
      inputShape: X_train.length > 0 ? X_train[0].length : 0,
      numSamples: X_train.length
    };
  }

  // ==================================================================
  // 🏗️ ARQUITETURA DA REDE NEURAL (TENSORFLOW.JS)
  // ==================================================================
  /**
   * Constrói a Rede Neural Sequencial Profunda:
   *  - Camada de Entrada: 128 neurônios + ReLU (extrai padrões não-lineares).
   *  - Dropout (15%): Desativa neurônios aleatórios para evitar Overfitting.
   *  - Camada Oculta 1: 64 neurônios + ReLU (comprime as representações).
   *  - Camada Oculta 2: 32 neurônios + ReLU (destila os padrões mais fortes).
   *  - Camada de Saída: 1 neurônio + Sigmoid (comprime a saída no intervalo 0.0 a 1.0).
   *  - Otimizador Adam (lr=0.008) + Função de Perda Binary Cross-Entropy.
   * 
   * @param {number} inputShape - Tamanho do vetor de entrada
   */
  async buildModel(inputShape) {
    if (!window.tf) throw new Error("TensorFlow.js não carregado!");
    
    this.model = tf.sequential();
    
    // Camada de Entrada (128 neurônios)
    this.model.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: [inputShape] }));
    
    // Regularização por Dropout para evitar memorização excessiva
    this.model.add(tf.layers.dropout({ rate: 0.15 }));
    
    // Camadas Ocultas Densas
    this.model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
    this.model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    
    // Camada de Saída (1 neurônio com probabilidade sigmoidal 0.0 - 1.0)
    this.model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
    
    // Compilação do modelo com otimizador adaptativo Adam e binaryCrossentropy
    this.model.compile({
      optimizer: tf.train.adam(0.008),
      loss: 'binaryCrossentropy',
      metrics: ['mse']
    });
  }

  // ==================================================================
  // 🚀 TREINAMENTO DA REDE NEURAL NA GPU / CPU DO NAVEGADOR
  // ==================================================================
  /**
   * Executa o treinamento supervisionado e exibe o progresso em tempo real na UI.
   * Limpa a memória de tensores (dispose) após o término para evitar vazamentos de memória na GPU.
   */
  async trainModel() {
    const statusBox = document.getElementById('tfjs-training-status');
    const statusText = document.getElementById('tfjs-status-text');
    if (statusBox) statusBox.style.display = 'block';

    try {
      if (statusText) statusText.innerHTML = `⚙️ Extraindo matrizes e preparando pares contrastivos...`;
      const { X_train, y_train, inputShape, numSamples } = await this.getSupervisedTrainingPairs();

      if (numSamples === 0) {
        if (statusText) statusText.innerHTML = `⚠️ Nenhum dado de avaliação foi encontrado para treinar.`;
        return;
      }

      // Constrói a arquitetura com o número exato de features de entrada
      await this.buildModel(inputShape);

      // Converte arrays JavaScript em Tensores do TensorFlow.js
      const X_tensor = tf.tensor2d(X_train);
      const y_tensor = tf.tensor2d(y_train, [y_train.length, 1]);

      // Treina a rede por 35 épocas com mini-batches de 32 exemplos
      await this.model.fit(X_tensor, y_tensor, {
        epochs: 35,
        batchSize: 32,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (statusText) {
              statusText.innerHTML = `⚙️ TFJS Aprendendo Pesos: <strong>Epochs ${epoch + 1}/35</strong> | Loss: <span style="color: var(--accent-gold);">${logs.loss.toFixed(4)}</span> | Amostras: ${numSamples}`;
            }
          }
        }
      });

      if (statusText) {
        statusText.innerHTML = `✅ <strong>Treinamento Concluído!</strong> Rede Neural calibrada com pesos ponderados. Clique em 🔮 Gerar Predições!`;
      }

      // Libera memória alocada na GPU/WebGL
      X_tensor.dispose();
      y_tensor.dispose();
    } catch (err) {
      console.error(err);
      if (statusText) statusText.innerHTML = `❌ Erro no TFJS: ${err.message}`;
    }
  }

  // ==================================================================
  // 🔮 INFERÊNCIA E GERAÇÃO DE RECOMENDAÇÕES PARA O USUÁRIO ALVO
  // ==================================================================
  /**
   * Avalia todos os filmes não assistidos do catálogo para o usuário selecionado:
   *  1. Constrói os vetores combinados de cada candidato não assistido.
   *  2. Executa a predição em lote na Rede Neural (model.predict).
   *  3. Ordena os filmes pelo score de afinidade e renderiza o Top 10 na tela.
   */
  async generatePredictionsForSelectedUser() {
    const user = this.selectedUser || (window.app && window.app.state && window.app.state.selectedUser);
    if (!user) {
      alert('Por favor, selecione um usuário no painel do Hero primeiro!');
      return;
    }
    if (!this.model) {
      alert('O modelo ainda não foi treinado. Clique em "Treinar Modelo" primeiro!');
      return;
    }
    if (!this.dataset) await this.loadDataset();

    const { movieIds, genresMatrix, metaMatrix } = await this.getMoviesNumericMatrices();
    const userMap = await this.getUserFeatureMap();
    const userObj = userMap[user.id]?.userEncoded || this._encodeUserFeatures(user);

    // Ignora filmes que o usuário já assistiu
    const watchedIds = new Set((user.watched_movies || []).map(m => m.movie_id));
    const candidates = [];
    const X_inference = [];

    movieIds.forEach((id, idx) => {
      if (!watchedIds.has(id)) {
        const movieVec = this._encodeMovieFeatures(id, idx, genresMatrix, metaMatrix);
        const movieGenreVec = genresMatrix[idx];
        const combined = this._combinePair(movieVec, userObj, movieGenreVec, id);
        
        X_inference.push(combined);
        candidates.push({ movieId: id });
      }
    });

    if (X_inference.length === 0) {
      alert('Você já assistiu todos os filmes do catálogo!');
      return;
    }

    // Executa a inferência em lote na GPU
    const X_tensor = tf.tensor2d(X_inference);
    const predictionsTensor = this.model.predict(X_tensor);
    const predictionsArray = await predictionsTensor.data();
    
    // Libera os tensores de inferência da memória
    X_tensor.dispose();
    predictionsTensor.dispose();

    // Mapeia os resultados, ordena do maior para o menor e pega o Top 10
    const predictions = candidates.map((c, idx) => {
      const rawScore = predictionsArray[idx];
      return {
        movieId: c.movieId,
        score: rawScore,
        matchPercentage: Math.min(100, Math.max(1, Math.round(rawScore * 100)))
      };
    })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    console.log('[TFJS Bridge] Top 10 Predições para', user.name, predictions);
    this.renderRecommendations(predictions);
  }

  // ==================================================================
  // 🎨 RENDERIZAÇÃO DOS CARDS DE RECOMENDAÇÃO NA INTERFACE
  // ==================================================================
  /**
   * Monta o grid visual com os 10 filmes recomendados, exibindo:
   *  - Pôster do filme, título, gêneros e nota IMDB.
   *  - Tag de Afinidade calculada pela Rede Neural (% de afinidade colorida).
   * 
   * @param {Array} recommendations - Lista com { movieId, score, matchPercentage }
   */
  async renderRecommendations(recommendations) {
    const container = document.getElementById('tfjs-recommendations-grid');
    if (!container) return;

    if (!recommendations || recommendations.length === 0) {
      container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: var(--text-muted);">Nenhuma recomendação disponível. Clique em 🔮 Gerar Predições!</div>`;
      return;
    }

    const movieCardsHTML = await Promise.all(recommendations.map(async rec => {
      try {
        const res = await window.apiClient.getMovieById(rec.movieId);
        if (res.status === 200) {
          const m = res.data;
          let affinityColor = 'var(--accent-cyan)';
          if (rec.matchPercentage > 85) affinityColor = '#10b981'; // Verde para alta afinidade
          else if (rec.matchPercentage < 50) affinityColor = '#ef4444'; // Vermelho para baixa afinidade

          return `
            <div class="movie-card fade-in" data-id="${m.id}">
              <div class="movie-poster-wrapper" onclick="window.app && window.app.openMovieModal && window.app.openMovieModal(${m.id})">
                <img class="movie-poster" src="${m.poster}" alt="${m.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&q=80'" />
                <div class="rating-badge">★ ${m.rating}</div>
                <div class="movie-card-overlay">
                  <span style="font-size: 0.8rem; color: #fff; font-weight: 600;">Ver Detalhes</span>
                </div>
              </div>
              <div class="movie-info">
                <h4 class="movie-title" title="${m.title}">${m.title}</h4>
                <div class="movie-genres">${m.genres.join(', ')}</div>
                <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; justify-content: space-between; margin-top: auto; padding-top: 0.5rem; border-top: 1px solid var(--border-color);">
                  <span>Afinidade TFJS:</span>
                  <strong style="color: ${affinityColor};">${(rec.score * 100).toFixed(1)}%</strong>
                </div>
              </div>
            </div>`;
        }
      } catch (e) {
        console.error(e);
      }
      return '';
    }));

    container.innerHTML = movieCardsHTML.join('');
    this.onRecommendationUpdateCallbacks.forEach(cb => cb(recommendations));
  }

  /**
   * Registra listener para quando recomendações do TFJS forem atualizadas
   */
  onRecommendations(callback) {
    this.onRecommendationUpdateCallbacks.push(callback);
  }
}

// Exporta instância global da bridge para a aplicação
window.tfjsBridge = new TensorFlowBridge();


