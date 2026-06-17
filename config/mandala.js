/* ---------------------------------------------------------------------------
   Mandala da CLOC (versão BR) — adaptada do CLOC Core Competency Reference
   Model ("Core 12"). Cada competência tem:
     - key      : identificador estável (salvo no perfil)
     - nome     : rótulo em PT-BR
     - en       : nome original (referência)
     - desc     : descrição curta, didática
     - keywords : termos-gatilho (minúsculos, SEM acento) para o mapeamento
                  assistido a partir do que a pessoa escreve sobre o trabalho
                  e os interesses dela.
   Fonte do modelo: cloc.org (Core 12 Functions of Legal Operations).
   --------------------------------------------------------------------------- */

// Ordem segue a mandala oficial (versão BR). As `key` são identificadores
// estáveis (já salvos em perfis) — não mudam mesmo que o rótulo PT-BR mude.
const COMPETENCIES = [
  {
    key: 'planejamento_estrategico', nome: 'Planejamento Estratégico', en: 'Strategic Planning',
    desc: 'Definir visão, metas e roadmap do legal ops alinhados à estratégia do negócio.',
    keywords: ['estrategia', 'planejamento', 'visao', 'meta', ' okr', 'roadmap', 'alinhamento', 'negocio', 'prioridade', 'objetivo', 'planejamento estrategico'],
  },
  {
    key: 'tecnologia', nome: 'Tecnologia', en: 'Technology',
    desc: 'Seleção, implementação e gestão de ferramentas e sistemas jurídicos.',
    keywords: ['tecnologia', 'ferramenta', 'sistema', 'software', ' ti ', 'legaltech', ' ia ', 'inteligencia artificial', 'integracao', 'implementacao', 'plataforma', 'low-code', 'desenvolvedor', 'programacao'],
  },
  {
    key: 'treinamento_desenvolvimento', nome: 'Treinamento e Capacitação', en: 'Training & Development',
    desc: 'Capacitar o time e os clientes internos; desenvolver competências e cultura de aprendizado.',
    keywords: ['treinamento', 'capacitacao', 'desenvolvimento', 'aprendizado', 'curso', 'mentoria', 'onboarding', 'educacao', 'formacao', 'workshop', 'palestra', 'ensino'],
  },
  {
    key: 'inteligencia_dados', nome: 'Inteligência de Negócios', en: 'Business Intelligence',
    desc: 'Métricas, relatórios e dashboards que dão visibilidade ao jurídico e embasam decisões.',
    keywords: ['dado', 'dados', 'metrica', 'metricas', 'indicador', 'kpi', 'relatorio', 'dashboard', 'analise', 'analytics', ' bi ', 'power bi', 'planilha', 'estatistica', 'numero', 'visualizacao'],
  },
  {
    key: 'gestao_financeira', nome: 'Gestão Financeira', en: 'Financial Management',
    desc: 'Orçamento, controle de gastos, previsões e gestão do budget do departamento jurídico.',
    keywords: ['financeiro', 'orcamento', 'budget', 'custo', 'gasto', 'faturamento', 'previsao', 'financas', 'contabil', 'e-billing', 'billing', 'despesa', 'honorario', 'pagamento'],
  },
  {
    key: 'gestao_fornecedores', nome: 'Gestão de Parceiros e Fornecedores', en: 'Firm & Vendor Management',
    desc: 'Seleção, gestão e avaliação de parceiros, fornecedores e escritórios externos (outside counsel).',
    keywords: ['fornecedor', 'escritorio', 'outside counsel', 'banca', 'terceiro', 'vendor', 'parceiro', 'rfp', 'sourcing', 'contratacao de escritorio', 'avaliacao de banca'],
  },
  {
    key: 'governanca_informacao', nome: 'Governança da Informação', en: 'Information Governance',
    desc: 'Ciclo de vida, retenção, privacidade e segurança de dados e documentos do jurídico.',
    keywords: ['governanca', 'retencao', 'privacidade', 'lgpd', 'seguranca', 'registro', 'documento', 'records', 'arquivo', 'protecao de dados', 'compliance de dados', 'sigilo'],
  },
  {
    key: 'gestao_conhecimento', nome: 'Gestão do Conhecimento', en: 'Knowledge Management',
    desc: 'Capturar, organizar e reutilizar conhecimento: modelos, precedentes e playbooks.',
    keywords: ['conhecimento', 'modelo', 'template', 'precedente', 'playbook', 'base de conhecimento', 'wiki', 'repositorio', 'clausula', 'minuta', 'padronizacao de documentos'],
  },
  {
    key: 'organizacao_pessoas', nome: 'Otimização e Saúde da Organização', en: 'Organization Optimization & Health',
    desc: 'Estrutura do time, papéis, cultura, saúde e desenvolvimento organizacional.',
    keywords: ['pessoas', 'time', 'equipe', 'cultura', ' rh ', 'bem-estar', 'bem estar', 'estrutura', 'organizacao', 'lideranca', 'gestao de pessoas', 'clima', 'engajamento'],
  },
  {
    key: 'operacoes_pratica', nome: 'Operações Práticas', en: 'Practice Operations',
    desc: 'Suporte ao dia a dia: fluxos de trabalho, contencioso, contratos e gestão de demandas.',
    keywords: ['contrato', 'contencioso', 'materia', 'processo', 'fluxo', 'demanda', 'atendimento', 'juridico', 'paralegal', 'gestao de contratos', ' clm ', 'workflow', 'societario', 'trabalhista'],
  },
  {
    key: 'gestao_projetos', nome: 'Gestão de Projetos e Programas', en: 'Project/Program Management',
    desc: 'Planejar e executar projetos e iniciativas do jurídico (legal project management).',
    keywords: ['projeto', 'programa', ' lpm ', 'gestao de projetos', 'cronograma', 'escopo', 'agile', 'scrum', ' pmo ', 'entrega', 'iniciativa', 'roadmap de projeto'],
  },
  {
    key: 'modelos_entrega', nome: 'Modelos de Entrega de Serviço', en: 'Service Delivery Models',
    desc: 'Como o trabalho jurídico é entregue: insourcing, outsourcing, automação e autoatendimento.',
    keywords: ['servico', 'automacao', ' alsp', 'insourcing', 'outsourcing', 'autoatendimento', 'self-service', 'self service', 'eficiencia', 'processo padrao', 'centro de servicos', 'no-code'],
  },
];

// Normaliza texto para o casamento: minúsculas, sem acento, espaços nas bordas
// (os keywords com espaço, ex. ' bi ', evitam falsos positivos dentro de palavras).
function normalize(text) {
  return ' ' + String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() + ' ';
}

// A partir de um texto livre (trabalho + interesses), devolve as keys das
// competências sugeridas, ordenadas por nº de termos-gatilho encontrados.
function suggestKeys(text) {
  const hay = normalize(text);
  const scored = COMPETENCIES.map((c) => {
    const score = c.keywords.reduce((n, kw) => (hay.includes(kw) ? n + 1 : n), 0);
    return { key: c.key, score };
  }).filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.key);
}

// Ponte entre a mandala (competências de Legal Ops) e as categorias genéricas
// de ajuda usadas no matching. Cada competência aponta para as categorias de
// ajuda mais próximas — assim preencher a mandala enriquece o match.
const CATEGORY_MAP = {
  planejamento_estrategico:    ['empreendedorismo', 'carreira', 'administrativo'],
  tecnologia:                  ['tecnologia'],
  treinamento_desenvolvimento: ['educacao', 'carreira', 'idiomas'],
  inteligencia_dados:          ['tecnologia', 'administrativo'],
  gestao_financeira:           ['financeiro'],
  gestao_fornecedores:         ['administrativo', 'empreendedorismo'],
  governanca_informacao:       ['juridico', 'tecnologia'],
  gestao_conhecimento:         ['educacao', 'administrativo'],
  organizacao_pessoas:         ['bem-estar', 'carreira', 'administrativo'],
  operacoes_pratica:           ['juridico', 'administrativo'],
  gestao_projetos:             ['administrativo', 'empreendedorismo'],
  modelos_entrega:             ['administrativo', 'empreendedorismo'],
};

// A partir das keys salvas, devolve as categorias de ajuda implicadas (únicas).
function categoriesFromCompetencies(keys) {
  if (!Array.isArray(keys)) return [];
  const out = new Set();
  keys.forEach((k) => (CATEGORY_MAP[k] || []).forEach((c) => out.add(c)));
  return [...out];
}

// Mapa key -> competência, para resolver rótulos salvos no perfil.
const BY_KEY = COMPETENCIES.reduce((m, c) => { m[c.key] = c; return m; }, {});

// Recebe as keys salvas e devolve as competências completas (na ordem da
// mandala), ignorando keys desconhecidas. Útil para exibir nos perfis.
function competenciesFor(keys) {
  if (!Array.isArray(keys)) return [];
  const set = new Set(keys);
  return COMPETENCIES.filter((c) => set.has(c.key));
}

module.exports = {
  COMPETENCIES, BY_KEY, CATEGORY_MAP,
  suggestKeys, normalize, competenciesFor, categoriesFromCompetencies,
};
