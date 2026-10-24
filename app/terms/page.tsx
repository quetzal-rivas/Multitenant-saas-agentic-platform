import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { LEGAL, RESPONSIBLE } from '@/lib/legal/entity';

export const metadata: Metadata = { title: 'Términos del servicio — Context Control' };

/** Terms of service. Mirrors how plans, trials, billing and downgrades actually work. */
export default function TermsPage() {
  return (
    <LegalPage title="Términos del servicio">
      <p>
        Estos términos regulan el uso de Context Control, ofrecido por {RESPONSIBLE} (&quot;Context Control&quot;), con domicilio en{' '}
        {LEGAL.address}. Al crear una cuenta o usar el servicio
        los aceptas en nombre propio o de la organización que representas.
      </p>

      <h2>El servicio</h2>
      <p>
        Context Control es una plataforma para crear y operar agentes de IA, equipos de agentes, perfiles de contexto, tareas programadas, integraciones y un
        servidor MCP. Los agentes usan las llaves de los proveedores que tú conectas (&quot;trae tu propia llave&quot;): tú pagas directamente a esos
        proveedores su uso, y Context Control no te cobra por él.
      </p>

      <h2>Cuentas y organizaciones</h2>
      <ul>
        <li>Debes dar información correcta y mantener segura tu contraseña y tus llaves de API.</li>
        <li>El dueño de la organización administra a sus miembros, su plan y su facturación, y puede transferir la propiedad o eliminar la organización.</li>
        <li>Eres responsable de lo que hacen los agentes que configuras y del contenido que procesan.</li>
      </ul>

      <h2>Planes, pruebas y pagos</h2>
      <ul>
        <li>El plan Free es permanente. Al crear tu organización recibes una prueba de 7 días del plan Developer.</li>
        <li>Al suscribirte a Developer recibes una prueba única de 7 días de Pro; al suscribirte a Pro, una prueba única de 7 días de Unlimited. Las pruebas nunca generan cargos ni se convierten solas en suscripción.</li>
        <li>Una prueba obtenida por una compra termina si esa suscripción se cancela o baja de plan.</li>
        <li>Las suscripciones se cobran por adelantado cada mes a través de Stripe y se renuevan automáticamente hasta que las canceles.</li>
        <li>Si cancelas, conservas tu plan hasta el final del periodo pagado. Los cambios de plan se prorratean.</li>
        <li>Si un pago falla, conservas tu plan durante un periodo de gracia de 7 días; después tu organización pasa a Free.</li>
        <li>Los precios vigentes están en la <Link href="/#pricing">página de precios</Link>. Te avisaremos con anticipación de cualquier cambio de precio.</li>
      </ul>

      <h2>Límites y protección de la plataforma</h2>
      <ul>
        <li>Cada plan tiene límites de recursos y cuotas mensuales que aplica el servidor.</li>
        <li>Si bajas de plan, nada se borra: los recursos que excedan el nuevo plan quedan en pausa hasta que elijas cuáles mantener activos o subas de plan.</li>
        <li>Para proteger el servicio podemos limitar temporalmente el número de ejecuciones simultáneas o pausar ejecuciones nuevas, sin afectar tus datos.</li>
      </ul>

      <h2>Uso aceptable</h2>
      <p>No puedes usar el servicio para actividades ilegales, enviar spam, suplantar a otros, vulnerar sistemas ajenos, ni para procesar datos sin la base legal necesaria.</p>

      <h2>Tus datos</h2>
      <p>
        Tu contenido es tuyo. Lo tratamos como se describe en el <Link href="/privacy">aviso de privacidad</Link>, solo para prestarte el servicio.
      </p>

      <h2>Disponibilidad y responsabilidad</h2>
      <p>
        Hacemos lo razonable para mantener el servicio disponible y seguro, pero se ofrece &quot;tal cual&quot;, sin garantía de disponibilidad
        ininterrumpida. Las respuestas de los modelos de IA pueden ser incorrectas; revísalas antes de actuar con base en ellas. En la medida que lo permita
        la ley, nuestra responsabilidad total se limita a lo que nos hayas pagado en los 12 meses anteriores al hecho que la origina.
      </p>

      <h2>Terminación</h2>
      <p>
        Puedes cancelar tu suscripción o eliminar tu organización cuando quieras. Podemos suspender cuentas que incumplan estos términos, avisándote cuando
        sea posible.
      </p>

      <h2>Cambios y ley aplicable</h2>
      <p>
        Publicaremos los cambios en esta página y te avisaremos de los relevantes. Estos términos se rigen por las leyes de México. Dudas:{' '}
        <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
      </p>
    </LegalPage>
  );
}
