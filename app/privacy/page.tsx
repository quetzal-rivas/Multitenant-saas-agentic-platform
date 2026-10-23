import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { LEGAL } from '@/lib/legal/entity';

export const metadata: Metadata = { title: 'Aviso de privacidad — Context Control' };

/** Aviso de privacidad integral (LFPDPPP). Describes what the product actually does with data. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Aviso de privacidad">
      <p>
        {LEGAL.entity}, con domicilio en {LEGAL.address} (&quot;Context Control&quot;), es responsable del tratamiento de los datos personales que nos
        proporcionas al usar {LEGAL.site} y sus servicios, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.
      </p>

      <h2>Datos que tratamos</h2>
      <ul>
        <li>Datos de identificación y contacto de tu cuenta: nombre, correo electrónico y contraseña (guardada de forma cifrada por nuestro proveedor de autenticación).</li>
        <li>Datos de tu organización: nombre, miembros, roles e invitaciones.</li>
        <li>Datos de facturación: los procesa Stripe. Context Control no recibe ni guarda los números de tu tarjeta; solo conserva el identificador de cliente y de suscripción.</li>
        <li>
          Contenido que tú o tus agentes procesan en la plataforma: configuraciones de agentes y equipos, perfiles de contexto, conversaciones, tareas y, si
          usas llamadas, transcripciones de voz.
        </li>
        <li>
          Llaves de tus propios proveedores (OpenAI, Anthropic, Google, ElevenLabs, Twilio, etc.): se guardan cifradas con cifrado de sobre (AWS KMS) y
          nunca se vuelven a mostrar.
        </li>
        <li>Datos técnicos y de uso: registros de acceso, conteos de uso por plan y eventos de seguridad.</li>
      </ul>
      <p>No solicitamos datos personales sensibles. Si tú decides procesar ese tipo de datos con tus agentes, eres responsable de contar con el consentimiento correspondiente.</p>

      <h2>Finalidades</h2>
      <p>Finalidades necesarias para el servicio:</p>
      <ul>
        <li>Crear y administrar tu cuenta y tu organización, y autenticarte.</li>
        <li>Ejecutar los agentes, tareas, integraciones y llamadas que configuras.</li>
        <li>Cobrar tu suscripción, aplicar los límites de tu plan y enviarte avisos de cuenta y facturación (por ejemplo, fin de una prueba o uso de cuota).</li>
        <li>Mantener la seguridad, prevenir abuso y cumplir obligaciones legales.</li>
      </ul>
      <p>
        Finalidad adicional: enviarte novedades del producto. Puedes negarte en cualquier momento escribiendo a{' '}
        <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>; negarte no afecta el servicio.
      </p>

      <h2>Con quién compartimos datos</h2>
      <p>Usamos proveedores que tratan datos por cuenta nuestra (encargados), ubicados principalmente en Estados Unidos:</p>
      <ul>
        <li>Amazon Web Services: cómputo, almacenamiento, cifrado de llaves y envío de correos.</li>
        <li>Supabase: base de datos y autenticación.</li>
        <li>Stripe: pagos y facturación.</li>
        <li>Cloudflare: DNS y red.</li>
      </ul>
      <p>
        Cuando conectas tus propios proveedores de IA, voz o telefonía, el contenido que tus agentes procesan se envía a esos proveedores con tus llaves y
        bajo sus propios términos y avisos de privacidad. No vendemos tus datos ni los compartimos para publicidad.
      </p>

      <h2>Conservación y eliminación</h2>
      <ul>
        <li>Los eventos de webhooks entrantes se borran a los 30 días y las transcripciones de llamadas a los 90 días.</li>
        <li>
          Si eliminas tu organización, se revoca el acceso de todos sus miembros, se cancelan sus llaves de API y su suscripción, y sus datos se conservan para
          poder restaurarlos si lo solicitas. Puedes pedir su borrado definitivo en cualquier momento.
        </li>
        <li>Bajar de plan nunca borra datos: lo que excede el plan queda en pausa.</li>
      </ul>

      <h2>Derechos ARCO y revocación del consentimiento</h2>
      <p>
        Puedes acceder, rectificar o cancelar tus datos, oponerte a su tratamiento o revocar tu consentimiento escribiendo a{' '}
        <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a> desde el correo de tu cuenta, indicando tu nombre, la solicitud y, en su caso, los
        datos a corregir. Respondemos en un máximo de 20 días hábiles y, si procede, la hacemos efectiva dentro de los 15 días hábiles siguientes.
      </p>

      <h2>Cookies</h2>
      <p>Usamos únicamente cookies necesarias para mantener tu sesión iniciada. No usamos cookies de publicidad ni de seguimiento de terceros.</p>

      <h2>Cambios a este aviso</h2>
      <p>Publicaremos cualquier cambio en esta página y, si es relevante, te avisaremos por correo.</p>
    </LegalPage>
  );
}
