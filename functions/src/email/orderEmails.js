/**
 * EMAIL: transporteur + triggers de commande
 *
 * - onOrderCreated: email admin + client a la creation
 * - onOrderUpdated: email client au paiement confirme et a l'expedition
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { GMAIL_EMAIL, GMAIL_PASSWORD } = require('../../helpers/secrets');
const { getSiteUrl } = require('../../helpers/config');
const { generateInvoiceBuffer } = require('../utils/generateInvoicePDF');

const GOOGLE_REVIEW_URL = 'https://g.page/r/CepCisGcSHS2EAE/review';

function isProductionProject() {
    return process.env.GCLOUD_PROJECT === 'tousatable-client'
        || process.env.GCP_PROJECT === 'tousatable-client';
}

function getAdminOrderRecipients(adminEmail) {
    const recipients = [adminEmail].filter(Boolean);
    if (isProductionProject() && !recipients.includes('tousatablemadeinnormandie@gmail.com')) {
        recipients.push('tousatablemadeinnormandie@gmail.com');
    }
    return recipients.join(', ');
}

function createTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: GMAIL_EMAIL.value(),
            pass: GMAIL_PASSWORD.value()
        }
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatPrice(value) {
    const amount = Number(value || 0);
    return `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`;
}

function formatPriceHtml(value) {
    return escapeHtml(formatPrice(value)).replace(/\s\u20ac$/, '&nbsp;&euro;');
}

function getPrimaryItem(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const primary = items[0] || {};
    const name = primary.name || 'votre meuble';
    const price = primary.price ?? order.total ?? 0;

    return {
        name,
        price,
        quantity: primary.quantity || 1,
        label: items.length > 1 ? `${name} + ${items.length - 1} autre article${items.length > 2 ? 's' : ''}` : name
    };
}

function getClientEmail(order) {
    return order.shipping?.email || order.userEmail || null;
}

function getShippingAddress(shipping = {}) {
    const line = [shipping.address, shipping.zip || shipping.postalCode, shipping.city]
        .filter(Boolean)
        .join(', ');
    return line || 'Non spécifiée';
}

function renderItemsRows(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) {
        return `
            <tr>
                <td style="padding: 16px 0; color: #78716c; font-size: 14px;">Article non spécifié</td>
                <td align="right" style="padding: 16px 0; color: #1c1917; font-size: 14px; font-weight: 700; white-space: nowrap;">${formatPriceHtml(order.total)}</td>
            </tr>
        `;
    }

    return items.map((item) => `
        <tr>
            <td style="padding: 16px 0; border-bottom: 1px solid #ebe5dc;">
                <div style="font-size: 15px; line-height: 22px; color: #1c1917; font-weight: 700;">${escapeHtml(item.name || 'Article')}</div>
                <div style="font-size: 12px; line-height: 18px; color: #78716c; margin-top: 2px;">Quantité : ${escapeHtml(item.quantity || 1)}</div>
            </td>
            <td align="right" style="padding: 16px 0; border-bottom: 1px solid #ebe5dc; color: #1c1917; font-size: 15px; font-weight: 800; white-space: nowrap;">${formatPriceHtml(item.price)}</td>
        </tr>
    `).join('');
}

function renderDetailRow(label, value) {
    return `
        <tr>
            <td style="padding: 7px 0; color: #78716c; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;">${escapeHtml(label)}</td>
            <td align="right" style="padding: 7px 0; color: #1c1917; font-size: 14px; line-height: 20px; font-weight: 700;">${escapeHtml(value || '-')}</td>
        </tr>
    `;
}

function renderEmailShell({ eyebrow, title, intro, children, ctaHref, ctaLabel, footerNote }) {
    return `
        <!doctype html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="margin:0; padding:0; background:#f4f0e8; font-family: Georgia, 'Times New Roman', serif; color:#1c1917;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f0e8; padding:24px 10px;">
                <tr>
                    <td align="center">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px; background:#ffffff; border-radius:28px; overflow:hidden; border:1px solid #e7dfd2;">
                            <tr>
                                <td style="padding:32px 24px 24px; background:#1c1917;">
                                    <div style="font-family: Arial, sans-serif; color:#d6b98c; font-size:11px; letter-spacing:0.22em; text-transform:uppercase; font-weight:800;">${escapeHtml(eyebrow)}</div>
                                    <h1 style="margin:14px 0 0; color:#fffaf2; font-size:30px; line-height:36px; font-weight:700;">${escapeHtml(title)}</h1>
                                    <p style="margin:14px 0 0; color:#d6d3d1; font-family: Arial, sans-serif; font-size:15px; line-height:24px;">${escapeHtml(intro)}</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:24px;">
                                    ${children}
                                    ${ctaHref ? `
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;">
                                            <tr>
                                                <td align="center">
                                                    <a href="${escapeHtml(ctaHref)}" style="display:inline-block; background:#1c1917; color:#fffaf2; text-decoration:none; font-family:Arial,sans-serif; font-size:12px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; padding:15px 22px; border-radius:999px;">${escapeHtml(ctaLabel)}</a>
                                                </td>
                                            </tr>
                                        </table>
                                    ` : ''}
                                    <p style="margin:24px 0 0; color:#78716c; font-family:Arial,sans-serif; font-size:12px; line-height:20px; text-align:center;">${escapeHtml(footerNote || 'À très vite, l’équipe Tous à Table Made in Normandie.')}</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;
}

function renderOrderSummaryCard(order) {
    return `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbfaf7; border:1px solid #ebe5dc; border-radius:22px; padding:0 18px;">
            ${renderItemsRows(order)}
            <tr>
                <td style="padding:18px 0; color:#57534e; font-family:Arial,sans-serif; font-size:12px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase;">Total</td>
                <td align="right" style="padding:18px 0 18px 14px; color:#1c1917; font-size:24px; line-height:28px; font-weight:800; white-space:nowrap; min-width:118px;">${formatPriceHtml(order.total)}</td>
            </tr>
        </table>
    `;
}

function renderShippingCard(order) {
    const shipping = order.shipping || {};
    return `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px; background:#ffffff; border:1px solid #ebe5dc; border-radius:22px; padding:16px 18px;">
            ${renderDetailRow('Nom', shipping.fullName)}
            ${renderDetailRow('Email', shipping.email || order.userEmail)}
            ${renderDetailRow('Téléphone', shipping.phone)}
            ${renderDetailRow('Adresse', getShippingAddress(shipping))}
            ${renderDetailRow('Pays', shipping.country || 'France')}
        </table>
    `;
}

async function sendNewOrderEmails(orderId, order) {
    const adminEmail = GMAIL_EMAIL.value();
    if (!adminEmail) {
        console.error('Email non configure (GMAIL_EMAIL manquant).');
        return;
    }

    const transporter = createTransporter();
    const clientEmail = getClientEmail(order);
    const siteUrl = getSiteUrl();
    const primaryItem = getPrimaryItem(order);
    const productTitle = primaryItem.label;
    const productPrice = formatPrice(primaryItem.price);
    const shipping = order.shipping || {};
    const isDeferred = order.paymentMethod === 'deferred' || order.paymentMethod === 'manual' || order.status === 'pending_payment';
    const paymentLabel = order.paymentMethod === 'stripe' || order.paymentMethod === 'stripe_elements' || order.status === 'paid'
        ? 'Paiement carte confirmé'
        : 'Paiement différé à finaliser';

    const adminMailOptions = {
        from: `Commerce Bot <${adminEmail}>`,
        to: getAdminOrderRecipients(adminEmail),
        subject: `Nouvelle commande - ${productTitle} - ${formatPrice(order.total)}`,
        html: `
            <h2>Nouvelle commande reçue</h2>
            <p><b>Produit :</b> ${escapeHtml(productTitle)} (${productPrice})</p>
            <p><b>Client :</b> ${escapeHtml(shipping.fullName || 'inconnu')} (${escapeHtml(clientEmail || 'email manquant')})</p>
            <p><b>Téléphone :</b> ${escapeHtml(shipping.phone || '-')}</p>
            <p><b>Total :</b> ${formatPrice(order.total)}</p>
            <p><b>Paiement :</b> ${escapeHtml(paymentLabel)}</p>
            <hr/>
            <h3>Articles</h3>
            <ul>${(order.items || []).map(item => `<li>${escapeHtml(item.quantity || 1)}x <b>${escapeHtml(item.name || 'Article')}</b> - ${formatPrice(item.price)}</li>`).join('')}</ul>
            <hr/>
            <h3>Livraison</h3>
            <p>${escapeHtml(getShippingAddress(shipping))}</p>
            <p><a href="${siteUrl}/admin">Aller au Dashboard</a></p>
        `
    };

    let invoiceAttachment = null;
    try {
        const pdfBuffer = generateInvoiceBuffer(order);
        const formatId = (order.id || orderId || '').slice(0, 8).toUpperCase() || 'N-A';
        invoiceAttachment = {
            filename: `Facture_${formatId}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
        };
        adminMailOptions.attachments = [invoiceAttachment];
    } catch (err) {
        console.error("Erreur lors de la génération de la facture PDF pour l'email:", err);
    }

    const paymentBlock = isDeferred ? `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px; background:#fff7e6; border:1px solid #f0d7a2; border-radius:22px; padding:18px;">
            <tr>
                <td>
                    <div style="font-family:Arial,sans-serif; font-size:11px; letter-spacing:0.16em; text-transform:uppercase; font-weight:800; color:#9a5f16;">Paiement à finaliser</div>
                    <p style="margin:8px 0 0; color:#5f3d16; font-family:Arial,sans-serif; font-size:14px; line-height:22px;">Les coordonnées de paiement par virement IBAN ou Wero sont disponibles dans votre espace <b>Mes commandes</b>.</p>
                </td>
            </tr>
        </table>
    ` : '';

    const clientMailOptions = clientEmail ? {
        from: `Tous à Table Made in Normandie <${adminEmail}>`,
        to: clientEmail,
        subject: `Merci pour votre commande - ${productTitle} - ${formatPrice(order.total)}`,
        html: renderEmailShell({
            eyebrow: 'Commande confirmée',
            title: `Merci pour votre commande ${productTitle}`,
            intro: `Nous avons bien reçu votre commande ${productTitle} au prix de ${formatPrice(order.total)}.`,
            ctaHref: `${siteUrl}/mes-commandes`,
            ctaLabel: 'Voir ma commande',
            footerNote: 'Votre récapitulatif reste disponible dans votre espace Mes commandes.',
            children: `
            <p style="margin:0 0 18px; color:#44403c; font-family:Arial,sans-serif; font-size:15px; line-height:24px;">Bonjour ${escapeHtml(shipping.fullName || '')}, voici le récapitulatif complet de votre commande.</p>
                ${renderOrderSummaryCard(order)}
                ${paymentBlock}
                ${renderShippingCard(order)}
            `
        }),
        attachments: invoiceAttachment ? [invoiceAttachment] : []
    } : null;

    try {
        await transporter.sendMail(adminMailOptions);
        console.log('Email admin nouvelle commande envoye.');
        if (clientMailOptions) {
            await transporter.sendMail(clientMailOptions);
            console.log('Email client nouvelle commande envoye.');
        }
    } catch (e) {
        console.error('Erreur envoi email commande:', e);
    }
}

function renderShippingEmail(order) {
    const shipping = order.shipping || {};
    const primaryItem = getPrimaryItem(order);
    const productTitle = primaryItem.label;

    return renderEmailShell({
        eyebrow: 'En cours de livraison',
        title: `Votre commande ${productTitle} vient d'être expédiée`,
        intro: `Votre commande ${productTitle} - ${formatPrice(order.total)} a été confiée au transporteur.`,
        ctaHref: null,
        ctaLabel: null,
        footerNote: 'Merci pour votre confiance. L’équipe Tous à Table Made in Normandie reste disponible si besoin.',
        children: `
            <p style="margin:0 0 18px; color:#44403c; font-family:Arial,sans-serif; font-size:15px; line-height:24px;">Bonjour ${escapeHtml(shipping.fullName || '')}, votre meuble quitte l'atelier et entre dans la phase transport.</p>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px; background:#ecfdf5; border:1px solid #bbf7d0; border-radius:22px; padding:20px;">
                <tr>
                    <td>
                        <div style="font-family:Arial,sans-serif; font-size:16px; line-height:22px; font-weight:800; color:#065f46;">Information transporteur</div>
                        <div style="margin:14px 0 8px; display:inline-block; background:#047857; color:#ffffff; border-radius:999px; padding:9px 14px; font-family:Arial,sans-serif; font-size:18px; line-height:22px; font-weight:800; white-space:nowrap;">7 à 14 jours</div>
                        <p style="margin:8px 0 0; color:#047857; font-family:Arial,sans-serif; font-size:14px; line-height:22px;">Veuillez compter ce délai selon le transporteur, sa tournée et les conditions d'accès au lieu de livraison. Le transporteur peut vous contacter pour confirmer le créneau de passage.</p>
                        ${order.trackingNumber ? `<p style="margin:14px 0 0; color:#065f46; font-family:Arial,sans-serif; font-size:14px; line-height:22px;">Numéro de suivi : <b>${escapeHtml(order.trackingNumber)}</b></p>` : ''}
                    </td>
                </tr>
            </table>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;">
                <tr>
                    <td align="center" style="font-family:Arial,sans-serif; font-size:16px; line-height:22px; font-weight:800; color:#1c1917;">
                        Votre retour compte !
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding-top:8px; font-family:Arial,sans-serif; font-size:24px; line-height:26px;">
                        👇
                    </td>
                </tr>
            </table>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;">
                <tr>
                    <td align="center">
                        <a href="${escapeHtml(GOOGLE_REVIEW_URL)}" style="display:inline-block; background:#1c1917; color:#fffaf2; text-decoration:none; font-family:Arial,sans-serif; font-size:12px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; padding:15px 22px; border-radius:999px;">Laisser un avis Google</a>
                    </td>
                </tr>
            </table>
        `
    });
}

exports.onOrderCreated = functions.runWith({ secrets: [GMAIL_EMAIL, GMAIL_PASSWORD] }).firestore
    .document('orders/{orderId}')
    .onCreate(async (snap, context) => {
        console.log('onOrderCreated triggered:', context.params.orderId);
        const order = snap.data();

        if (order.paymentMethod === 'stripe_elements' && order.status === 'pending_payment') {
            console.log('Commande Stripe Elements en attente de paiement, email reporte.');
            return;
        }

        await sendNewOrderEmails(context.params.orderId, order);
    });

exports.onOrderUpdated = functions.runWith({ secrets: [GMAIL_EMAIL, GMAIL_PASSWORD] }).firestore
    .document('orders/{orderId}')
    .onUpdate(async (change, context) => {
        const orderBefore = change.before.data();
        const orderAfter = change.after.data();
        const orderId = context.params.orderId;

        if (orderBefore.status === 'pending_payment' && orderAfter.status === 'paid') {
            console.log(`Paiement confirme pour la commande ${orderId}. Envoi de l email de confirmation.`);
            await sendNewOrderEmails(orderId, orderAfter);
        }

        if (orderAfter.status === 'shipped' && orderBefore.status !== 'shipped') {
            const clientEmail = getClientEmail(orderAfter);
            if (!clientEmail) return null;

            const adminEmail = GMAIL_EMAIL.value();
            const transporter = createTransporter();
            const primaryItem = getPrimaryItem(orderAfter);

            try {
                await transporter.sendMail({
                    from: `Tous à Table Made in Normandie <${adminEmail}>`,
                    to: clientEmail,
                    subject: `Votre commande ${primaryItem.label} est en cours de livraison`,
                    html: renderShippingEmail(orderAfter)
                });
                console.log('Email client expedition envoye.');
            } catch (e) {
                console.error('Erreur envoi email expedition:', e);
            }
        }

        return null;
    });
