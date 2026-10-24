/**
 * Who is responsible for Context Control, as the privacy notice and the terms state it.
 * Context Control is operated by an individual with business activities (persona física con
 * actividad empresarial) under the trade name "Context Control". Fill in the bracketed values
 * and set `reviewed` once a lawyer has reviewed both texts; until then the pages say they are
 * a draft.
 */
export const LEGAL = {
  reviewed: false,
  updatedAt: '24 de octubre de 2026',
  /** Nombre completo del titular (como aparece en la constancia de situación fiscal). */
  holder: '[Nombre completo]',
  regime: 'persona física con actividad empresarial',
  tradeName: 'Context Control',
  /** Domicilio para oír y recibir notificaciones (puede ser una oficina o domicilio comercial). */
  address: '[Domicilio]',
  privacyEmail: 'privacidad@contextcontrol.com.mx',
  supportEmail: 'soporte@contextcontrol.com.mx',
  site: 'https://www.contextcontrol.com.mx',
};

/** "Nombre, persona física con actividad empresarial que opera bajo el nombre comercial Context Control". */
export const RESPONSIBLE = `${LEGAL.holder}, ${LEGAL.regime} que opera bajo el nombre comercial ${LEGAL.tradeName}`;
