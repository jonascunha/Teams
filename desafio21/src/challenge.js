// Conteúdo inicial do desafio (baseado no checklist impresso).
// Depois de criado, os administradores podem editar tudo pelo painel.

const WEEKS = [
  { week: 1, title: 'Eu começo', subtitle: 'Criar rotina é o primeiro passo para grandes resultados!' },
  { week: 2, title: 'Eu saio do automático', subtitle: 'Pequenas atitudes geram grandes mudanças!' },
  { week: 3, title: 'Eu não paro', subtitle: 'Você é mais forte do que imagina!' },
];

const DAYS = [
  { day: 1, icon: 'target', title: 'Meu compromisso', points: 2, description: 'Escreva sua meta para os próximos 21 dias: "Daqui a 21 dias eu quero..."' },
  { day: 2, icon: 'drop', title: 'Hidratação', points: 1, description: 'Beba água ao longo do dia e mantenha sua garrafinha por perto.' },
  { day: 3, icon: 'walk', title: 'Movimento', points: 2, description: 'Faça pelo menos 20 minutos de caminhada ou outra atividade leve fora do treino.' },
  { day: 4, icon: 'bowl', title: 'Prato colorido', points: 2, description: 'Faça uma refeição com pelo menos 4 cores diferentes.' },
  { day: 5, icon: 'dumbbell', title: 'Sem desculpa', points: 2, description: 'Faça seu treino programado mesmo que a motivação esteja baixa.' },
  { day: 6, icon: 'moon', title: 'Desafio do sono', points: 2, description: 'Tente dormir um pouco mais cedo e deixe o celular de lado por pelo menos 30 minutos antes de dormir.' },
  { day: 7, icon: 'chat-heart', title: 'Check-in', points: 2, description: 'Pare 5 minutos e responda: Como estou me sentindo depois de uma semana?' },
  { day: 8, icon: 'shoe', title: 'Passos', points: 2, description: 'Faça uma caminhada ou aumente sua quantidade habitual de passos.' },
  { day: 9, icon: 'apple', title: 'Missão sem açúcar', points: 1, description: 'Escolha um período do dia para evitar doces e bebidas adoçadas.' },
  { day: 10, icon: 'stretch', title: 'Mobilidade', points: 2, description: 'Faça 5–10 minutos de alongamento ou mobilidade.' },
  { day: 11, icon: 'dumbbell', title: 'Treino com foco', points: 2, description: 'Hoje o desafio é fazer o treino prestando atenção na execução de cada exercício.' },
  { day: 12, icon: 'dice', title: 'Missão surpresa', points: 3, description: 'O MOOH vai liberar uma missão surpresa!' },
  { day: 13, icon: 'bike', title: 'Mova-se fora do studio', points: 3, description: 'Escolha uma atividade diferente: caminhada, bike, dança, trilha, praia, etc.' },
  { day: 14, icon: 'heart', title: 'Domingo sem culpa', points: 2, description: 'Faça algo que te faça bem. Pode ser descansar, caminhar, passar tempo com a família ou simplesmente cuidar de você.' },
  { day: 15, icon: 'trend', title: 'Meu desafio', points: 3, description: 'Escolha um exercício e tente superar seu próprio resultado (mais repetições, mais carga, melhor execução, mais tempo...).' },
  { day: 16, icon: 'flame', title: '10 minutos', points: 3, description: 'Faça o treino extra do MOOH em casa.' },
  { day: 17, icon: 'people', title: 'Incentive alguém', points: 2, description: 'Mande uma mensagem para alguém incentivando essa pessoa a se movimentar ou cuidar de si.' },
  { day: 18, icon: 'cutlery', title: 'Prato consciente', points: 2, description: 'Faça uma refeição com atenção, sem celular e sem comer com pressa.' },
  { day: 19, icon: 'star', title: 'Eu consigo!', points: 3, description: 'Faça o treino do dia e, no final, complete uma pequena missão extra liberada pelo MOOH.' },
  { day: 20, icon: 'mountain', title: 'Quase lá!', points: 3, description: 'Faça uma atividade que você normalmente teria preguiça de fazer (caminhada, treino, mobilidade, etc.).' },
  { day: 21, icon: 'trophy', title: 'Eu consegui!', points: 5, description: 'Responda: 1. O que mudou em mim? 2. Qual hábito quero continuar? 3. Do que mais me orgulho nesses 21 dias?' },
];

// Sistema de pontos exibido no app. "Foto / check-in" é automático (1 por dia com foto no feed);
// os demais extras são lançados pelos administradores como bônus.
const POINTS_TABLE = [
  ['Treino realizado', 2],
  ['Água', 1],
  ['Caminhada/atividade extra', 2],
  ['Missão semanal', 3],
  ['Desafio surpresa', 3],
  ['Foto / check-in', 1],
  ['Ajudar / incentivar outro aluno', 2],
];

const AWARDS = [
  { icon: 'trophy', title: 'Constância MOOH', description: 'Para quem manteve maior regularidade.' },
  { icon: 'flame', title: 'Superação MOOH', description: 'Para quem percebeu maior evolução pessoal.' },
  { icon: 'heart', title: 'Energia MOOH', description: 'Para quem mais incentivou os colegas.' },
  { icon: 'star', title: 'Desafio completo', description: 'Para quem alcançou a meta de pontos.' },
];

module.exports = { WEEKS, DAYS, POINTS_TABLE, AWARDS };
