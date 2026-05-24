// Punt d'entrada únic — re-exporta des dels mòduls especialitzats
export { proposarCobertura }                                    from './claude-rivo';
export { construirContextXat, xatIA, aplicarPropostaChat } from './claude-chat';
export { logChat } from './claude-api';
export { proposarCoberturaCella, analitzarInfoExtra, classificarDiariOriol, extractHorariFromPDF, generarHorarisIntensius } from './claude-tools';
