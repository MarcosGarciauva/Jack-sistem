// ════════════════════════════════════════════════════════════════════════════
// Jack — Páginas legales (/terminos y /privacidad)
// ════════════════════════════════════════════════════════════════════════════
// Documentos base para operar Jack en México como software de gestión para
// negocios de servicios. Son textos completos para publicación inicial, pero
// deben validarse con asesoría legal antes de usarse como versión contractual.
// ════════════════════════════════════════════════════════════════════════════

const LAST_UPDATE = "30 de junio de 2026";
const PROVIDER = "Jack Sistema de Gestión Empresarial";
const CONTACT_EMAIL = "marcosgarciam26k05@gmail.com";
const JURISDICTION = "Monterrey, Nuevo León, México";

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #fafafa)", padding: "40px 20px" }}>
      <div
        className="j-card"
        style={{ maxWidth: 820, margin: "0 auto", padding: "36px 40px", lineHeight: 1.65 }}
      >
        <a href="/" style={{ fontSize: 12.5, color: "var(--fg-muted)", textDecoration: "none" }}>← Volver a Jack</a>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "14px 0 4px", color: "var(--fg)" }}>
          {title}
        </h1>
        <p className="mono" style={{ fontSize: 11.5, color: "var(--fg-muted)", margin: "0 0 24px" }}>
          Última actualización: {LAST_UPDATE}
        </p>
        <div style={{ fontSize: 13.5, color: "var(--fg)", display: "flex", flexDirection: "column", gap: 14 }}>
          {children}
        </div>
        <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--fg-muted)", display: "flex", gap: 14 }}>
          <a href="/terminos" style={{ color: "inherit" }}>Términos de servicio</a>
          <a href="/privacidad" style={{ color: "inherit" }}>Aviso de privacidad</a>
        </div>
      </div>
    </div>
  );
}

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ fontSize: 15.5, fontWeight: 700, margin: "10px 0 0", color: "var(--fg)" }}>{children}</h2>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ margin: 0, color: "var(--fg-muted)" }}>{children}</p>
);

export function LegalPage({ page }: { page: "terms" | "privacy" }) {
  if (page === "privacy") {
    return (
      <LegalShell title="Aviso de privacidad integral">
        <P>
          {PROVIDER} ("Jack", "nosotros" o el "Proveedor") es responsable del tratamiento de datos
          personales que recaba para operar el sistema Jack. Este aviso se emite conforme a la Ley Federal
          de Protección de Datos Personales en Posesión de los Particulares aplicable en México. Para dudas,
          solicitudes o ejercicio de derechos, el medio de contacto es <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </P>
        <H>1. Alcance y roles</H>
        <P>
          Jack presta software a negocios de servicios (el "Cliente empresarial"). En la relación con los
          clientes finales del negocio, el Cliente empresarial decide qué datos captura, para qué los usa y cómo
          atiende a sus propios clientes. Jack trata esos datos únicamente para operar el sistema contratado,
          dar soporte y mantener la seguridad de la plataforma.
        </P>
        <H>2. Datos personales tratados</H>
        <P>
          Podemos tratar datos de administradores y empleados del negocio: nombre, correo electrónico, teléfono,
          rol, permisos, identificadores de cuenta, actividad dentro del sistema y datos necesarios para soporte.
          También pueden almacenarse datos de clientes finales capturados por el negocio: nombre, teléfono,
          correo opcional, servicio solicitado, fecha y hora de cita, empleado asignado, estado de atención,
          notas operativas, ventas internas y registros de cobro interno.
        </P>
        <H>3. Datos sensibles</H>
        <P>
          Jack no solicita datos personales sensibles como requisito de uso. Si el negocio escribe información
          sensible en campos libres de notas, lo hace bajo su responsabilidad y debe contar con autorización del
          titular cuando la ley lo exija. Recomendamos no capturar diagnósticos médicos, creencias, datos de salud,
          preferencias íntimas u otra información sensible salvo que sea indispensable para el servicio del negocio.
        </P>
        <H>4. Finalidades primarias</H>
        <P>
          Los datos se usan para crear y administrar cuentas; autenticar usuarios; administrar negocios, empleados,
          clientes, citas, reservaciones web, catálogo, proveedores, ventas internas y cortes de caja; mostrar
          métricas operativas; exportar información solicitada por el negocio; abrir conversaciones manuales por
          WhatsApp mediante enlaces wa.me; brindar soporte técnico; prevenir abuso, accesos no autorizados o fallas;
          y cumplir obligaciones legales aplicables.
        </P>
        <H>5. Finalidades secundarias</H>
        <P>
          Podemos usar datos de contacto del Cliente empresarial para comunicar mejoras del producto, avisos de
          mantenimiento, cambios legales, seguimiento comercial y recomendaciones de uso. El titular puede solicitar
          que dejemos de enviar comunicaciones no indispensables escribiendo a {CONTACT_EMAIL}.
        </P>
        <H>6. Transferencias y encargados</H>
        <P>
          Jack no vende datos personales. Para operar la plataforma usamos proveedores tecnológicos como servicios
          de hosting, base de datos, autenticación, repositorios de código, correo o infraestructura de despliegue.
          Dichos proveedores actúan como encargados o prestadores tecnológicos bajo sus propios términos y medidas
          de seguridad. También podremos compartir información cuando sea requerido por autoridad competente o para
          proteger derechos, seguridad y continuidad del servicio.
        </P>
        <H>7. Conservación y eliminación</H>
        <P>
          Conservamos la información mientras la cuenta del negocio esté activa y durante el tiempo necesario para
          soporte, cumplimiento legal, prevención de fraude, aclaraciones o respaldo operativo. Si un negocio se
          elimina desde el panel superadmin, se desactivan sus accesos y el negocio queda archivado; los datos no se
          destruyen inmediatamente para preservar histórico, auditoría y recuperación ante errores. La eliminación
          definitiva puede solicitarse por correo y se evaluará conforme a obligaciones legales y contractuales.
        </P>
        <H>8. Seguridad</H>
        <P>
          Aplicamos medidas razonables de seguridad administrativa, técnica y lógica: autenticación por usuario,
          separación por negocio, permisos por rol, políticas de acceso a base de datos, conexiones cifradas y uso
          de proveedores de nube. Ningún sistema es infalible; el Cliente empresarial también debe proteger sus
          contraseñas, dispositivos y accesos de empleados.
        </P>
        <H>9. Derechos ARCO y revocación</H>
        <P>
          Las personas titulares pueden solicitar acceso, rectificación, cancelación u oposición al tratamiento de
          sus datos, así como revocar su consentimiento, escribiendo a {CONTACT_EMAIL}. La solicitud debe incluir
          nombre, medio de respuesta, identificación razonable del titular, descripción clara del derecho que desea
          ejercer y, cuando aplique, documentos que acrediten representación. Los clientes finales también pueden
          acudir directamente al negocio que capturó sus datos.
        </P>
        <H>10. Cookies, almacenamiento local y analítica</H>
        <P>
          Jack puede usar cookies técnicas, almacenamiento local del navegador y mecanismos equivalentes para mantener
          sesión, recordar preferencias, mejorar rendimiento y proteger el acceso. No usamos estos mecanismos para
          vender datos personales a terceros.
        </P>
        <H>11. Menores de edad</H>
        <P>
          Jack está dirigido a negocios y usuarios laborales. No está diseñado para que menores creen cuentas. Si un
          negocio atiende a menores como clientes finales, el negocio debe obtener las autorizaciones que correspondan
          de padres, madres o tutores conforme a su actividad y legislación aplicable.
        </P>
        <H>12. Cambios al aviso</H>
        <P>
          Podemos actualizar este aviso para reflejar cambios legales, técnicos o comerciales. La versión vigente se
          publicará en esta página con fecha de actualización. El uso posterior del sistema implica conocimiento de
          la versión publicada.
        </P>
      </LegalShell>
    );
  }

  return (
    <LegalShell title="Términos de servicio">
      <P>
        Estos términos regulan el uso de Jack, sistema de gestión empresarial para negocios de servicios, operado por
        {" "}{PROVIDER}. Al acceder o usar Jack, el negocio contratante, sus administradores y usuarios autorizados
        aceptan estos términos. Si existe una propuesta, contrato, cotización u orden de servicio firmada, ese documento
        complementa estos términos y prevalece en condiciones comerciales específicas.
      </P>
      <H>1. Descripción del servicio</H>
      <P>
        Jack permite administrar agenda, citas, reservaciones web, clientes, empleados, servicios, precios, catálogo,
        proveedores, ventas internas, estados de cobro, corte de caja, estadísticas operativas y exportaciones. El
        sistema está pensado para negocios de servicios que requieren control interno y seguimiento diario. No sustituye
        asesoría fiscal, contable, legal, médica ni administrativa especializada.
      </P>
      <H>2. Funciones no incluidas en el producto actual</H>
      <P>
        Salvo contratación futura expresa, Jack no incluye procesamiento real de pagos, anticipos por Mercado Pago,
        WhatsApp automático mediante API, recordatorios automáticos, suscripciones cobradas desde la app, respaldos
        gestionados desde la app, integraciones externas completas, sitio web personalizado por cliente, reportes
        contables avanzados ni monitoreo/SLA comercial formal. WhatsApp opera de forma manual mediante enlaces wa.me.
      </P>
      <H>3. Cuentas y acceso restringido</H>
      <P>
        El acceso a Jack es privado. No existe registro público abierto. Las cuentas son creadas por el Proveedor o por
        un administrador autorizado del negocio. El Cliente empresarial es responsable de definir qué empleados acceden,
        revisar permisos, retirar usuarios que ya no laboren en el negocio y proteger credenciales.
      </P>
      <H>4. Responsabilidades del Cliente empresarial</H>
      <P>
        El Cliente empresarial debe capturar información verdadera, mantener actualizados horarios, servicios y precios,
        atender sus reservaciones, confirmar directamente con sus clientes cuando sea necesario, cumplir obligaciones
        fiscales y laborales, respetar derechos de consumidores y obtener los consentimientos necesarios para tratar
        datos personales de sus clientes finales.
      </P>
      <H>5. Uso aceptable</H>
      <P>
        Está prohibido usar Jack para actividades ilícitas, fraudulentas, abusivas, invasivas o que vulneren derechos de
        terceros; intentar acceder a datos de otros negocios; interferir con la seguridad del sistema; compartir cuentas
        entre personas no autorizadas; cargar malware; hacer ingeniería inversa no permitida; o revender el sistema sin
        autorización escrita del Proveedor.
      </P>
      <H>6. Datos del negocio</H>
      <P>
        La información operativa capturada por el Cliente empresarial pertenece al Cliente empresarial. Jack la procesa
        para prestar el servicio, generar vistas, reportes y exportaciones, y brindar soporte. El tratamiento de datos
        personales se rige por el <a href="/privacidad">Aviso de privacidad</a>.
      </P>
      <H>7. Pagos internos, ventas y corte de caja</H>
      <P>
        Los módulos de estado de cobro, ventas y corte de caja son herramientas de control interno. No procesan pagos
        bancarios, no emiten comprobantes fiscales, no calculan impuestos definitivos y no reemplazan sistemas contables
        certificados. El Cliente empresarial debe validar sus números y cumplir sus obligaciones fiscales con sus propios
        asesores.
      </P>
      <H>8. Reservaciones web</H>
      <P>
        La página pública de reservas permite recibir solicitudes de cita. El Cliente empresarial debe revisar agenda,
        confirmar disponibilidad real, contactar al cliente cuando proceda y mantener actualizada su configuración de
        horarios, empleados y servicios. Jack puede aplicar validaciones técnicas, pero la operación final del servicio
        corresponde al negocio.
      </P>
      <H>9. Soporte y disponibilidad</H>
      <P>
        El Proveedor procurará mantener Jack disponible y corregir fallas razonablemente reportadas. El servicio depende
        de infraestructura de terceros como hosting, base de datos, autenticación, navegador, conexión a internet y
        dispositivos del usuario. Pueden existir interrupciones por mantenimiento, fallas externas, cambios de proveedor
        o eventos fuera del control razonable del Proveedor.
      </P>
      <H>10. Cambios, mejoras y mantenimiento</H>
      <P>
        Jack puede recibir actualizaciones de seguridad, rendimiento, diseño o funcionalidad. Algunas funciones pueden
        cambiar, reorganizarse o retirarse si no forman parte del producto activo. El Proveedor buscará no afectar datos
        existentes y documentar cambios relevantes cuando correspondan.
      </P>
      <H>11. Suspensión o eliminación de negocios</H>
      <P>
        El Proveedor puede suspender o eliminar operativamente un negocio por solicitud del Cliente empresarial, falta de
        pago acordada fuera de la app, uso indebido, riesgo de seguridad, incumplimiento de estos términos o requerimiento
        legal. La eliminación operativa desactiva accesos y reservas públicas, conservando histórico mientras sea necesario
        para soporte, recuperación, auditoría o cumplimiento.
      </P>
      <H>12. Propiedad intelectual</H>
      <P>
        Jack, su código, diseño, marca, estructura, textos técnicos, modelos de datos y componentes son propiedad del
        Proveedor o de sus licenciantes. El Cliente empresarial recibe una licencia limitada, no exclusiva, no transferible
        y revocable para usar el sistema durante la vigencia de su contratación.
      </P>
      <H>13. Limitación de responsabilidad</H>
      <P>
        En la medida permitida por la ley, Jack se proporciona como herramienta de apoyo operativo. El Proveedor no será
        responsable por pérdidas derivadas de capturas incorrectas, mala administración del negocio, errores de empleados,
        decisiones comerciales, incumplimientos fiscales/legales del Cliente, fallas de terceros o interrupciones fuera de
        su control. La responsabilidad total del Proveedor, si existiera, se limitará al monto efectivamente pagado por el
        Cliente empresarial por el servicio en los tres meses previos al evento reclamado.
      </P>
      <H>14. Legislación y jurisdicción</H>
      <P>
        Estos términos se interpretan conforme a las leyes aplicables de México. Para cualquier controversia, las partes
        procurarán primero una solución amistosa. Si no se resuelve, se someten a los tribunales competentes de {JURISDICTION},
        salvo que una norma de orden público establezca otra jurisdicción obligatoria.
      </P>
      <H>15. Contacto</H>
      <P>
        Para soporte, aclaraciones legales o solicitudes relacionadas con estos términos, escribe a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
  );
}
