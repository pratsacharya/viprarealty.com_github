/**
 * Notifications. SMS via MSG91 (fill MSG91_AUTHKEY to activate).
 * Email is left as a stub — wire nodemailer with Hostinger SMTP when ready,
 * so enquiry alerts reach MASTER_EMAIL reliably.
 */
async function sendSms(mobile, message) {
  if (!process.env.MSG91_AUTHKEY) return false; // not configured
  let m = String(mobile).replace(/[^0-9]/g, '');
  if (m.length === 10) m = '91' + m;
  try {
    const res = await fetch('https://api.msg91.com/api/v2/sendsms', {
      method: 'POST',
      headers: { 'authkey': process.env.MSG91_AUTHKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: process.env.MSG91_SENDER || 'VIPRAR',
        route: '4', country: '91',
        sms: [{ message, to: [m] }],
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('SMS error', e.message);
    return false;
  }
}

async function notifyMasterEnquiry({ name, mobile, requirement, propLabel }) {
  // TODO: send a real email to process.env.MASTER_EMAIL via nodemailer + Hostinger SMTP,
  // and a WhatsApp template to ADMIN_WHATSAPP via the WhatsApp Cloud API.
  const digits = String(mobile).replace(/[^0-9]/g, '');
  console.log(`[enquiry] ${name} / ${mobile} / ${propLabel} — wa.me/91${digits} — ${requirement}`);
  return true;
}

module.exports = { sendSms, notifyMasterEnquiry };
