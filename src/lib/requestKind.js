// Which way a delivery runs. `send` is the original flow: the requester is
// at the pickup and hands the package over. `pickup` reverses it: a named
// contact hands over and the requester waits at the dropoff.
import { normalizePhone } from './phone.js'

export const REQUEST_KINDS = [
  { value: 'send', label: 'Deliver' },
  { value: 'pickup', label: 'Pick Up' },
]

// Returns a message to show, or null when the contact is usable.
// US mobiles only: the PIN goes out by SMS, and Twilio's A2P campaign is
// registered for US traffic.
export function pickupContactError({ name, phone }) {
  const trimmed = (name || '').trim()
  if (!trimmed) return 'Who is handing it over?'
  if (trimmed.length > 80) return 'Name is too long.'
  if (!/^\+1\d{10}$/.test(normalizePhone(phone))) return 'Enter a 10-digit US mobile number.'
  return null
}

// What the requester sees under "Pickup code" once a courier has accepted,
// keyed by delivery_pickup_contacts.sms_status.
export function contactStatusCopy(contactName, smsStatus) {
  if (smsStatus === 'sent') return `We texted ${contactName} the pickup PIN and your courier's name.`
  if (smsStatus === 'failed') return `The text to ${contactName} didn't go through. Give ${contactName} this PIN yourself.`
  return `Texting ${contactName}…`
}
