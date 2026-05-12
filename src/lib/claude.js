// Punt d'entrada únic — re-exporta des dels mòduls especialitzats
export { proposarCobertura }                                    from './claude-rivo';
export { construirContextXat, xatIA } from './claude-chat';
export { proposarCoberturaCella, analitzarInfoExtra, extractHorariFromPDF } from './claude-tools';
