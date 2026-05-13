const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'LEAD_NOTIFY_EMAIL',
  'RESEND_FROM_EMAIL'
];

const needLabels = {
  leads: 'Captar más clientes',
  whatsapp: 'Ordenar mensajes de WhatsApp',
  sales: 'Aumentar ventas',
  automation: 'Automatizar seguimiento'
};

export default async function handler(request, response) {
  if (request.method === 'GET') {
    return response.status(200).json({
      ok: true,
      route: '/api/contact',
      configured: requiredEnv.every((key) => Boolean(process.env[key]))
    });
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Método no permitido.' });
  }

  const missingEnv = requiredEnv.filter((key) => !process.env[key]);

  if (missingEnv.length) {
    return response.status(500).json({
      message: 'El formulario no está configurado en el servidor.',
      missing: missingEnv
    });
  }

  try {
    const input = normalizeInput(request.body);

    if (input.website) {
      return response.status(200).json({ ok: true });
    }

    const validationError = validateLead(input);

    if (validationError) {
      return response.status(400).json({ message: validationError });
    }

    const scoredLead = {
      ...input,
      needLabel: needLabels[input.need],
      ...scoreLead(input),
      source: 'automaitech-home',
      createdAt: new Date().toISOString()
    };

    await saveLead(scoredLead);

    try {
      await sendNotification(scoredLead);
    } catch (error) {
      console.error('Email notification failed:', error);
      return response.status(502).json({
        message: 'El lead se guardó, pero no se pudo enviar el correo de notificación.',
        provider: 'resend'
      });
    }

    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error('Lead form failed:', error);
    return response.status(500).json({
      message: 'No se pudo guardar el lead. Revisa la configuración de Supabase.',
      provider: 'supabase'
    });
  }
}

function normalizeInput(body) {
  return {
    name: clean(body?.name),
    phone: clean(body?.phone),
    business: clean(body?.business),
    businessType: clean(body?.businessType),
    need: clean(body?.need),
    urgency: clean(body?.urgency),
    message: clean(body?.message),
    website: clean(body?.website)
  };
}

function clean(value) {
  return String(value || '').trim().slice(0, 1200);
}

function validateLead(input) {
  if (!input.name || input.name.length < 2) return 'Escribe tu nombre.';
  if (!input.phone || input.phone.length < 7) return 'Escribe un WhatsApp válido.';
  if (!input.business || input.business.length < 2) return 'Escribe el nombre de tu negocio.';
  if (!input.businessType) return 'Selecciona el tipo de negocio.';
  if (!needLabels[input.need]) return 'Selecciona una necesidad válida.';
  if (!['high', 'medium', 'low'].includes(input.urgency)) return 'Selecciona una urgencia válida.';
  return '';
}

function scoreLead(input) {
  let score = 25;
  const reasons = [];

  if (input.urgency === 'high') {
    score += 35;
    reasons.push('Necesita resolver esta semana');
  } else if (input.urgency === 'medium') {
    score += 20;
    reasons.push('Quiere resolver este mes');
  } else {
    score += 8;
    reasons.push('Está evaluando opciones');
  }

  if (['leads', 'sales', 'automation'].includes(input.need)) {
    score += 25;
    reasons.push('La necesidad impacta ventas o seguimiento');
  } else {
    score += 15;
    reasons.push('Busca ordenar conversaciones');
  }

  const messageLength = input.message.length;

  if (messageLength > 60) {
    score += 15;
    reasons.push('Explicó su problema con contexto');
  }

  const priority = score >= 75 ? 'Alta' : score >= 55 ? 'Media' : 'Baja';

  return {
    score,
    priority,
    reasons
  };
}

async function saveLead(lead) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/leads`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      name: lead.name,
      phone: lead.phone,
      business: lead.business,
      business_type: lead.businessType,
      need: lead.need,
      need_label: lead.needLabel,
      urgency: lead.urgency,
      message: lead.message,
      score: lead.score,
      priority: lead.priority,
      reasons: lead.reasons,
      source: lead.source
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase error: ${details}`);
  }
}

async function sendNotification(lead) {
  const subject = `Nuevo lead ${lead.priority}: ${lead.business}`;
  const whatsapp = normalizePhone(lead.phone);
  const whatsappUrl = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(buildWhatsAppMessage(lead))}`
    : '';

  const html = `
    <h2>Nuevo lead desde Automaitech</h2>
    <p><strong>Prioridad:</strong> ${escapeHtml(lead.priority)} (${lead.score} pts)</p>
    <p><strong>Nombre:</strong> ${escapeHtml(lead.name)}</p>
    <p><strong>WhatsApp:</strong> ${escapeHtml(lead.phone)}</p>
    <p><strong>Negocio:</strong> ${escapeHtml(lead.business)}</p>
    <p><strong>Tipo:</strong> ${escapeHtml(lead.businessType)}</p>
    <p><strong>Necesidad:</strong> ${escapeHtml(lead.needLabel)}</p>
    <p><strong>Urgencia:</strong> ${escapeHtml(lead.urgency)}</p>
    <p><strong>Comentario:</strong> ${escapeHtml(lead.message || 'Sin comentario')}</p>
    <p><strong>Motivos:</strong> ${escapeHtml(lead.reasons.join(', '))}</p>
    ${whatsappUrl ? `<p><a href="${whatsappUrl}">Abrir conversación en WhatsApp</a></p>` : ''}
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: process.env.LEAD_NOTIFY_EMAIL,
      subject,
      html
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend error: ${details}`);
  }
}

function normalizePhone(phone) {
  return phone.replace(/[^\d]/g, '');
}

function buildWhatsAppMessage(lead) {
  return [
    `Hola ${lead.name}, soy de Automaitech.`,
    `Vi que ${lead.business} quiere ${lead.needLabel.toLowerCase()}.`,
    'Creo que una landing inteligente puede ayudarte a captar y priorizar prospectos por WhatsApp.',
    '¿Te parece si revisamos el alcance en 15 minutos?'
  ].join(' ');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
